-- Race-condition hardening for lesson completion.
-- 1. Enforce one completion row per (user, lesson, local date). This makes
--    same-day same-lesson double taps / retries / concurrent requests idempotent
--    at the row level, so MAC gain cannot be double-applied and current_program_day
--    cannot be advanced twice.
-- 2. Allow idempotency_keys.response_status to be NULL so the Edge function can
--    "claim" a key with a placeholder row before doing the work, then UPDATE it
--    with the real response (closes the TOCTOU race in _shared/idempotency.ts).
--
-- PRODUCTION SAFETY: refuses to create the unique index if any duplicate
-- (user_id, lesson_id, completion_local_date) groups already exist. If this
-- migration aborts, do NOT delete production rows; pick a remediation strategy
-- (see plan: "Human Input Needed").

begin;

do $$
declare
  v_groups int;
  v_excess int;
begin
  select count(*), coalesce(sum(c) - count(*), 0)
  into v_groups, v_excess
  from (
    select count(*) as c
    from public.user_lesson_completions
    group by user_id, lesson_id, completion_local_date
    having count(*) > 1
  ) g;

  if v_groups > 0 then
    raise exception
      'complete_lesson hardening: % duplicate (user_id, lesson_id, completion_local_date) group(s) covering % excess row(s) already exist. Cleanup required before this migration can run.',
      v_groups, v_excess;
  end if;
end $$;

create unique index if not exists
  user_lesson_completions_user_lesson_local_date_uidx
  on public.user_lesson_completions (user_id, lesson_id, completion_local_date);

alter table public.idempotency_keys
  alter column response_status drop not null;

commit;
