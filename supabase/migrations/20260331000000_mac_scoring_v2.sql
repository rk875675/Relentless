-- MAC scoring v2: sharpness model with growth + decay (replaces percentage-of-completion).
-- Adds decay tracking column and replaces complete_lesson to stop computing MAC %.

begin;

alter table public.user_progress
  add column if not exists last_decay_applied_local_date date;

comment on column public.user_progress.last_decay_applied_local_date is
  'Last local calendar date through which time/missed-WOD decay was applied (lazy eval).';

-- Backfill existing rows so they do not get retroactive decay on next read.
update public.user_progress
set last_decay_applied_local_date = (now() at time zone 'UTC')::date
where last_decay_applied_local_date is null;

-- Replace complete_lesson: remove MAC percentage computation (now in Edge Function
-- scoring module), return lesson_completion_count for diminishing returns.
drop function if exists public.complete_lesson(uuid, uuid, date);

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
