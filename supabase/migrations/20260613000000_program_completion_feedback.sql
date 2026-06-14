-- ============================================================
-- Program completion feedback
-- Captures the short free-text feedback users submit from the
-- "Relentless 30-Day Sprint complete" screen. Writes happen only via the
-- `program-feedback` Edge function (service role), so RLS is enabled with no
-- client policies (service-role only, same pattern as audit_log/idempotency_keys).
-- ============================================================

create table if not exists public.program_completion_feedback (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  message         text        not null check (char_length(message) between 1 and 2000),
  program_version text        not null default 'v1',
  app_build       text,
  created_at      timestamptz not null default now()
);

comment on table public.program_completion_feedback is
  'Free-text feedback submitted after finishing the 30-day program. Written via the program-feedback Edge function (service role).';

create index if not exists idx_program_completion_feedback_user_created
  on public.program_completion_feedback (user_id, created_at);

alter table public.program_completion_feedback enable row level security;
-- No client policies: inserts come from the service-role Edge function only.
