-- Security fix: restrict which columns the authenticated role can UPDATE
-- on its own profiles row. Previously any column was writable via PostgREST,
-- allowing users to manipulate current_program_day, freebie_used, etc.

revoke update on public.profiles from authenticated;
grant update (onboarding_completed, competition_date) on public.profiles to authenticated;
