-- Fix: streak branches must use p_completion_local_date (client local day),
-- not UTC now(). Previously v_today was set to UTC date, which can disagree
-- with last_activity_date and the home screen's device-local daysSince
-- calculation near timezone boundaries (freebie modal + miss reflection).
--
-- Only change from 20260331200001: line "v_today := p_completion_local_date;"

begin;

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
  v_completed_at            timestamptz;
  v_today                   date;
  v_last_date               date;
  v_streak                  int;
  v_longest                 int;
  v_lesson_completion_count int;
  v_freebie_used            boolean;
begin
  insert into public.user_lesson_completions (user_id, lesson_id)
  values (p_user_id, p_lesson_id)
  returning completed_at into v_completed_at;

  select count(*) into v_lesson_completion_count
  from public.user_lesson_completions
  where user_id = p_user_id and lesson_id = p_lesson_id;

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

  -- Use the client-supplied local date so streak branches and last_activity_date
  -- stay on the same calendar as the home screen daysSince computation.
  v_today := p_completion_local_date;

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
    -- Same day: no streak change
    null;

  elsif v_last_date = v_today - 1 then
    -- Consecutive day: increment streak
    v_streak  := v_streak + 1;
    v_longest := greatest(v_longest, v_streak);
    update public.user_streaks
    set current_streak     = v_streak,
        longest_streak     = v_longest,
        last_activity_date = v_today
    where user_id = p_user_id;

  elsif v_last_date = v_today - 2 then
    -- Exactly 1 missed day: check freebie
    select freebie_used into v_freebie_used
    from public.profiles where id = p_user_id;

    if not v_freebie_used then
      -- Use freebie: continue streak as if consecutive
      v_streak  := v_streak + 1;
      v_longest := greatest(v_longest, v_streak);
      update public.profiles set freebie_used = true where id = p_user_id;
      update public.user_streaks
      set current_streak     = v_streak,
          longest_streak     = v_longest,
          last_activity_date = v_today
      where user_id = p_user_id;
    else
      -- Freebie already used: break streak
      v_streak  := 1;
      v_longest := greatest(v_longest, 1);
      update public.user_streaks
      set current_streak     = 1,
          longest_streak     = v_longest,
          last_activity_date = v_today
      where user_id = p_user_id;
    end if;

  else
    -- Gap >= 2 missed days: freebie covers at most 1, streak still breaks
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
    'lesson_completion_count', v_lesson_completion_count,
    'streak', jsonb_build_object(
      'current_streak',     v_streak,
      'longest_streak',     v_longest,
      'last_activity_date', v_today
    )
  );
end;
$$;

commit;
