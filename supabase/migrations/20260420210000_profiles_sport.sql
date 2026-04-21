-- User-reported sport from onboarding; displayed on profile. Nullable for legacy rows.

begin;

alter table public.profiles
  add column if not exists sport text;

comment on column public.profiles.sport is
  'Primary sport chosen during onboarding or edited later; free text, max length enforced in app.';

revoke update on public.profiles from authenticated;
grant update (onboarding_completed, competition_date, sport) on public.profiles to authenticated;

commit;
