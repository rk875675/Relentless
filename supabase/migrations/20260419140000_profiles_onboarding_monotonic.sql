-- Once profiles.onboarding_completed is true, never allow it to flip back to false
-- (client updates, RPCs, or mistakes). Dev reset RPC stops clearing this column;
-- QA replays onboarding via client-only overlay (see mobile auth-context).

begin;

create or replace function public.profiles_onboarding_monotonic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.onboarding_completed is true and new.onboarding_completed is false then
    new.onboarding_completed := true;
  end if;
  return new;
end;
$$;

create trigger profiles_onboarding_monotonic
  before update on public.profiles
  for each row
  execute function public.profiles_onboarding_monotonic();

comment on function public.profiles_onboarding_monotonic() is
  'Keeps onboarding_completed monotonic: true cannot revert to false.';

-- Dev reset: clear progress/program but do not clear onboarding_completed (DB stays true).
create or replace function public.dev_reset_onboarding_progress()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_dev) then
    raise exception 'dev_reset_onboarding_progress: not allowed';
  end if;

  delete from public.user_lesson_completions where user_id = auth.uid();

  insert into public.user_progress as up (
    user_id,
    mindfulness_score,
    acceptance_score,
    commitment_score,
    last_decay_applied_local_date
  )
  values (auth.uid(), 0, 0, 0, null)
  on conflict (user_id) do update set
    mindfulness_score = excluded.mindfulness_score,
    acceptance_score = excluded.acceptance_score,
    commitment_score = excluded.commitment_score,
    last_decay_applied_local_date = excluded.last_decay_applied_local_date,
    updated_at = now();

  insert into public.user_streaks (user_id, current_streak, longest_streak, last_activity_date)
  values (auth.uid(), 0, 0, null)
  on conflict (user_id) do update set
    current_streak     = 0,
    longest_streak     = 0,
    last_activity_date = null,
    updated_at         = now();

  update public.profiles
  set current_program_day            = 1,
      last_wod_completion_local_date = null,
      freebie_used                   = false,
      program_start_date             = null
  where id = auth.uid();
end;
$$;

commit;
