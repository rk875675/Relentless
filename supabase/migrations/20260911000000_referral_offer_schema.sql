-- Referral offer — teammate share (PRD 10.5). Database layer only.
--
-- Adds three new tables, four nullable columns on entitlements, and one
-- feature flag defaulted OFF. Nothing here changes existing behavior: no
-- existing column is altered or dropped, no existing policy is touched, and
-- no live code path reads any of this yet.
--
-- Authority model: every new table has RLS enabled with NO policies, so it is
-- reachable only via the service role. The code pool in particular must never
-- be client-readable — each row is a live App Store discount.

-- ============================================================
-- Code pool: unredeemed Apple offer codes, imported from the
-- App Store Connect one-time-use CSV batches.
-- ============================================================

create table public.referral_offer_codes (
  id                   uuid        primary key default gen_random_uuid(),
  -- SKU this code subscribes the invitee to. Not CHECK-constrained: the live
  -- SKU set changes when pricing changes, and a stale CHECK would fail closed
  -- on a legitimate new product.
  product_id           text        not null,
  -- App Store Connect offer REFERENCE NAME. For offer codes this is the string
  -- Apple echoes back as offerIdentifier, so reward detection matches on it.
  offer_reference_name text        not null,
  code                 text        not null,
  -- Apple's batch expiry. We must stop handing out a code before this date,
  -- because an individual code cannot be revoked or extended.
  apple_expires_at     timestamptz not null,
  status               text        not null default 'available',
  -- Which downloaded CSV this row came from, for reconciliation.
  imported_batch       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint referral_offer_codes_status_check
    check (status in ('available', 'assigned', 'redeemed', 'expired', 'retired'))
);

-- Apple codes are uppercase alphanumeric; compare case-insensitively so a
-- re-import or a differently-cased row can never duplicate a code.
create unique index referral_offer_codes_code_lower_key
  on public.referral_offer_codes (lower(code));

-- Drives the pool picker (cheapest available code for a SKU) and the
-- low-stock check.
create index idx_referral_offer_codes_pool
  on public.referral_offer_codes (product_id, status, apple_expires_at);

-- ============================================================
-- Invites: one row per code handed to a sharer.
-- ============================================================

create table public.referral_invites (
  id                             uuid        primary key default gen_random_uuid(),
  -- Nullable with ON DELETE SET NULL: account deletion must preserve the audit
  -- row (PRD 10.5.7). Caps key on original_transaction_id, which survives.
  sharer_user_id                 uuid        references public.profiles(id) on delete set null,
  sharer_original_transaction_id text        not null,
  sharer_product_id              text        not null,
  -- entitlements.expires_at at send time: identifies the sharer's billing
  -- period without needing a separate period-start column.
  sharer_period_end              timestamptz,
  code_id                        uuid        not null unique
                                             references public.referral_offer_codes(id),
  invitee_product_id             text        not null,
  status                         text        not null default 'open',
  claimed_by_user_id             uuid        references public.profiles(id) on delete set null,
  claimed_original_transaction_id text,
  claimed_at                     timestamptz,
  converted_at                   timestamptz,
  -- 90-day invite TTL. Governs slot recycling only: a conversion still earns a
  -- reward after this date, up to apple_expires_at (PRD 10.5.7).
  ttl_expires_at                 timestamptz not null,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  constraint referral_invites_status_check
    check (status in ('open', 'claimed', 'converted', 'expired', 'void'))
);

-- Counting a sharer's open invites against the 5-per-period cap.
create index idx_referral_invites_sharer
  on public.referral_invites (sharer_original_transaction_id, status);

create index idx_referral_invites_sharer_user
  on public.referral_invites (sharer_user_id, created_at desc);

-- Joining an Apple paid conversion back to the invite that produced it.
create index idx_referral_invites_claimed_otid
  on public.referral_invites (claimed_original_transaction_id)
  where claimed_original_transaction_id is not null;

