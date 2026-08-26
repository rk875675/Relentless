-- The original schema default for coaches.sport was 'track' (the first sport
-- on the platform). New coaches loaded without an explicit sport silently
-- inherited 'track', which was wrong for golf / multi-sport coaches.
--
-- 1. Change the column default to 'All Sports' so future inserts are safe.
-- 2. Migrate any remaining lowercase 'track' rows (the untouched default) to
--    'All Sports'. Title-case 'Track' rows (set explicitly for track coaches
--    like james-goodall) are left alone.
begin;

alter table public.coaches
  alter column sport set default 'All Sports';

update public.coaches
   set sport = 'All Sports'
 where sport = 'track';

commit;
