-- Dev-only RPCs: get/set current_program_day for the calling user.
-- Used by the mobile dev-tools day switcher to jump between days
-- without completing each lesson sequentially.

create or replace function public.dev_set_program_day(p_day integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_day < 1 or p_day > 30 then
    raise exception 'p_day must be between 1 and 30';
  end if;

  update public.profiles
  set current_program_day = p_day,
      last_wod_completion_local_date = null
  where id = auth.uid();

  return p_day;
end;
$$;

create or replace function public.dev_get_program_day()
returns integer
language sql
security definer
set search_path = ''
as $$
  select current_program_day
  from public.profiles
  where id = auth.uid();
$$;
