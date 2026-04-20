-- QA: clear app data for testforapple@gmail.com without deleting auth.users.
-- MAC rings (user_progress scores) -> 0, streaks cleared, journal + completions removed,
-- program pointer reset. No-op if the account does not exist.
-- To run again after new data accumulates, execute the DO block in the Supabase SQL editor.

begin;

do $reset$
declare
  v_uid uuid;
begin
  select id into v_uid
  from auth.users
  where lower(email) = lower('testforapple@gmail.com');

  if v_uid is null then
    return;
  end if;

  delete from public.journal_entries where user_id = v_uid;
  delete from public.user_lesson_completions where user_id = v_uid;
  delete from public.idempotency_keys where user_id = v_uid;

  insert into public.user_progress as up (
    user_id,
    mindfulness_score,
    acceptance_score,
    commitment_score,
    last_decay_applied_local_date
  )
  values (v_uid, 0, 0, 0, null)
  on conflict (user_id) do update set
    mindfulness_score = excluded.mindfulness_score,
    acceptance_score = excluded.acceptance_score,
    commitment_score = excluded.commitment_score,
    last_decay_applied_local_date = excluded.last_decay_applied_local_date,
    updated_at = now();

  insert into public.user_streaks (user_id, current_streak, longest_streak, last_activity_date)
  values (v_uid, 0, 0, null)
  on conflict (user_id) do update set
    current_streak = 0,
    longest_streak = 0,
    last_activity_date = null,
    updated_at = now();

  update public.profiles
  set
    current_program_day = 1,
    last_wod_completion_local_date = null,
    freebie_used = false,
    program_start_date = null
  where id = v_uid;
end;
$reset$;

commit;
