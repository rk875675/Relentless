-- Daily library: unlock requires catch-up + completing today's scheduled WOD at least once
-- (last_wod_completion_local_date = client local calendar day from X-Local-Date).

begin;

alter table public.profiles
  add column if not exists last_wod_completion_local_date date;

comment on column public.profiles.last_wod_completion_local_date is
  'Local calendar date when the user last completed the current scheduled Daily Workout (WOD); resets library gate after midnight until a new WOD completion.';

drop function if exists public.complete_lesson(uuid, uuid);

create or replace function public.complete_lesson(
  p_user_id               uuid,
  p_lesson_id             uuid,
  p_completion_local_date date
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

  -- Stamp "did today's WOD" for library unlock when this row completes the scheduled lesson
  -- for the user's current program day (including day 30).
  update public.profiles p
  set last_wod_completion_local_date = p_completion_local_date
  where p.id = p_user_id
    and exists (
      select 1
      from public.program_schedule s
      where s.program_version = 'v1'
        and s.day_number = p.current_program_day
        and s.lesson_id = p_lesson_id
    );

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
