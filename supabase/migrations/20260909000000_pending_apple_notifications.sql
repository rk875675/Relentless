-- Migration: pending_apple_notifications
--
-- Apple Server Notifications for SUBSCRIBED INITIAL_BUY (and other types) can
-- arrive before the client has called purchases/restore, so the entitlement
-- row (keyed by original_transaction_id) does not yet exist. Previously these
-- were logged as warnings and dropped permanently, leaving two users without
-- entitlements on 2026-09-08 (transaction IDs 280003411925156 and
-- 390002515045198).
--
-- This table acts as a dead-letter queue. apple-notifications saves unmatched
-- notifications here; purchases/restore deletes them after writing the
-- authoritative entitlement state from Apple's API.

create table if not exists public.pending_apple_notifications (
  id                      uuid        not null default gen_random_uuid() primary key,
  original_transaction_id text        not null,
  notification_type       text,
  subtype                 text,
  raw_body                text        not null,
  created_at              timestamptz not null default now()
);

comment on table public.pending_apple_notifications is
  'Apple Server Notifications that arrived before the owning user''s '
  'entitlement row existed. Reconciled and deleted by purchases/restore.';

create index if not exists idx_pending_apple_notifications_otid
  on public.pending_apple_notifications (original_transaction_id);

-- Service-role only; no client access.
alter table public.pending_apple_notifications enable row level security;
