-- Program calendar anchor: first Home visit sets local calendar day 1 (see edge helpers).
-- Catch-up / library unlock uses program_start_date + client X-Local-Date.

begin;

alter table public.profiles
  add column if not exists program_start_date date;

comment on column public.profiles.program_start_date is
  'Local calendar date when the 30-day program started (set on first Home session via ensure_program_start).';

create or replace function public.ensure_program_start(
  p_user_id    uuid,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set program_start_date = p_local_date
  where id = p_user_id
    and program_start_date is null;
end;
$$;

revoke all on function public.ensure_program_start(uuid, date) from public;
grant execute on function public.ensure_program_start(uuid, date) to service_role;

commit;
