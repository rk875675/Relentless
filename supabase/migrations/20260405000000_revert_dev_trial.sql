-- PRODUCTION MIGRATION: revert handle_new_user to default entitlement status 'none'.
-- The dev trial migration (20260328000002) auto-granted 'trial' to every new user.
-- In production, entitlements are granted only through the StoreKit / Superwall
-- purchase → /purchases/restore verification flow.
--
-- DO NOT APPLY until you are ready for production signups.
-- After applying, new users will land on the paywall with no access until they subscribe.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  insert into public.entitlements (user_id)
  values (new.id);

  return new;
end;
$$;
