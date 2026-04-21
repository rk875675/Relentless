-- Optional track-athlete flag for all accounts (onboarding + profile).

begin;

alter table public.profiles
  add column if not exists is_track_athlete boolean not null default false;

comment on column public.profiles.is_track_athlete is
  'When true, user identifies as a track athlete; used for tailored copy. Editable in profile.';

revoke update on public.profiles from authenticated;
grant update (onboarding_completed, competition_date, sport, is_track_athlete) on public.profiles to authenticated;

commit;
