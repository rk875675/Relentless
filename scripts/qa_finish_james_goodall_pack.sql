-- QA only. Marks James Goodall's pack finished for one account, writes a
-- 5-star rating + fake feedback, and points Home at that pack so
-- /lessons/next returns program_complete.
-- Run (from repo root):
--   supabase db query --linked -f scripts/qa_finish_james_goodall_pack.sql
-- Then pull-to-refresh Home.

begin;

create temporary table _qa_target as
select id as user_id
from auth.users
where lower(email) = lower('rkumar875675@gmail.com');

do $$
begin
  if not exists (select 1 from _qa_target) then
    raise exception 'No auth.users row for that email';
  end if;
end $$;

create temporary table _qa_pack as
select
  p.id as program_id,
  p.title,
  max(l.sequence) as last_day,
  (array_agg(l.id order by l.sequence desc))[1] as last_lesson_id
from public.programs p
join public.coaches c on c.id = p.coach_id
join public.lessons l
  on l.program_id = p.id
 and l.published = true
where c.coach_key = 'james-goodall'
group by p.id, p.title
order by max(l.sequence) desc
limit 1;

do $$
begin
  if not exists (select 1 from _qa_pack) then
    raise exception 'No published James Goodall lesson pack found';
  end if;
end $$;

insert into public.user_lesson_completions (user_id, lesson_id, completion_local_date)
select t.user_id, l.id, current_date
from _qa_target t
cross join _qa_pack pk
join public.lessons l
  on l.program_id = pk.program_id
 and l.published = true
on conflict (user_id, lesson_id, completion_local_date) do nothing;

insert into public.user_program_state (
  user_id, program_id, current_day, started, started_local_date
)
select
  t.user_id,
  pk.program_id,
  pk.last_day,
  true,
  (current_date - 14)
from _qa_target t
cross join _qa_pack pk
on conflict (user_id, program_id) do update set
  current_day = excluded.current_day,
  started = true,
  started_local_date = excluded.started_local_date;

update public.profiles p
set
  active_program_id = pk.program_id,
  current_program_day = pk.last_day,
  program_start_date = current_date - 14,
  last_wod_completion_local_date = current_date
from _qa_target t, _qa_pack pk
where p.id = t.user_id;

delete from public.program_ratings pr
using _qa_target t, _qa_pack pk
where pr.user_id = t.user_id
  and pr.program_id = pk.program_id;

insert into public.program_ratings (user_id, program_id, program_name, rating, app_build)
select t.user_id, pk.program_id, pk.title, 5, 'qa'
from _qa_target t
cross join _qa_pack pk;

insert into public.program_completion_feedback (user_id, message, program_version, app_build)
select
  t.user_id,
  'Clear, usable, not fluffy. The race-week cues are the part I will actually run.',
  pk.title,
  'qa'
from _qa_target t
cross join _qa_pack pk;

select
  pk.title,
  pk.last_day,
  p.current_program_day as profile_day,
  p.active_program_id = pk.program_id as is_active,
  (
    select count(*)::int
    from public.user_lesson_completions ulc
    join public.lessons l on l.id = ulc.lesson_id
    where ulc.user_id = t.user_id
      and l.program_id = pk.program_id
  ) as completed_lessons,
  (
    select r.rating
    from public.program_ratings r
    where r.user_id = t.user_id
      and r.program_id = pk.program_id
  ) as rating
from _qa_target t
join public.profiles p on p.id = t.user_id
cross join _qa_pack pk;

commit;
