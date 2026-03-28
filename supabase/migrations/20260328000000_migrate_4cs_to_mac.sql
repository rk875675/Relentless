-- Migration: migrate 4 C's → MAC categories
-- Changes the category model from Control/Commitment/Challenge/Confidence
-- to the MAC framework: Mindfulness, Acceptance, Commitment.
-- Also replaces user_progress columns and the complete_lesson RPC.
-- Depends on: 20260322000001_create_product_direction_tables.sql,
--             20260323000000_add_complete_lesson_rpc.sql

begin;

-- ============================================================
-- 1. lesson_categories: replace CHECK constraint
-- ============================================================

-- Drop old constraint (Postgres auto-names it based on table; find + drop)
alter table public.lesson_categories
  drop constraint if exists lesson_categories_category_check;

-- Clear any rows with old category values that don't exist in MAC.
-- 'commitment' is shared between old and new, so it stays.
-- 'control', 'challenge', 'confidence' have no MAC equivalent — delete them.
delete from public.lesson_categories
where category in ('control', 'challenge', 'confidence');

-- Add new constraint with MAC categories
alter table public.lesson_categories
  add constraint lesson_categories_category_check
  check (category in ('mindfulness', 'acceptance', 'commitment'));

-- ============================================================
-- 2. user_progress: replace 4-column model with 3 MAC columns
-- ============================================================

alter table public.user_progress
  drop column if exists control_score,
  drop column if exists challenge_score,
  drop column if exists confidence_score;

-- Rename commitment_score → stays as-is (shared category).
-- Add the two new MAC columns.
alter table public.user_progress
  rename column commitment_score to commitment_score_old;

alter table public.user_progress
  add column mindfulness_score numeric not null default 0,
  add column acceptance_score  numeric not null default 0,
  add column commitment_score  numeric not null default 0;

-- Carry forward any existing commitment data
update public.user_progress
set commitment_score = commitment_score_old;

alter table public.user_progress
  drop column commitment_score_old;

-- ============================================================
-- 3. Replace complete_lesson RPC for MAC
-- ============================================================

create or replace function public.complete_lesson(
  p_user_id  uuid,
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
  -- 1. Record completion
  insert into public.user_lesson_completions (user_id, lesson_id)
  values (p_user_id, p_lesson_id)
  returning completed_at into v_completed_at;

  -- 2. Per-category progress: (distinct completed / total published) * 100
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

  -- 3. Upsert progress row
  insert into public.user_progress
    (user_id, mindfulness_score, acceptance_score, commitment_score)
  values
    (p_user_id, v_mindfulness, v_acceptance, v_commitment)
  on conflict (user_id) do update set
    mindfulness_score = excluded.mindfulness_score,
    acceptance_score  = excluded.acceptance_score,
    commitment_score  = excluded.commitment_score;

  -- 4. Streak (Snapchat-style, UTC date boundaries)
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
      'current_streak',    v_streak,
      'longest_streak',    v_longest,
      'last_activity_date', v_today
    )
  );
end;
$$;

commit;
