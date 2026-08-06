-- Promo/discount code system (Phase 1) — additive only, nothing existing altered.
--
-- creators               — a code always belongs to a creator so cohorts can be
--                          compared per creator in PostHog.
-- promo_codes            — 'months_free' (multi-use, one redemption per user) or
--                          'lifetime' (typically max_redemptions = 1 for the
--                          creator themselves).
-- promo_code_redemptions — one row per (code, user); the unique constraint is
--                          the per-user idempotency backbone.
-- entitlements.source    — 'apple' (default; all existing rows) or 'promo'.
--                          Promo rows carry NO original_transaction_id, so the
--                          Apple webhook can never touch them. When a promo user
--                          later subscribes via Apple, restore/webhook upserts by
--                          user_id and overwrites source back to 'apple' — that
--                          transition is how "converted to paying" is measured.
--
-- All writes are service-role only (edge function). RLS is enabled with no
-- client policies on the new tables.

-- ============================================================
-- Tables
-- ============================================================

create table public.creators (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

create table public.promo_codes (
  id              uuid        primary key default gen_random_uuid(),
  code            text        not null,
  type            text        not null check (type in ('months_free', 'lifetime')),
  months          integer     check (months > 0),
  creator_id      uuid        not null references public.creators (id),
  is_personal     boolean     not null default false,
  max_redemptions integer     check (max_redemptions > 0),
  active          boolean     not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  -- months is required for months_free and forbidden for lifetime.
  constraint promo_codes_months_matches_type check (
    (type = 'months_free' and months is not null)
    or (type = 'lifetime' and months is null)
  )
);

-- Case-insensitive uniqueness + fast case-insensitive lookup.
create unique index promo_codes_code_lower_key on public.promo_codes (lower(code));
create index idx_promo_codes_creator on public.promo_codes (creator_id);

create table public.promo_code_redemptions (
  id                     uuid        primary key default gen_random_uuid(),
  promo_code_id          uuid        not null references public.promo_codes (id),
  user_id                uuid        not null references public.profiles (id) on delete cascade,
  redeemed_at            timestamptz not null default now(),
  entitlement_expires_at timestamptz,
  constraint promo_code_redemptions_one_per_user unique (promo_code_id, user_id)
);

create index idx_promo_code_redemptions_user on public.promo_code_redemptions (user_id);

alter table public.entitlements
  add column source text not null default 'apple'
  check (source in ('apple', 'promo'));

-- ============================================================
-- Row Level Security — service-role only (no client policies)
-- ============================================================

alter table public.creators               enable row level security;
alter table public.promo_codes            enable row level security;
alter table public.promo_code_redemptions enable row level security;

-- ============================================================
-- Atomic redemption
-- ============================================================
-- Locks the promo_codes row FOR UPDATE so concurrent redemptions of a
-- max_redemptions-limited code serialize; all checks, the redemption insert,
-- the entitlement upsert, and the audit event commit in one transaction.
--
-- Returns jsonb with a "result" discriminator:
--   redeemed | already_redeemed | invalid | fully_redeemed | already_entitled
-- "invalid" deliberately covers nonexistent, inactive, expired, and
-- creator-deactivated codes so callers cannot distinguish near-misses.

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
  v_redemptions     integer;
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

  if v_code.max_redemptions is not null then
    select count(*) into v_redemptions
    from public.promo_code_redemptions
    where promo_code_id = v_code.id;

    if v_redemptions >= v_code.max_redemptions then
      return jsonb_build_object('result', 'fully_redeemed');
    end if;
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
