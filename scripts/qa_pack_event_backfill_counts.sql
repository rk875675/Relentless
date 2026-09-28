-- Read-only counts for pack event backfill. No PII.
select 'program_ratings' as source, count(*)::int as n from public.program_ratings
union all
select 'user_program_state_started_nonsprint', count(*)::int
from public.user_program_state
where started = true
  and program_id <> 'b0000000-0000-0000-0000-000000000001'
union all
select 'sprint_users_with_any_completion', count(distinct ulc.user_id)::int
from public.user_lesson_completions ulc
join public.lessons l on l.id = ulc.lesson_id
where l.program_id = 'b0000000-0000-0000-0000-000000000001'
union all
select 'sprint_day30_completions', count(distinct ulc.user_id)::int
from public.user_lesson_completions ulc
join public.program_schedule s
  on s.lesson_id = ulc.lesson_id
 and s.program_version = 'v1'
where s.day_number = (
  select max(day_number) from public.program_schedule where program_version = 'v1'
);
