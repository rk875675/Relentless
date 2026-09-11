-- Referral offer — make an invite's code binding stable (PRD 10.5, Phase 4b).
--
-- The first cut of claim_referral_code swapped code_id in place when the
-- invitee chose the other cadence, and returned the sharer's original code to
-- the pool. Three problems, all found in end-to-end testing:
--
--   1. The invitee's own code string stopped resolving to their invite, so a
--      retry after the swap answered "not valid".
--   2. A released code could be re-reserved by a different sharer. Anyone who
--      still had the old string could then attach themselves to that new
--      sharer's invite — an attribution hijack.
--   3. Each cadence flip allocated a fresh code and freed the old one, so a
--      single authenticated account holding one shared code could drain the
--      pool by flipping repeatedly.
--
-- Fix: code_id becomes an immutable handle — the string the sharer shared,
-- which always resolves to this invite. The code the invitee actually redeems
-- is issued_code_id. Because there are exactly two cadences, the alternate is
-- allocated at most once per invite and remembered in alt_code_id, so
-- flipping back and forth is free and an invite can never consume more than
-- two codes. Nothing is returned to the pool during a claim.

alter table public.referral_invites
  add column if not exists issued_code_id uuid references public.referral_offer_codes(id),
  add column if not exists alt_code_id    uuid references public.referral_offer_codes(id);

comment on column public.referral_invites.code_id is
  'Immutable handle: the code the sharer shared. Always resolves to this invite, even after a cadence swap. Not necessarily the code that gets redeemed.';
comment on column public.referral_invites.issued_code_id is
  'The code this invitee was told to redeem. Equals code_id unless they chose the other cadence. Null until claim.';
comment on column public.referral_invites.alt_code_id is
  'The other-cadence code allocated for this invite, at most one ever. Lets the invitee flip cadence without consuming more codes.';

-- A given code may back at most one invite in each role.
create unique index if not exists referral_invites_issued_code_key
  on public.referral_invites (issued_code_id)
  where issued_code_id is not null;

create unique index if not exists referral_invites_alt_code_key
  on public.referral_invites (alt_code_id)
  where alt_code_id is not null;

-- Claim resolves an invite from either string the invitee could be holding.
create index if not exists idx_referral_invites_alt_code
  on public.referral_invites (alt_code_id)
  where alt_code_id is not null;

-- ============================================================
-- Claim, rewritten around the stable handle.
--
-- Result discriminators:
--   claimed | invalid | self_share | reciprocity_blocked
--   | already_received | pool_empty
-- "invalid" deliberately covers unknown, already-claimed-by-someone-else,
-- lapsed and wrong-type codes alike, so the response never reveals which code
-- system was probed (PRD 10.5.7).
-- ============================================================

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
  v_typed        public.referral_offer_codes%rowtype;
  v_handle       public.referral_offer_codes%rowtype;
  v_alt          public.referral_offer_codes%rowtype;
  v_issued       public.referral_offer_codes%rowtype;
  v_invite       public.referral_invites%rowtype;
  v_claimer_otid text;
  v_is_replay    boolean := false;
begin
  select *
    into v_typed
    from public.referral_offer_codes
   where lower(code) = lower(btrim(p_code))
   for update;

  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;

  -- Either string the invitee could be holding: the one they were sent, or
  -- the one a previous claim issued them.
  select *
    into v_invite
    from public.referral_invites
   where code_id = v_typed.id
      or alt_code_id = v_typed.id
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
    -- before purchase still works, but never open a second invite.
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

  select * into v_handle
    from public.referral_offer_codes
   where id = v_invite.code_id
   for update;

  if v_handle.product_id = p_target_product_id then
    -- Chosen cadence matches what the sharer reserved: redeem the handle.
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
     set issued_code_id                 = v_issued.id,
         invitee_product_id             = v_issued.product_id,
         status                         = 'claimed',
         claimed_by_user_id             = p_user_id,
         claimed_original_transaction_id = v_claimer_otid,
         claimed_at                     = coalesce(claimed_at, now())
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

revoke all on function public.claim_referral_code(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_referral_code(text, uuid, text) to service_role;
