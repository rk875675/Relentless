-- Allows new users who completed the Grant intro onboarding mini-lesson to start
-- with seeded MAC ring scores instead of 0. Uses ON CONFLICT DO NOTHING so existing
-- users with real progress are never overwritten.
-- Marked security definer so authenticated clients can call it without needing
-- direct DML access to user_progress (which has RLS enabled, no client policies).

create or replace function public.initialize_mac_scores(
  p_mindfulness  int default 20,
  p_acceptance   int default 20,
  p_commitment   int default 20
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_progress (
    user_id,
    mindfulness_score,
    acceptance_score,
    commitment_score
  )
  values (
    auth.uid(),
    p_mindfulness,
    p_acceptance,
    p_commitment
  )
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.initialize_mac_scores(int, int, int) to authenticated;
