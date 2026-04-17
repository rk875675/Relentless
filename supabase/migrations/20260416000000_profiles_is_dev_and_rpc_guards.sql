-- Internal QA: flag accounts that may use dev RPCs and server-side entitlement bypass.
-- is_dev is NOT granted to authenticated UPDATE — set only via SQL Editor / service role.

begin;

alter table public.profiles
  add column if not exists is_dev boolean not null default false;

comment on column public.profiles.is_dev is
  'When true, server treats user as entitled for protected APIs; dev RPCs allowed. Set manually in Supabase; never self-service.';

-- ---------------------------------------------------------------------------
-- Dev RPCs: require is_dev (server cannot see __DEV__).
-- ---------------------------------------------------------------------------

create or replace function public.dev_set_program_day(p_day integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_dev) then
    raise exception 'dev_set_program_day: not allowed';
  end if;

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
  select case
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_dev)
    then (select current_program_day from public.profiles where id = auth.uid())
    else null::integer
  end;
$$;

create or replace function public.dev_grant_trial()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_dev) then
    raise exception 'dev_grant_trial: not allowed';
  end if;

  update public.entitlements
  set status     = 'trial',
      starts_at  = now(),
      expires_at = now() + interval '365 days',
      updated_at = now()
  where user_id = auth.uid();
end;
$$;

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
  set onboarding_completed           = false,
      current_program_day            = 1,
      last_wod_completion_local_date = null,
      freebie_used                   = false,
      program_start_date             = null
  where id = auth.uid();
end;
$$;

grant execute on function public.dev_reset_onboarding_progress() to authenticated;
grant execute on function public.dev_set_program_day(integer) to authenticated;
grant execute on function public.dev_get_program_day() to authenticated;
grant execute on function public.dev_grant_trial() to authenticated;

commit;
