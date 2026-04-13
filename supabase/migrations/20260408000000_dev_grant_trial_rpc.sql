-- RPC callable by completeOnboardingDevBypass so the server-side entitlement
-- matches the client-side bypass.  Grants the calling user a 365-day trial.
-- Safe: operates only on the caller's own row via auth.uid().
-- Remove or revoke execute before production launch if desired.

create or replace function public.dev_grant_trial()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entitlements
  set status     = 'trial',
      starts_at  = now(),
      expires_at = now() + interval '365 days',
      updated_at = now()
  where user_id = auth.uid();
end;
$$;
