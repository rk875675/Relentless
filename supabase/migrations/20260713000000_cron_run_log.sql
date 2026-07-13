-- ============================================================================
-- 20260713000000_cron_run_log.sql
-- Minimal observability for scheduled edge functions (push-reminders,
-- trial-reminders). pg_cron + pg_net invocations are fire-and-forget, so a
-- failed or short-circuited run is currently invisible. Each cron run now
-- writes one row here (best-effort, never blocks the run itself), so
-- "did last night's reminders actually go out?" is a one-query check:
--
--   select * from cron_run_log order by started_at desc limit 20;
--
-- Service-role only: RLS enabled with no policies (same pattern as
-- audio_url_cache). Run:  npx supabase db push
-- ============================================================================

create table if not exists public.cron_run_log (
  id            uuid        primary key default gen_random_uuid(),
  function_name text        not null,
  request_id    text        not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null default now(),
  ok            boolean     not null,
  -- e.g. { checked, eligible, sent, failed, capped } for push-reminders
  summary       jsonb       not null default '{}'::jsonb,
  error         text
);

alter table public.cron_run_log enable row level security;

create index if not exists cron_run_log_fn_started_idx
  on public.cron_run_log (function_name, started_at desc);
