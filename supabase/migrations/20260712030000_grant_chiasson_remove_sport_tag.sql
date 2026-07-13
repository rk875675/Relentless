-- Removes the "(track)" sport tag shown next to Grant Chiasson's name in the
-- app (home tab, category page, pack detail, library). The mobile display
-- logic is `coach.sport ?? program.sport`, then renders the parenthetical
-- only if that value is truthy — so an empty string on the NOT NULL
-- coaches.sport column (default 'track') hides it without violating the
-- constraint. Grant's name, bio, credentials, and program content are
-- untouched — this only clears the `sport` column on his coach + program row.
begin;

update public.coaches
   set sport = ''
 where id = 'a0000000-0000-0000-0000-000000000001';

update public.programs
   set sport = null
 where id = 'b0000000-0000-0000-0000-000000000001';

commit;
