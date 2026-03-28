-- Migration: grant trial entitlement to all existing users (dev only)
-- In production, entitlements are granted via StoreKit / Superwall purchase flow.
-- This gives all current users access so edge functions work during development.

update public.entitlements
set status = 'trial',
    starts_at = now(),
    expires_at = now() + interval '365 days'
where status = 'none';

-- Also update handle_new_user to default new users to trial during dev.
-- Revert this before production launch.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  insert into public.entitlements (user_id, status, starts_at, expires_at)
  values (new.id, 'trial', now(), now() + interval '365 days');

  return new;
end;
$$;
