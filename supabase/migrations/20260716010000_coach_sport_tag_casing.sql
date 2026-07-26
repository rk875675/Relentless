-- Sport tags next to coach names (home tab, category page, pack detail,
-- library) were inconsistent: Grant's sport-agnostic pack read "(General)"
-- while the other two read lowercase "(track)". Title-case all three and use
-- "All Sports" for Grant, which reads as an audience rather than a missing
-- category. Display logic is `coach.sport ?? program.sport`, so the coach row
-- is what renders; Grant's program row is set to match for consistency.
begin;

update public.coaches
   set sport = 'All Sports'
 where coach_key = 'grant-chiasson';

update public.programs
   set sport = 'All Sports'
 where id = 'b0000000-0000-0000-0000-000000000001';

update public.coaches
   set sport = 'Track'
 where coach_key in ('james-goodall', 'iaia-colella');

commit;
