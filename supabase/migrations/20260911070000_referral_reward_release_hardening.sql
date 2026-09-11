-- Referral offer — two hardening fixes to reward release (PRD 10.5, Phase 4c).
--
-- 1. Deterministic sharer lookup. The sharer's current period and SKU were
--    read with `where original_transaction_id = ...`, which is not unique:
--    entitlements.user_id is unique but the Apple transaction id is not, so
--    two accounts that have restored the same subscription both match and
--    plpgsql silently takes whichever row comes back first. The invite
--    already records sharer_user_id, which is unique, so prefer it and fall
--    back to an explicitly ordered read only when the account is gone.
--
-- 2. Never write a reward the cap cannot bind. The give cap is a partial
--    unique index on (original_transaction_id, period_end), and Postgres
--    treats NULLs as distinct — so a row with a null period_end is exempt
--    from the one-per-period cap and could be earned again and again. A null
--    period means the sharer had no known billing period, which eligibility
--    should have prevented, so fail closed: the invitee still gets the
--    discount Apple already charged them for, and the sharer's side is
--    reported as skipped rather than written uncapped.
--
-- Result discriminators are unchanged; 'released' gains gave_skipped_reason.

create or replace function public.release_referral_reward(
  p_invitee_user_id         uuid,
  p_original_transaction_id text,
  p_offer_identifier        text,
  p_product_id              text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invite           public.referral_invites%rowtype;
  v_code             public.referral_offer_codes%rowtype;
  v_existing         public.referral_rewards%rowtype;
  v_invitee_product  text;
  v_sharer_expires   timestamptz;
  v_sharer_product   text;
  v_period_end       timestamptz;
  v_sharer_offer     text;
  v_received_created boolean := false;
  v_gave_created     boolean := false;
  v_gave_skipped     text    := null;
  v_rows             int;
begin
  select *
    into v_invite
    from public.referral_invites
   where claimed_by_user_id = p_invitee_user_id
     and status in ('claimed', 'converted')
   order by claimed_at desc nulls last
   limit 1
   for update;

  if not found then
    return jsonb_build_object('result', 'no_invite');
  end if;

  if v_invite.sharer_original_transaction_id = p_original_transaction_id then
    return jsonb_build_object('result', 'self_share');
  end if;

  select *
    into v_code
    from public.referral_offer_codes
   where id = coalesce(v_invite.issued_code_id, v_invite.code_id)
   for update;

  if not found or v_code.offer_reference_name is distinct from p_offer_identifier then
    return jsonb_build_object('result', 'offer_mismatch');
  end if;

  select *
    into v_existing
    from public.referral_rewards
   where original_transaction_id = p_original_transaction_id
     and role = 'received';

  if found and v_existing.invite_id is distinct from v_invite.id then
    return jsonb_build_object('result', 'receive_cap_used');
  end if;

  update public.referral_invites
     set claimed_original_transaction_id =
           coalesce(claimed_original_transaction_id, p_original_transaction_id)
   where id = v_invite.id;

  -- --- invitee side: already applied, by definition -----------------------
  v_invitee_product := coalesce(p_product_id, v_code.product_id);

  insert into public.referral_rewards (
    user_id, original_transaction_id, role, invite_id, product_id,
    offer_identifier, status, applied_at, apple_confirmed_at
  ) values (
    p_invitee_user_id, p_original_transaction_id, 'received', v_invite.id, v_invitee_product,
    p_offer_identifier, 'applied', now(), now()
  )
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_received_created := v_rows > 0;

  -- --- sharer side --------------------------------------------------------
  -- sharer_user_id is unique in entitlements; the Apple transaction id is not.
  if v_invite.sharer_user_id is not null then
    select expires_at, product_id
      into v_sharer_expires, v_sharer_product
      from public.entitlements
     where user_id = v_invite.sharer_user_id;
  end if;

  -- Account deleted: fall back to the transaction id, ordered so the answer
  -- is at least deterministic if more than one row matches.
  if v_sharer_expires is null and v_sharer_product is null then
    select expires_at, product_id
      into v_sharer_expires, v_sharer_product
      from public.entitlements
     where original_transaction_id = v_invite.sharer_original_transaction_id
     order by updated_at desc, user_id
     limit 1;
  end if;

  -- The give slot belongs to the period the charge landed in, not the period
  -- the invite was sent in (PRD 10.5.7).
  v_period_end     := coalesce(v_sharer_expires, v_invite.sharer_period_end);
  v_sharer_product := coalesce(v_sharer_product, v_invite.sharer_product_id);

  select metadata -> 'sharer_offers' ->> v_sharer_product
    into v_sharer_offer
    from public.feature_flags
   where key = 'referral_offer_enabled';

  if v_period_end is null then
    -- Uncappable, so not written at all. Eligibility requires a live period,
    -- so reaching here means something upstream is wrong and worth seeing.
    v_gave_skipped := 'no_billing_period';
  elsif v_sharer_offer is null then
    -- No promotional offer is configured for the SKU the sharer is on, so
    -- there is nothing 4d could sign. Recording a reward we cannot honour
    -- would show the sharer a broken apply action.
    v_gave_skipped := 'no_offer_for_sku';
  else
    insert into public.referral_rewards (
      user_id, original_transaction_id, role, period_end, invite_id, product_id,
      offer_identifier, status, ready_at
    ) values (
      v_invite.sharer_user_id, v_invite.sharer_original_transaction_id, 'gave',
      v_period_end, v_invite.id, v_sharer_product, v_sharer_offer, 'ready', now()
    )
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_gave_created := v_rows > 0;
    if not v_gave_created then
      v_gave_skipped := 'give_slot_already_used';
    end if;
  end if;

  update public.referral_invites
     set status       = 'converted',
         converted_at = coalesce(converted_at, now())
   where id = v_invite.id;

  update public.referral_offer_codes
     set status = 'redeemed'
   where id = v_code.id;

  return jsonb_build_object(
    'result',                  'released',
    'invite_id',               v_invite.id,
    'received_created',        v_received_created,
    'gave_created',            v_gave_created,
    'gave_skipped_reason',     v_gave_skipped,
    'invitee_product_id',      v_invitee_product,
    'sharer_product_id',       v_sharer_product,
    'sharer_offer_identifier', v_sharer_offer,
    'period_end',              v_period_end
  );
end;
$$;

revoke all on function public.release_referral_reward(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.release_referral_reward(uuid, text, text, text) to service_role;
