-- Iaia's pack was displaying "(Track)" when it should be "(All Sports)".
-- Brock's golf pack had no sport set (defaulting to the schema default "track"),
-- so "(track)" appeared instead of "(Golf)".
-- Display logic is `coach.sport ?? program.sport`; the coach row is what renders.
-- Loader does not write coaches.sport, so these values survive re-runs.
begin;

update public.coaches
   set sport = 'All Sports'
 where coach_key = 'iaia-colella';

update public.programs
   set sport = 'All Sports'
 where id = '31fa5ef4-e606-4949-9685-25c2ed06a325';

update public.coaches
   set sport = 'Golf'
 where coach_key = 'brock-mccormack';

update public.programs
   set sport = 'Golf'
 where id = 'd667a93e-8381-4734-8190-1a9b86acda1f';

commit;
