-- Migration: push_notifications
-- Creates push_tokens and push_notification_sends tables.
-- Adds push_reminders_enabled to profiles.

-- ── push_tokens ─────────────────────────────────────────────────────────────
-- Stores one Expo push token per device. Written only by the push-tokens
-- Edge Function (service role); clients have no direct write access.

create table public.push_tokens (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  expo_push_token text        not null,
  timezone        text        not null default 'America/New_York',
  platform        text        not null default 'ios',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  -- Set when Expo returns DeviceNotRegistered; excludes token from future sends.
  disabled_at     timestamptz,

  constraint push_tokens_expo_push_token_unique unique (expo_push_token)
);

create trigger set_push_tokens_updated_at
  before update on public.push_tokens
  for each row
  execute function public.set_updated_at();

alter table public.push_tokens enable row level security;
-- Service-role only. No client-side RLS policies; tokens flow through Edge Function.

create index idx_push_tokens_user_id
  on public.push_tokens (user_id);

create index idx_push_tokens_last_seen_at
  on public.push_tokens (last_seen_at desc);

-- ── push_notification_sends ──────────────────────────────────────────────────
-- Audit log + deduplication guard for server-driven workout reminders.
-- Unique on (user_id, local_date, reminder_type) so at most one reminder
-- of each type per user per local calendar day.

create table public.push_notification_sends (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  local_date      date        not null,
  reminder_type   text        not null, -- 'evening_nudge' | 'multi_day_miss'
  expo_push_token text        not null,
  sent_at         timestamptz,
  dry_run         boolean     not null default false,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  constraint push_notification_sends_unique_reminder
    unique (user_id, local_date, reminder_type)
);

alter table public.push_notification_sends enable row level security;
-- Service-role only. No client policies.

create index idx_push_notification_sends_user_date
  on public.push_notification_sends (user_id, local_date desc);

create index idx_push_notification_sends_created
  on public.push_notification_sends (created_at);

-- ── profiles: push_reminders_enabled ────────────────────────────────────────
alter table public.profiles
  add column if not exists push_reminders_enabled boolean not null default false;

comment on column public.profiles.push_reminders_enabled is
  'Whether the user has opted in to server-driven workout push reminders. '
  'Set true by push-tokens Edge Function on successful token registration; '
  'set false when user disables the toggle.';

-- Extend the per-column update grant so authenticated users can toggle
-- push_reminders_enabled (off path) and the push-tokens function can set it
-- via service role. This follows the same revoke-then-regrant pattern used
-- when display_name was added.
revoke update on public.profiles from authenticated;
grant update (
  onboarding_completed,
  competition_date,
  sport,
  is_track_athlete,
  display_name,
  push_reminders_enabled
) on public.profiles to authenticated;
