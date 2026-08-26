-- QA only. Puts one user on the last uncompleted day of every lesson pack.
-- Run (from repo root):
--   npx supabase@2.115.0 db query --linked -f scripts/qa_reset_pack_last_day.sql
-- Change the email below before running for a different account.

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

create temporary table _qa_packs as
select
  p.id as program_id,
  p.title,
  max(l.sequence) as last_day,
  (array_agg(l.id order by l.sequence desc))[1] as last_lesson_id
from public.programs p
join public.lessons l
  on l.program_id = p.id
 and l.published = true
group by p.id, p.title;

delete from public.user_lesson_completions ulc
using _qa_target t, _qa_packs pk
where ulc.user_id = t.user_id
  and ulc.lesson_id = pk.last_lesson_id;

delete from public.program_ratings pr
using _qa_target t
where pr.user_id = t.user_id;

insert into public.user_program_state (
  user_id, program_id, current_day, started, started_local_date
)
select
  t.user_id,
  pk.program_id,
  pk.last_day,
  true,
  (current_date - 60)
from _qa_target t
cross join _qa_packs pk
on conflict (user_id, program_id) do update set
  current_day = excluded.current_day,
  started = true,
  started_local_date = excluded.started_local_date;

update public.profiles p
set
  current_program_day = pk.last_day,
  program_start_date = current_date - 60,
  last_wod_completion_local_date = null,
  active_program_id = coalesce(p.active_program_id, pk.program_id)
from _qa_target t, _qa_packs pk
where p.id = t.user_id
  and pk.program_id = coalesce(
    p.active_program_id,
    (select program_id from _qa_packs order by last_day desc limit 1)
  );

select
  pk.title,
  pk.last_day,
  p.current_program_day as profile_day,
  p.active_program_id = pk.program_id as is_active
from _qa_target t
join public.profiles p on p.id = t.user_id
join public.user_program_state s
  on s.user_id = t.user_id
join _qa_packs pk on pk.program_id = s.program_id
order by is_active desc, pk.title;

commit;
