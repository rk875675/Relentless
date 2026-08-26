-- Read-only check after qa_reset_pack_last_day.sql
select
  p.title,
  s.current_day,
  (
    select count(*)
    from public.user_lesson_completions ulc
    join public.lessons l on l.id = ulc.lesson_id
    where ulc.user_id = u.id
      and l.program_id = p.id
      and l.sequence = s.current_day
  ) as last_day_completion_count,
  (
    select count(*)
    from public.program_ratings r
    where r.user_id = u.id
      and r.program_id = p.id
  ) as rating_count,
  pr.active_program_id = p.id as is_active
from auth.users u
join public.profiles pr on pr.id = u.id
join public.user_program_state s on s.user_id = u.id
join public.programs p on p.id = s.program_id
where lower(u.email) = lower('rkumar875675@gmail.com')
order by is_active desc, p.title;
