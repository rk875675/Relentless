-- Migration: trial_reminder_emails
-- Tracks one-time free-trial reminder emails sent by backend jobs.

create table public.trial_reminder_emails (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles (id) on delete cascade,
  product_id          text        not null,
  expires_at          timestamptz not null,
  reminder_type       text        not null,
  sent_at             timestamptz,
  provider_message_id text,
  metadata            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint trial_reminder_emails_unique_reminder
    unique (user_id, product_id, expires_at, reminder_type)
);

create trigger set_trial_reminder_emails_updated_at
  before update on public.trial_reminder_emails
  for each row
  execute function public.set_updated_at();

alter table public.trial_reminder_emails enable row level security;

-- Service-role only in V1. No client policies.

create index idx_trial_reminder_emails_user_sent
  on public.trial_reminder_emails (user_id, sent_at desc);

create index idx_trial_reminder_emails_created
  on public.trial_reminder_emails (created_at);
