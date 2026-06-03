-- ============================================================================
-- 20260530120000_generalize_multicoach.sql
-- ONE-TIME migration. Generalizes the single-program schema to multi-coach /
-- multi-program. Additive only — nothing the live app reads is removed, so the
-- shipped build keeps working until the app update lands.
--
-- Run on STAGING first. Review. Then prod.
--   apply with:       npx supabase db push
--
-- Verified against the live schema:
--   coaches(id,name,sport,bio,external_url,avatar_url,created_at,updated_at)
--   lessons(... ,coach_id, content_blocks, production_ready, sort_order, ...)
--   program_schedule(program_version,day_number,lesson_id, ...)
-- production_ready already exists (20260530010000) and is intentionally not
-- re-added here.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. COACHES — add the columns multi-coach needs (additive).
--    coach_key is the stable slug the Loader upserts on.
--    Reuse existing external_url (offer link) and avatar_url (photo path).
-- ----------------------------------------------------------------------------
alter table public.coaches add column if not exists coach_key   text;
alter table public.coaches add column if not exists credentials text;
alter table public.coaches add column if not exists offer_label text;

-- Map the existing single coach to Grant's key so the Loader resolves to this
-- SAME row (preserving every existing lesson's coach_id FK).
update public.coaches
   set coach_key   = 'grant-chiasson',
       credentials = coalesce(credentials, 'M.S., CMPC'),
       offer_label = coalesce(offer_label, 'Book a call')
 where id = 'a0000000-0000-0000-0000-000000000001';

-- coach_key must be unique (the Loader upserts on it).
create unique index if not exists coaches_coach_key_key
  on public.coaches (coach_key)
  where coach_key is not null;

-- ----------------------------------------------------------------------------
-- 2. PROGRAMS — new table. A coach has many programs of any length.
-- ----------------------------------------------------------------------------
create table if not exists public.programs (
  id               uuid        primary key default gen_random_uuid(),
  coach_id         uuid        not null references public.coaches (id),
  program_key      text        not null,
  title            text        not null,
  description      text,
  cover_image      text,
  sport            text,
  level            text,
  published        boolean     not null default false,  -- servable at all
  production_ready boolean     not null default false,  -- visible to real users
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint programs_coach_program_key unique (coach_id, program_key)
);

-- ----------------------------------------------------------------------------
-- 3. LESSONS — belong to a program, ordered by sequence within it.
--    program_id is nullable for now so existing rows are untouched until the
--    backfill below. sort_order stays as-is (legacy).
-- ----------------------------------------------------------------------------
alter table public.lessons add column if not exists program_id uuid references public.programs (id);
alter table public.lessons add column if not exists sequence   integer;

create index if not exists lessons_program_id_sequence_idx
  on public.lessons (program_id, sequence);

-- ----------------------------------------------------------------------------
-- 4. BACKFILL GRANT — turn the current "v1" program into a real program row
--    and point his existing lessons at it. Fixed UUID so this is idempotent.
-- ----------------------------------------------------------------------------
insert into public.programs (id, coach_id, program_key, title, description, sport, level, published, production_ready)
values (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '30-day-sprint',
  '30-Day Sprint',
  'The original 30-day mental performance program.',
  'General',
  'All',
  true,   -- already live
  true    -- already live to real users
)
on conflict (id) do nothing;

-- Point each existing v1 lesson at Grant's program, using its day_number as sequence.
update public.lessons l
   set program_id = 'b0000000-0000-0000-0000-000000000001',
       sequence   = ps.day_number
  from public.program_schedule ps
 where ps.lesson_id = l.id
   and ps.program_version = 'v1'
   and l.program_id is null;

-- NOTE: program_schedule is intentionally LEFT IN PLACE. The shipped app still
-- reads it. Do not drop it until the app update that resolves lessons by
-- (program_id, sequence) is live in the App Store.

commit;

-- ============================================================================
-- VERIFY (run as separate queries after push):
--   select coach_key, credentials, offer_label from public.coaches;
--   select * from public.programs;
--   select count(*) from public.lessons where program_id is not null;   -- expect 30
--   select sequence, title from public.lessons
--     where program_id = 'b0000000-0000-0000-0000-000000000001' order by sequence;
-- ============================================================================
