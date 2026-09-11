-- Referral offer — invite creation and invitee claim (PRD 10.5, Phase 4b).
--
-- Both operations are single SQL functions for the same reason the promo
-- redemption is: they allocate a scarce row from a shared pool and enforce a
-- cap, so the check and the write must not be separable. Every pool pick uses
-- FOR UPDATE SKIP LOCKED, so concurrent sharers take different codes instead
-- of blocking or colliding on one.
--
-- SECURITY INVOKER, EXECUTE revoked from anon/authenticated: reachable only
-- through the service role, i.e. only from the referral edge function.

-- ============================================================
-- Which SKU a new subscriber is sold.
--
-- PRD 10.5.4: an invitee is always issued a code for the CURRENT live SKU for
-- their chosen cadence — legacy pricing is never sold to a new subscriber.
-- That mapping lives in flag metadata rather than in code so a pricing change
-- is a data change. Metadata is server-side only; /config exposes key +
-- enabled and deliberately never returns metadata.
-- ============================================================

update public.feature_flags
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'live_products', jsonb_build_object(
           'monthly', 'com.relentless.monthly.b',
           'annual',  'com.relentless.annual.b'
         )
       )
 where key = 'referral_offer_enabled';

-- ============================================================
-- Create one invite: enforce the per-period open-invite cap, reserve a code,
-- and bind it — atomically.
--
-- The cap counts OPEN invites only. An invite that converted or lapsed does
-- not hold a slot, which is what PRD 10.5.7 means by unredeemed invites never
-- burning a period.
-- ============================================================

