-- Referral offer — reward release and the invite TTL sweep (PRD 10.5, Phase 4c).
--
-- Release is triggered by Apple confirming a PAID transaction that carries our
-- offer-code reference name (PRD 10.5.5). A free trial never triggers it: the
-- caller only reaches this function for a non-trial transaction with
-- offerType 3.
--
-- Idempotent by construction. The two caps are partial unique indexes, so a
-- redelivered notification conflicts instead of double-paying, and the
-- function reports what it actually wrote.

-- ============================================================
-- Which promotional offer signs a sharer's discount.
--
-- The sharer's reward is a signed promotional offer on the SKU they are
-- currently subscribed to, including the legacy SKUs — an existing subscriber
-- is never migrated onto new pricing to receive a reward. These four
-- reference names are the ones configured in App Store Connect.
-- ============================================================

update public.feature_flags
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'sharer_offers', jsonb_build_object(
           'com.relentless.monthly',    'SHARER20_MONTHLY',
           'com.relentless.annual',     'SHARER20_ANNUAL',
           'com.relentless.monthly.b',  'SHARER20_MONTHLY_B',
           'com.relentless.annual.b',   'SHARER20_ANNUAL_B'
         )
       )
 where key = 'referral_offer_enabled';

-- ============================================================
-- Release both sides of one conversion.
--
-- Result discriminators:
--   released         — the conversion was attributed; see the created flags
--   no_invite        — this Apple account has no claimed invite (a code
--                      redeemed outside our flow, or already swept)
--   offer_mismatch   — Apple's offer identifier is not the one we issued
--   self_share       — sharer and invitee are the same Apple account
--   receive_cap_used — this Apple account already received a referral reward
--                      from a different invite
-- ============================================================

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
  v_invite          public.referral_invites%rowtype;
  v_code            public.referral_offer_codes%rowtype;
  v_existing        public.referral_rewards%rowtype;
  v_sharer_expires  timestamptz;
  v_sharer_product  text;
  v_period_end      timestamptz;
  v_sharer_offer    text;
  v_received_created boolean := false;
  v_gave_created     boolean := false;
  v_rows            int;
begin
  -- The invite this Apple account's owner claimed. 'converted' is included so
  -- a redelivered notification lands on the same row instead of looking
  -- unattributed.
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

  -- Apple names the batch's reference name, never the individual code
  -- (PRD 10.5.5), so this confirms the conversion used the offer we issued.
  select *
    into v_code
    from public.referral_offer_codes
   where id = coalesce(v_invite.issued_code_id, v_invite.code_id)
   for update;

  if not found or v_code.offer_reference_name is distinct from p_offer_identifier then
    return jsonb_build_object('result', 'offer_mismatch');
  end if;

  -- Receive cap. An existing row for THIS invite is a replay; one for another
  -- invite means the cap is spent and neither side earns again.
  select *
    into v_existing
    from public.referral_rewards
   where original_transaction_id = p_original_transaction_id
     and role = 'received';

  if found and v_existing.invite_id is distinct from v_invite.id then
    return jsonb_build_object('result', 'receive_cap_used');
  end if;

  -- Now that Apple has named the account, record it on the invite. At claim
  -- time the invitee usually had no Apple account at all.
  update public.referral_invites
     set claimed_original_transaction_id =
           coalesce(claimed_original_transaction_id, p_original_transaction_id)
   where id = v_invite.id;

  -- --- invitee side: already applied, by definition -----------------------
  -- Their discount is the redeemed code itself, which Apple has just charged.
  insert into public.referral_rewards (
    user_id, original_transaction_id, role, invite_id, product_id,
    offer_identifier, status, applied_at, apple_confirmed_at
  ) values (
    p_invitee_user_id, p_original_transaction_id, 'received', v_invite.id, p_product_id,
    p_offer_identifier, 'applied', now(), now()
  )
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  v_received_created := v_rows > 0;

  -- --- sharer side: ready to apply ----------------------------------------
  select expires_at, product_id
    into v_sharer_expires, v_sharer_product
    from public.entitlements
   where original_transaction_id = v_invite.sharer_original_transaction_id;

  -- The give slot belongs to the period the charge landed in, not the period
  -- the invite was sent in (PRD 10.5.7). Falls back to the send-time period
  -- if the sharer's current expiry is unknown.
  v_period_end     := coalesce(v_sharer_expires, v_invite.sharer_period_end);
  v_sharer_product := coalesce(v_sharer_product, v_invite.sharer_product_id);

  select metadata -> 'sharer_offers' ->> v_sharer_product
    into v_sharer_offer
    from public.feature_flags
   where key = 'referral_offer_enabled';

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
    'sharer_product_id',       v_sharer_product,
    'sharer_offer_identifier', v_sharer_offer,
    'period_end',              v_period_end
  );
end;
$$;

-- ============================================================
-- TTL sweep: free the sharer's slot, retire the code.
--
-- PRD 10.5.7 scopes the 90-day TTL to SLOT recycling. Only invites still
-- 'open' are swept; a claimed invite keeps its binding so a later conversion
-- still earns a reward, up to the Apple code expiry.
--
-- The code is RETIRED, not returned to the pool. An individual Apple offer
-- code cannot be revoked, so a code that has already been shared stays
-- redeemable until it expires at Apple. Reissuing it to a second sharer would
-- mean two people hold the same string: the first holder could attach
-- themselves to the new sharer's invite, or redeem it at Apple and leave the
-- new invitee's redemption failing. Neither is acceptable, so an exposed code
-- is never reissued.
-- ============================================================

create or replace function public.sweep_referral_invites()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expired int := 0;
  v_retired int := 0;
  v_codes   int := 0;
begin
  with lapsed as (
    update public.referral_invites
       set status = 'expired'
     where status = 'open'
       and ttl_expires_at < now()
    returning code_id
  ), retired as (
    update public.referral_offer_codes c
       set status = 'retired'
      from lapsed l
     where c.id = l.code_id
       and c.status = 'assigned'
    returning c.id
  )
  select (select count(*) from lapsed), (select count(*) from retired)
    into v_expired, v_retired;

  -- Housekeeping so the pool count never advertises codes Apple has expired.
  update public.referral_offer_codes
     set status = 'expired'
   where status = 'available'
     and apple_expires_at <= now();
  get diagnostics v_codes = row_count;

  return jsonb_build_object(
    'invites_expired',      v_expired,
    'codes_retired',        v_retired,
    'stale_codes_expired',  v_codes
  );
end;
$$;

revoke all on function public.release_referral_reward(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.sweep_referral_invites()
  from public, anon, authenticated;

grant execute on function public.release_referral_reward(uuid, text, text, text) to service_role;
grant execute on function public.sweep_referral_invites() to service_role;

-- ============================================================
-- Hourly sweep. Plain SQL, so unlike the other cron jobs in this repo it
-- needs no inlined secret and no edge function.
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'referral-invite-sweep',
  '17 * * * *',
  $$ select public.sweep_referral_invites(); $$
);
