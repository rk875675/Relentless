-- Redeem-path guards for the one-share-code model.
--
-- 1. Re-entering a share token after this invitee already paid must not mint
--    a second Apple code (that would also burn another cap slot).
-- 2. release_referral_reward must not convert / pay the sharer while the
--    invitee is still on a free trial (PRD 10.5.1 / 10.5.5). Restore and
--    reconcile can see an offerType=3 log row on trial start.

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
  v_invitee_status   text;
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

  select status
    into v_invitee_status
    from public.entitlements
   where user_id = p_invitee_user_id;

  if v_invitee_status = 'trial' then
    return jsonb_build_object('result', 'trial_not_paid');
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

  if v_invite.sharer_user_id is not null then
    select expires_at, product_id
      into v_sharer_expires, v_sharer_product
      from public.entitlements
     where user_id = v_invite.sharer_user_id;
  end if;

  if v_sharer_expires is null and v_sharer_product is null then
    select expires_at, product_id
      into v_sharer_expires, v_sharer_product
      from public.entitlements
     where original_transaction_id = v_invite.sharer_original_transaction_id
     order by updated_at desc, user_id
     limit 1;
  end if;

  v_period_end     := coalesce(v_sharer_expires, v_invite.sharer_period_end);
  v_sharer_product := coalesce(v_sharer_product, v_invite.sharer_product_id);

  select metadata -> 'sharer_offers' ->> v_sharer_product
    into v_sharer_offer
    from public.feature_flags
   where key = 'referral_offer_enabled';

  if v_period_end is null then
    v_gave_skipped := 'no_billing_period';
  elsif v_sharer_offer is null then
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

