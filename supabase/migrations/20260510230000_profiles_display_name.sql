-- Optional display name for Profile hero (Apple relay emails look like random prefixes).
alter table public.profiles
  add column if not exists display_name text;

comment on column public.profiles.display_name is
  'User-chosen name for in-app display; null means fall back to auth email local-part.';

revoke update on public.profiles from authenticated;
grant update (
  onboarding_completed,
  competition_date,
  sport,
  is_track_athlete,
  display_name
) on public.profiles to authenticated;
