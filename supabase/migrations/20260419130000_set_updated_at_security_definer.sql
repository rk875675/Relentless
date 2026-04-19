-- set_updated_at runs on profiles (and other tables). After column-level UPDATE grants
-- on profiles (restrict_profiles_update_cols), the trigger still assigns updated_at as
-- the invoker role, which lacks UPDATE on that column. Run the trigger body as definer
-- so timestamps stay server-controlled without granting updated_at to clients.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
