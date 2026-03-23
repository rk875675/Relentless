-- Migration: create_infrastructure_tables
-- Phase 1a infrastructure schema for Relentless
-- Source of truth: docs/schema_plan.md

-- ============================================================
-- Helper functions
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  insert into public.entitlements (user_id)
  values (new.id);

  return new;
end;
$$;

-- ============================================================
-- Tables (dependency order)
-- ============================================================

create table public.profiles (
  id                   uuid        primary key references auth.users (id) on delete cascade,
  competition_date     date,
  onboarding_completed boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.entitlements (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references public.profiles (id) on delete cascade,
  status     text        not null default 'none',
  product_id text,
  starts_at  timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlement_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  event_type text        not null,
  product_id text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create table public.idempotency_keys (
  key             text        primary key,
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  response_status integer     not null,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);

create table public.audit_log (
  id          uuid        primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text        not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb,
  request_id  text,
  created_at  timestamptz not null default now()
);

create table public.feature_flags (
  id         uuid        primary key default gen_random_uuid(),
  key        text        not null unique,
  enabled    boolean     not null default false,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Triggers
-- ============================================================

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create trigger set_entitlements_updated_at
  before update on public.entitlements
  for each row
  execute function public.set_updated_at();

create trigger set_feature_flags_updated_at
  before update on public.feature_flags
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.entitlements      enable row level security;
alter table public.entitlement_events enable row level security;
alter table public.idempotency_keys  enable row level security;
alter table public.audit_log         enable row level security;
alter table public.feature_flags     enable row level security;

-- profiles: own-row select and update
create policy profiles_select_own
  on public.profiles for select
  using (auth.uid() = id);

create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- entitlements: own-row select only (writes are service-role only)
create policy entitlements_select_own
  on public.entitlements for select
  using (auth.uid() = user_id);

-- entitlement_events: service-role only in V1 (no client policies)
-- idempotency_keys:   service-role only (no client policies)
-- audit_log:          service-role only (no client policies)
-- feature_flags:      service-role only (no client policies)

-- ============================================================
-- Indexes
-- ============================================================

create index idx_entitlement_events_user_created
  on public.entitlement_events (user_id, created_at);

create index idx_audit_log_actor_created
  on public.audit_log (actor_id, created_at);

create index idx_audit_log_entity
  on public.audit_log (entity_type, entity_id);

create index idx_idempotency_keys_expires
  on public.idempotency_keys (expires_at);
