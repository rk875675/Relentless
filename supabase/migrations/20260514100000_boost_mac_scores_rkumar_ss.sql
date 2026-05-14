-- One-off: raise MAC sharpness rings for rkumar875675@gmail.com only (App Store screenshots).
-- Does not alter scoring logic — only replaces this user's user_progress row.
-- Rollback decay freeze: reset last_decay_applied_local_date to null or today's local-ish date via SQL Console.

begin;

do $boost$
declare
  v_uid uuid;
begin
  select id into v_uid
  from auth.users
  where lower(email) = lower('rkumar875675@gmail.com');

  if v_uid is null then
    raise notice 'boost_mac_scores_rkumar_ss: no auth.users row for rkumar875675@gmail.com; skipped.';
    return;
  end if;

  insert into public.user_progress (
    user_id,
    mindfulness_score,
    acceptance_score,
    commitment_score,
    last_decay_applied_local_date
  )
  values (
    v_uid,
    94,
    92,
    90,
    date '2099-01-01'
  )
  on conflict (user_id) do update set
    mindfulness_score = excluded.mindfulness_score,
    acceptance_score = excluded.acceptance_score,
    commitment_score = excluded.commitment_score,
    last_decay_applied_local_date = excluded.last_decay_applied_local_date,
    updated_at = now();
end;
$boost$;

commit;
