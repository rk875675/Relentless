-- Fix: initialize_mac_scores must set last_decay_applied_local_date so decay
-- starts immediately for newly seeded users (otherwise it stays null and
-- decayGapDays returns 0 forever).

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
    commitment_score,
    last_decay_applied_local_date
  )
  values (
    auth.uid(),
    p_mindfulness,
    p_acceptance,
    p_commitment,
    CURRENT_DATE
  )
  on conflict (user_id) do nothing;
end;
$$;