-- Re-claim after this invitee already converted from this sharer: do not
-- mint another Apple code. claim_referral_code is replaced in a follow-up
-- statement so only the share-token branch changes.
create or replace function public.claim_referral_code(
  p_code              text,
  p_user_id           uuid,
  p_target_product_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token        public.referral_share_tokens%rowtype;
  v_typed        public.referral_offer_codes%rowtype;
  v_handle       public.referral_offer_codes%rowtype;
  v_alt          public.referral_offer_codes%rowtype;
  v_issued       public.referral_offer_codes%rowtype;
  v_invite       public.referral_invites%rowtype;
  v_claimer_otid text;
  v_is_replay    boolean := false;
  v_period_end   timestamptz;
  v_product_id   text;
  v_used         int;
  v_max          int := 5;
  v_ttl          int := 90;
begin
  select coalesce((metadata->>'max_open_invites_per_period')::int, 5),
         coalesce((metadata->>'invite_ttl_days')::int, 90)
    into v_max, v_ttl
    from public.feature_flags
   where key = 'referral_offer_enabled';

  select original_transaction_id
    into v_claimer_otid
    from public.entitlements
   where user_id = p_user_id;

  select *
    into v_token
    from public.referral_share_tokens
   where lower(code) = lower(btrim(p_code))
   for update;

  if found then
    if v_token.user_id = p_user_id
       or (v_claimer_otid is not null
           and v_claimer_otid = v_token.original_transaction_id) then
      return jsonb_build_object('result', 'self_share');
    end if;

    if exists (
      select 1
        from public.referral_invites r
       where r.sharer_user_id = p_user_id
         and r.claimed_by_user_id = v_token.user_id
         and r.claimed_by_user_id is not null
    ) then
      return jsonb_build_object('result', 'reciprocity_blocked');
    end if;

    if v_claimer_otid is not null and exists (
      select 1
        from public.referral_rewards
       where original_transaction_id = v_claimer_otid
         and role = 'received'
    ) then
      return jsonb_build_object('result', 'already_received');
    end if;

    select *
      into v_invite
      from public.referral_invites
     where sharer_user_id = v_token.user_id
       and claimed_by_user_id = p_user_id
       and status in ('claimed', 'converted')
     order by claimed_at desc
     limit 1
     for update;

    if found and v_invite.status = 'converted' then
      return jsonb_build_object('result', 'already_received');
    elsif found then
      v_is_replay := true;
    else
      select expires_at, product_id
        into v_period_end, v_product_id
        from public.entitlements
       where user_id = v_token.user_id;

      select count(*)
        into v_used
        from public.referral_invites
       where sharer_original_transaction_id = v_token.original_transaction_id
         and status in ('open', 'claimed', 'converted')
         and sharer_period_end is not distinct from v_period_end;

      if v_used >= v_max then
        return jsonb_build_object('result', 'invalid');
      end if;

      select *
        into v_issued
        from public.referral_offer_codes
       where environment = v_token.environment
         and product_id = p_target_product_id
         and status = 'available'
         and apple_expires_at > now()
       order by apple_expires_at asc, created_at asc
       for update skip locked
       limit 1;

      if not found then
        return jsonb_build_object('result', 'pool_empty');
      end if;

      update public.referral_offer_codes
         set status = 'assigned'
       where id = v_issued.id;

      insert into public.referral_invites (
        sharer_user_id, sharer_original_transaction_id, sharer_product_id,
        sharer_period_end, code_id, issued_code_id, invitee_product_id,
        status, claimed_by_user_id, claimed_original_transaction_id,
        claimed_at, ttl_expires_at
      ) values (
        v_token.user_id, v_token.original_transaction_id,
        coalesce(v_product_id, p_target_product_id),
        v_period_end, v_issued.id, v_issued.id, v_issued.product_id,
        'claimed', p_user_id, v_claimer_otid,
        now(), now() + make_interval(days => v_ttl)
      )
      returning * into v_invite;

      return jsonb_build_object(
        'result',           'claimed',
        'replay',           false,
        'invite_id',        v_invite.id,
        'code',             v_issued.code,
        'product_id',       v_issued.product_id,
        'apple_expires_at', v_issued.apple_expires_at
      );
    end if;
  else
    select *
      into v_typed
      from public.referral_offer_codes
     where lower(code) = lower(btrim(p_code))
     for update;

    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;

    select *
      into v_invite
      from public.referral_invites
     where code_id = v_typed.id
        or alt_code_id = v_typed.id
     for update;

    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;

    if v_invite.sharer_user_id = p_user_id
       or (v_claimer_otid is not null
           and v_claimer_otid = v_invite.sharer_original_transaction_id) then
      return jsonb_build_object('result', 'self_share');
    end if;

    if v_invite.status = 'claimed' and v_invite.claimed_by_user_id = p_user_id then
      v_is_replay := true;
    elsif v_invite.status <> 'open' then
      return jsonb_build_object('result', 'invalid');
    elsif v_invite.ttl_expires_at < now() then
      return jsonb_build_object('result', 'invalid');
    end if;

    if exists (
      select 1
        from public.referral_invites r
       where r.sharer_user_id = p_user_id
         and r.claimed_by_user_id = v_invite.sharer_user_id
         and r.claimed_by_user_id is not null
    ) then
      return jsonb_build_object('result', 'reciprocity_blocked');
    end if;

    if v_claimer_otid is not null and exists (
      select 1
        from public.referral_rewards
       where original_transaction_id = v_claimer_otid
         and role = 'received'
    ) then
      return jsonb_build_object('result', 'already_received');
    end if;
  end if;

  select * into v_handle
    from public.referral_offer_codes
   where id = v_invite.code_id
   for update;

  if v_handle.product_id = p_target_product_id then
    v_issued := v_handle;
  else
    if v_invite.alt_code_id is not null then
      select * into v_alt
        from public.referral_offer_codes
       where id = v_invite.alt_code_id
       for update;
      if found and v_alt.product_id = p_target_product_id then
        v_issued := v_alt;
      end if;
    end if;

    if v_issued.id is null then
      select *
        into v_alt
        from public.referral_offer_codes
       where environment = v_handle.environment
         and product_id = p_target_product_id
         and status = 'available'
         and apple_expires_at > now()
       order by apple_expires_at asc, created_at asc
       for update skip locked
       limit 1;

      if not found then
        return jsonb_build_object('result', 'pool_empty');
      end if;

      update public.referral_offer_codes
         set status = 'assigned'
       where id = v_alt.id;

      update public.referral_invites
         set alt_code_id = v_alt.id
       where id = v_invite.id;

      v_issued := v_alt;
    end if;
  end if;

  update public.referral_invites
     set issued_code_id                  = v_issued.id,
         invitee_product_id              = v_issued.product_id,
         status                          = 'claimed',
         claimed_by_user_id              = p_user_id,
         claimed_original_transaction_id = v_claimer_otid,
         claimed_at                      = coalesce(claimed_at, now())
   where id = v_invite.id;

  return jsonb_build_object(
    'result',           'claimed',
    'replay',           v_is_replay,
    'invite_id',        v_invite.id,
    'code',             v_issued.code,
    'product_id',       v_issued.product_id,
    'apple_expires_at', v_issued.apple_expires_at
  );
end;
$$;

