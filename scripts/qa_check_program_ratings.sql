-- Read-only: recent in-app pack ratings for the QA account.
select
  r.rating,
  r.program_name,
  r.program_id,
  r.created_at,
  p.title as program_title
from auth.users u
join public.program_ratings r on r.user_id = u.id
left join public.programs p on p.id = r.program_id
where lower(u.email) = lower('rkumar875675@gmail.com')
order by r.created_at desc;
