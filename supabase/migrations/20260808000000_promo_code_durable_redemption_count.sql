-- Durable promo redemption counter — closes the delete-account replay loophole.
--
-- Both redemption limits used to be live lookups against promo_code_redemptions:
--   "this code is capped at N uses"  -> select count(*) where promo_code_id = X
--   "this user already redeemed it"  -> select where (promo_code_id, user_id)
--
-- promo_code_redemptions.user_id is ON DELETE CASCADE on profiles, and profiles
-- is ON DELETE CASCADE on auth.users, so DELETE /account (auth.admin.deleteUser)
-- erased the only proof that a code had ever been redeemed. Delete the account,
-- sign up again, redeem the same code again — indefinitely, by the same person.
-- A lifetime creator code with max_redemptions = 1 was therefore "one live
-- account at a time", not a one-time grant.
--
-- Fix: promo_codes.redemption_count is now the authority for the cap. It lives
-- on the promo_codes row, which no user deletion touches, and is incremented in
-- the same transaction as the redemption insert — already serialized by the
-- existing FOR UPDATE lock on the code row, so concurrent redeems still cannot
-- overshoot the cap. Redemption rows keep cascading away with the user for
-- privacy; only the counter survives.
--
-- Consequence to know about: a user who deletes their account burns their slot.
-- Re-granting is an admin action (mint a new code, or raise max_redemptions),
-- which is the intended semantics for a one-time creator grant.

alter table public.promo_codes
  add column redemption_count integer not null default 0
  check (redemption_count >= 0);

-- Backfill from surviving redemption rows. Redemptions that belonged to
-- already-deleted users cannot be recovered — those rows and their
-- entitlement_events cascaded away with the profile — so this is a floor on
-- historical usage, not a replay of it.
update public.promo_codes pc
set redemption_count = (
  select count(*)
  from public.promo_code_redemptions r
  where r.promo_code_id = pc.id
);

-- ============================================================
-- Atomic redemption (counter-based cap)
-- ============================================================
-- Unchanged except: the max_redemptions check reads promo_codes.redemption_count
-- instead of counting redemption rows, and a successful redemption increments
-- that counter. Same result discriminators:
--   redeemed | already_redeemed | invalid | fully_redeemed | already_entitled

create or replace function public.redeem_promo_code(p_code text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code            public.promo_codes%rowtype;
  v_creator         public.creators%rowtype;
  v_existing        public.promo_code_redemptions%rowtype;
  v_ent_status      text;
  v_ent_expires_at  timestamptz;
  v_new_expires_at  timestamptz;
begin
  select * into v_code
  from public.promo_codes
  where lower(code) = lower(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into v_creator from public.creators where id = v_code.creator_id;

  if not v_code.active
     or not coalesce(v_creator.active, false)
     or (v_code.expires_at is not null and v_code.expires_at < now()) then
    return jsonb_build_object('result', 'invalid');
  end if;

  -- Idempotent replay: this user already redeemed this code.
  select * into v_existing
  from public.promo_code_redemptions
  where promo_code_id = v_code.id and user_id = p_user_id;

  if found then
    return jsonb_build_object(
      'result', 'already_redeemed',
      'code', v_code.code,
      'type', v_code.type,
      'months', v_code.months,
      'creator_name', v_creator.name,
      'creator_slug', v_creator.slug,
      'expires_at', v_existing.entitlement_expires_at
    );
  end if;

  -- Deletion-proof cap: redemption_count is read from the row locked above, so
  -- a deleted account's redemption still occupies its slot forever.
  if v_code.max_redemptions is not null
     and v_code.redemption_count >= v_code.max_redemptions then
    return jsonb_build_object('result', 'fully_redeemed');
  end if;

  -- A user with currently-valid access (Apple or promo) cannot redeem — this
  -- protects a paying subscriber's entitlement row from being overwritten.
  select status, expires_at into v_ent_status, v_ent_expires_at
  from public.entitlements
  where user_id = p_user_id
  for update;

  if v_ent_status in ('trial', 'active')
     and (v_ent_expires_at is null or v_ent_expires_at > now()) then
    return jsonb_build_object('result', 'already_entitled');
  end if;

  if v_code.type = 'months_free' then
    v_new_expires_at := now() + make_interval(months => v_code.months);
  else
    v_new_expires_at := null; -- lifetime
  end if;

  insert into public.promo_code_redemptions (promo_code_id, user_id, entitlement_expires_at)
  values (v_code.id, p_user_id, v_new_expires_at);

  -- Counted even for uncapped codes so the admin total reflects real lifetime
  -- usage rather than currently-live accounts.
  update public.promo_codes
  set redemption_count = redemption_count + 1
  where id = v_code.id;

  -- original_transaction_id is cleared so the Apple webhook (matched by that
  -- id) can never flip a promo grant based on an old Apple subscription.
  insert into public.entitlements
    (user_id, status, source, product_id, original_transaction_id, starts_at, expires_at, updated_at)
  values
    (p_user_id, 'active', 'promo', null, null, now(), v_new_expires_at, now())
  on conflict (user_id) do update set
    status = excluded.status,
    source = excluded.source,
    product_id = excluded.product_id,
    original_transaction_id = excluded.original_transaction_id,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;

  insert into public.entitlement_events (user_id, event_type, metadata)
  values (
    p_user_id,
    'promo_redeemed',
    jsonb_build_object(
      'promo_code', v_code.code,
      'promo_code_id', v_code.id,
      'promo_code_type', v_code.type,
      'months', v_code.months,
      'creator_slug', v_creator.slug,
      'expires_at', v_new_expires_at
    )
  );

  return jsonb_build_object(
    'result', 'redeemed',
    'code', v_code.code,
    'type', v_code.type,
    'months', v_code.months,
    'creator_name', v_creator.name,
    'creator_slug', v_creator.slug,
    'expires_at', v_new_expires_at
  );
end;
$$;

-- Service-role only — never callable from clients.
revoke execute on function public.redeem_promo_code(text, uuid) from public;
revoke execute on function public.redeem_promo_code(text, uuid) from anon;
revoke execute on function public.redeem_promo_code(text, uuid) from authenticated;
grant execute on function public.redeem_promo_code(text, uuid) to service_role;
