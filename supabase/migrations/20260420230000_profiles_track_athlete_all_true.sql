-- MVP: treat everyone as a track athlete by default; users can turn this off in Profile.

begin;

alter table public.profiles
  alter column is_track_athlete set default true;

update public.profiles
set is_track_athlete = true
where is_track_athlete is distinct from true;

commit;
