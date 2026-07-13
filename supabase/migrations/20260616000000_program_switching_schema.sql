-- ============================================================================
-- 20260616000000_program_switching_schema.sql
-- Lesson-pack switching, schema layer (additive, prod-safe).
--
-- Adds the per-user "active program" pointer and a per-(user, program) progress
-- table so a user can switch between lesson packs and continue/restart each one.
-- The live 30-Day Sprint path is unchanged: existing users are backfilled onto
-- the sprint as their active program, and profiles.current_program_day stays the
-- denormalized pointer for whichever program is active.
--
-- Sprint program id: b0000000-0000-0000-0000-000000000001 (see generalize_multicoach).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. profiles.active_program_id — which pack drives the daily Workout-of-the-Day.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists active_program_id uuid references public.programs (id);

-- Backfill every existing user onto the sprint (the only live program today).
update public.profiles
   set active_program_id = 'b0000000-0000-0000-0000-000000000001'
 where active_program_id is null;

alter table public.profiles
  alter column active_program_id set default 'b0000000-0000-0000-0000-000000000001';

comment on column public.profiles.active_program_id is
  'The lesson pack currently driving /lessons/next. Switched via POST /programs/select. current_program_day + program_start_date are the denormalized pointer for THIS program.';

-- ----------------------------------------------------------------------------
-- 2. Relax current_program_day upper bound — packs need not be 30 days.
--    Keep the lower bound. Sprint behavior is unaffected (still caps at 30 in
--    complete_lesson via program length).
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_current_program_day_check;

alter table public.profiles
  add constraint profiles_current_program_day_check
  check (current_program_day >= 1);

-- ----------------------------------------------------------------------------
-- 3. user_program_state — per-(user, program) progress so switching can
--    Continue (resume stored day) or Restart (back to day 1) without ever
--    deleting completions.
-- ----------------------------------------------------------------------------
create table if not exists public.user_program_state (
  user_id            uuid        not null references public.profiles (id) on delete cascade,
  program_id         uuid        not null references public.programs (id) on delete cascade,
  current_day        integer     not null default 1 check (current_day >= 1),
  started            boolean     not null default false,
  started_local_date date,
  updated_at         timestamptz not null default now(),
  primary key (user_id, program_id)
);

create trigger set_user_program_state_updated_at
  before update on public.user_program_state
  for each row
  execute function public.set_updated_at();

-- Service-role only (matches every other product-direction table). The mobile
-- app reads its program state through the /programs Edge Function.
alter table public.user_program_state enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Backfill the sprint state row for every existing user from their current
--    profile pointer, so "Continue" works immediately for the live program.
-- ----------------------------------------------------------------------------
insert into public.user_program_state
  (user_id, program_id, current_day, started, started_local_date)
select
  p.id,
  'b0000000-0000-0000-0000-000000000001',
  greatest(p.current_program_day, 1),
  true,
  p.program_start_date
from public.profiles p
where p.active_program_id = 'b0000000-0000-0000-0000-000000000001'
on conflict (user_id, program_id) do nothing;

commit;

-- ============================================================================
-- VERIFY (run as separate queries after push):
--   select count(*) from public.profiles where active_program_id is null;        -- expect 0
--   select count(*) from public.user_program_state;                              -- >= #users
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'profiles_current_program_day_check';                       -- >= 1 only
-- ============================================================================