create or replace function public.create_referral_invite(
  p_sharer_user_id                uuid,
  p_sharer_original_transaction_id text,
  p_sharer_product_id             text,
  p_sharer_period_end             timestamptz,
  p_invitee_product_id            text,
  p_environment                   text,
  p_ttl_days                      int,
  p_max_open                      int
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_open   int;
  v_code   public.referral_offer_codes%rowtype;
  v_invite public.referral_invites%rowtype;
begin
  select count(*)
    into v_open
    from public.referral_invites
   where sharer_original_transaction_id = p_sharer_original_transaction_id
     and status = 'open'
     and sharer_period_end is not distinct from p_sharer_period_end;

  if v_open >= p_max_open then
    return jsonb_build_object('result', 'cap_reached', 'open_invites', v_open);
  end if;

  -- Oldest-expiring code first, so the pool drains in the order it goes stale.
  select *
    into v_code
    from public.referral_offer_codes
   where environment = p_environment
     and product_id = p_invitee_product_id
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
   where id = v_code.id;

  insert into public.referral_invites (
    sharer_user_id, sharer_original_transaction_id, sharer_product_id,
    sharer_period_end, code_id, invitee_product_id, ttl_expires_at
  ) values (
    p_sharer_user_id, p_sharer_original_transaction_id, p_sharer_product_id,
    p_sharer_period_end, v_code.id, p_invitee_product_id,
    now() + make_interval(days => p_ttl_days)
  )
  returning * into v_invite;

  return jsonb_build_object(
    'result',             'created',
    'invite_id',          v_invite.id,
    'code',               v_code.code,
    'invitee_product_id', p_invitee_product_id,
    'ttl_expires_at',     v_invite.ttl_expires_at,
    'apple_expires_at',   v_code.apple_expires_at,
    'open_invites',       v_open + 1
  );
end;
$$;

-- ============================================================
-- Claim: bind an invite to the invitee and hand back the code their device
-- will redeem.
--
-- The cadence swap is the point of this function. A code is reserved when the
-- sharer shares, before the invitee exists, so it carries the sharer's own
-- cadence. PRD 10.5.4 gives the invitee the choice, so if they pick the other
-- cadence the reserved code returns to the pool and one for the chosen SKU is
-- issued in its place. The new code is taken BEFORE the old one is released,
-- so a drained pool can never lose the invite its only code.
--
-- Idempotent: the same invitee re-claiming gets the same answer rather than a
-- second code (PRD 10.5.7).
--
-- Result discriminators:
--   claimed | invalid | self_share | reciprocity_blocked
--   | already_received | pool_empty
-- "invalid" deliberately covers unknown, already-claimed-by-someone-else,
-- lapsed and wrong-type codes alike, so the response never reveals which code
-- system was probed (PRD 10.5.7).
-- ============================================================

create or replace function public.claim_referral_code(
  p_code               text,
  p_user_id            uuid,
  p_target_product_id  text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code       public.referral_offer_codes%rowtype;
  v_new_code   public.referral_offer_codes%rowtype;
  v_invite     public.referral_invites%rowtype;
  v_claimer_otid text;
  v_is_replay  boolean := false;
begin
  select *
    into v_code
    from public.referral_offer_codes
   where lower(code) = lower(btrim(p_code))
   for update;

  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;

  select *
    into v_invite
    from public.referral_invites
   where code_id = v_code.id
   for update;

  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;

  -- The invitee's own Apple account, when they have ever had one. Usually
  -- null here: the normal invitee has never subscribed.
  select original_transaction_id
    into v_claimer_otid
    from public.entitlements
   where user_id = p_user_id;

  -- Self-share, on either identity (PRD 10.5.7).
  if v_invite.sharer_user_id = p_user_id
     or (v_claimer_otid is not null
         and v_claimer_otid = v_invite.sharer_original_transaction_id) then
    return jsonb_build_object('result', 'self_share');
  end if;

  if v_invite.status = 'claimed' and v_invite.claimed_by_user_id = p_user_id then
    -- Same person, same invite: a replay. Fall through so a cadence change
    -- before purchase still works, but never hand out a second invite.
    v_is_replay := true;
  elsif v_invite.status <> 'open' then
    return jsonb_build_object('result', 'invalid');
  elsif v_invite.ttl_expires_at < now() then
    -- Lapsed and not yet swept. Indistinguishable from unknown, on purpose.
    return jsonb_build_object('result', 'invalid');
  end if;

  -- Pairwise reciprocity is permanently blocked: if this claimer has ever
  -- been the sharer for this invite's sharer, they can never receive from
  -- them (PRD 10.5.7).
  if exists (
    select 1
      from public.referral_invites r
     where r.sharer_user_id = p_user_id
       and r.claimed_by_user_id = v_invite.sharer_user_id
       and r.claimed_by_user_id is not null
  ) then
    return jsonb_build_object('result', 'reciprocity_blocked');
  end if;

  -- One inbound receive per Apple account, ever. The partial unique index
  -- referral_rewards_received_once is the real enforcement; this just refuses
  -- early instead of letting them redeem and earn nothing.
  if v_claimer_otid is not null and exists (
    select 1
      from public.referral_rewards
     where original_transaction_id = v_claimer_otid
       and role = 'received'
  ) then
    return jsonb_build_object('result', 'already_received');
  end if;

  -- Cadence swap.
  if v_code.product_id is distinct from p_target_product_id then
    select *
      into v_new_code
      from public.referral_offer_codes
     where environment = v_code.environment
       and product_id = p_target_product_id
       and status = 'available'
       and apple_expires_at > now()
     order by apple_expires_at asc, created_at asc
     for update skip locked
     limit 1;

    if not found then
      return jsonb_build_object('result', 'pool_empty');
    end if;

    update public.referral_offer_codes set status = 'assigned'  where id = v_new_code.id;
    update public.referral_offer_codes set status = 'available' where id = v_code.id;

    v_code := v_new_code;
  end if;

  update public.referral_invites
     set code_id                        = v_code.id,
         invitee_product_id             = v_code.product_id,
         status                         = 'claimed',
         claimed_by_user_id             = p_user_id,
         claimed_original_transaction_id = v_claimer_otid,
         claimed_at                     = coalesce(claimed_at, now())
   where id = v_invite.id;

  return jsonb_build_object(
    'result',           'claimed',
    'replay',           v_is_replay,
    'invite_id',        v_invite.id,
    'code',             v_code.code,
    'product_id',       v_code.product_id,
    'apple_expires_at', v_code.apple_expires_at
  );
end;
$$;

revoke all on function public.create_referral_invite(
  uuid, text, text, timestamptz, text, text, int, int
) from public, anon, authenticated;
revoke all on function public.claim_referral_code(text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_referral_invite(
  uuid, text, text, timestamptz, text, text, int, int
) to service_role;
grant execute on function public.claim_referral_code(text, uuid, text) to service_role;