-- Pairwise reciprocity check: "has this invitee ever been the sharer for this
-- sharer?" (PRD 10.5.7).
create index idx_referral_invites_pair
  on public.referral_invites (sharer_user_id, claimed_by_user_id);

-- Sweeping invites whose TTL has lapsed so their code returns to the pool.
create index idx_referral_invites_ttl
  on public.referral_invites (status, ttl_expires_at);

-- ============================================================
-- Rewards: the 20% each side earned, and its Apple state.
-- ============================================================

create table public.referral_rewards (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        references public.profiles(id) on delete set null,
  original_transaction_id text       not null,
  role                   text        not null,
  -- Billing period the cap applies to (sharer's entitlements.expires_at).
  period_end             timestamptz,
  invite_id              uuid        references public.referral_invites(id),
  -- SKU the discount applies to, which decides WHICH promotional offer to sign.
  product_id             text        not null,
  -- ASC Promotional Offer Identifier (sharer) or offer-code Reference Name
  -- (invitee). Apple reports both in the offerIdentifier field.
  offer_identifier       text,
  status                 text        not null default 'pending',
  ready_at               timestamptz,
  applied_at             timestamptz,
  -- Set only when Apple confirms, never from the client (PRD 10.5.6).
  apple_confirmed_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint referral_rewards_role_check
    check (role in ('gave', 'received')),
  constraint referral_rewards_status_check
    check (status in ('pending', 'ready', 'applied', 'expired', 'void'))
);

-- THE CAPS, enforced in the database rather than in application logic.
--
-- One outbound reward per Apple account per billing period.
create unique index referral_rewards_gave_once_per_period
  on public.referral_rewards (original_transaction_id, period_end)
  where role = 'gave';

-- One inbound reward per Apple account, ever. Apple independently enforces one
-- code per active offer per Apple ID; this makes it true on our side too.
create unique index referral_rewards_received_once
  on public.referral_rewards (original_transaction_id)
  where role = 'received';

create index idx_referral_rewards_user
  on public.referral_rewards (user_id, status);

-- ============================================================
-- Sharer eligibility inputs.
--
-- Eligibility needs auto-renew state and any already-active promotional offer,
-- neither of which is stored today. All nullable, no default, no backfill —
-- adding them cannot rewrite the table or affect existing reads. Populated by
-- a later phase; until then they stay null and the feature stays off.
-- ============================================================

alter table public.entitlements
  add column if not exists auto_renew_status        smallint,
  add column if not exists renewal_product_id       text,
  add column if not exists renewal_offer_identifier text,
  add column if not exists renewal_offer_type       smallint;

comment on column public.entitlements.auto_renew_status is
  'Apple renewalInfo.autoRenewStatus: 0 = off (cancelled), 1 = on. Null = unknown.';
comment on column public.entitlements.renewal_offer_identifier is
  'Offer already attached to the upcoming renewal. Non-null means an active promotional offer exists, so do not stack another.';

-- ============================================================
-- Triggers (matching the existing convention)
-- ============================================================

create trigger set_referral_offer_codes_updated_at
  before update on public.referral_offer_codes
  for each row
  execute function public.set_updated_at();

create trigger set_referral_invites_updated_at
  before update on public.referral_invites
  for each row
  execute function public.set_updated_at();

create trigger set_referral_rewards_updated_at
  before update on public.referral_rewards
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row Level Security: service-role only on all three tables.
-- ============================================================

alter table public.referral_offer_codes enable row level security;
alter table public.referral_invites     enable row level security;
alter table public.referral_rewards     enable row level security;

-- ============================================================
-- Kill switch, defaulted OFF.
--
-- Read by the /config endpoint (key + enabled only; metadata is deliberately
-- not exposed to clients) and enforced again server-side.
-- ============================================================

insert into public.feature_flags (key, enabled, metadata)
values (
  'referral_offer_enabled',
  false,
  jsonb_build_object(
    'low_stock_threshold', 100,
    'invite_ttl_days', 90,
    'max_open_invites_per_period', 5
  )
)
on conflict (key) do nothing;
