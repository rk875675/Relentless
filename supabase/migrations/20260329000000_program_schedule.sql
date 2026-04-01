-- Migration: explicit 30-day program schedule (Daily Workout)
-- PRD: fixed 30-day program; each program day maps to one lesson via this table.
-- Replace placeholder rows when final content is available (same shape).

begin;

-- ============================================================
-- 1. Schedule table (one row per program day per program version)
-- ============================================================

create table public.program_schedule (
  id               uuid        primary key default gen_random_uuid(),
  program_version  text        not null default 'v1',
  day_number       integer     not null,
  lesson_id        uuid        not null references public.lessons (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint program_schedule_day_range check (day_number >= 1 and day_number <= 30),
  constraint program_schedule_version_day unique (program_version, day_number)
);

create index idx_program_schedule_version
  on public.program_schedule (program_version);

create trigger set_program_schedule_updated_at
  before update on public.program_schedule
  for each row
  execute function public.set_updated_at();

alter table public.program_schedule enable row level security;

-- ============================================================
-- 2. Per-user pointer: which program day is the active Daily Workout
-- ============================================================

alter table public.profiles
  add column if not exists current_program_day integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_current_program_day_check;

alter table public.profiles
  add constraint profiles_current_program_day_check
  check (current_program_day >= 1 and current_program_day <= 30);

comment on column public.profiles.current_program_day is
  'Active program day (1–30). /lessons/next returns program_schedule.lesson for this day. Advances when user completes that scheduled lesson (see complete_lesson).';

-- ============================================================
-- 3. Placeholder schedule for v1 — cycles the six seeded library lessons.
--    Replace via migration or admin when final 30-day mapping is ready.
-- ============================================================

insert into public.program_schedule (program_version, day_number, lesson_id)
select
  'v1',
  d.n,
  case (d.n - 1) % 6
    when 0 then 'c0000000-0000-0000-0000-000000000001'::uuid
    when 1 then 'c0000000-0000-0000-0000-000000000002'::uuid
    when 2 then 'c0000000-0000-0000-0000-000000000003'::uuid
    when 3 then 'c0000000-0000-0000-0000-000000000004'::uuid
    when 4 then 'c0000000-0000-0000-0000-000000000005'::uuid
    when 5 then 'c0000000-0000-0000-0000-000000000006'::uuid
  end
from generate_series(1, 30) as d(n);

-- ============================================================
-- 4. complete_lesson: advance current_program_day when completion matches
--    the scheduled lesson for the user’s current day (not past day 30).
-- ============================================================

create or replace function public.complete_lesson(
  p_user_id   uuid,
  p_lesson_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at  timestamptz;
  v_today         date;
  v_last_date     date;
  v_streak        int;
  v_longest       int;
  v_mindfulness   numeric;
  v_acceptance    numeric;
  v_commitment    numeric;
begin
  insert into public.user_lesson_completions (user_id, lesson_id)
  values (p_user_id, p_lesson_id)
  returning completed_at into v_completed_at;

  update public.profiles p
  set current_program_day = least(p.current_program_day + 1, 30)
  where p.id = p_user_id
    and p.current_program_day < 30
    and exists (
      select 1
      from public.program_schedule s
      where s.program_version = 'v1'
        and s.day_number = p.current_program_day
        and s.lesson_id = p_lesson_id
    );

  with cat_stats as (
    select
      lc.category,
      count(distinct lc.lesson_id)  as total_lessons,
      count(distinct ulc.lesson_id) as completed_lessons
    from public.lesson_categories lc
    join public.lessons l
      on l.id = lc.lesson_id and l.published = true
    left join public.user_lesson_completions ulc
      on ulc.lesson_id = lc.lesson_id and ulc.user_id = p_user_id
    group by lc.category
  )
  select
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'mindfulness'), 0),
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'acceptance'), 0),
    coalesce((select round(completed_lessons::numeric
                           / nullif(total_lessons, 0) * 100, 2)
              from cat_stats where category = 'commitment'), 0)
  into v_mindfulness, v_acceptance, v_commitment;

  insert into public.user_progress
    (user_id, mindfulness_score, acceptance_score, commitment_score)
  values
    (p_user_id, v_mindfulness, v_acceptance, v_commitment)
  on conflict (user_id) do update set
    mindfulness_score = excluded.mindfulness_score,
    acceptance_score  = excluded.acceptance_score,
    commitment_score  = excluded.commitment_score;

  v_today := (now() at time zone 'UTC')::date;

  select current_streak, longest_streak, last_activity_date
  into v_streak, v_longest, v_last_date
  from public.user_streaks
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.user_streaks
      (user_id, current_streak, longest_streak, last_activity_date)
    values (p_user_id, 1, 1, v_today);
    v_streak  := 1;
    v_longest := 1;

  elsif v_last_date = v_today then
    null;

  elsif v_last_date = v_today - 1 then
    v_streak  := v_streak + 1;
    v_longest := greatest(v_longest, v_streak);
    update public.user_streaks
    set current_streak     = v_streak,
        longest_streak     = v_longest,
        last_activity_date = v_today
    where user_id = p_user_id;

  else
    v_streak  := 1;
    v_longest := greatest(v_longest, 1);
    update public.user_streaks
    set current_streak     = 1,
        longest_streak     = v_longest,
        last_activity_date = v_today
    where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'completed_at', v_completed_at,
    'progress', jsonb_build_object(
      'mindfulness_score', v_mindfulness,
      'acceptance_score',  v_acceptance,
      'commitment_score',  v_commitment
    ),
    'streak', jsonb_build_object(
      'current_streak',     v_streak,
      'longest_streak',     v_longest,
      'last_activity_date', v_today
    )
  );
end;
$$;

commit;
