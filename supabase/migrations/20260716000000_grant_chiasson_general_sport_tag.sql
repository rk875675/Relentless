-- Grant Chiasson's 30-Day Sprint showed no tag next to his name (home tab,
-- category page, pack detail, library) because 20260712030000 blanked the
-- sport columns. The other two packs show "(track)", so an empty slot reads
-- like missing data — label his sport-agnostic pack "General" instead.
-- Display logic is `coach.sport ?? program.sport`, so the coach row is what
-- renders; the program row is set to match for consistency.
begin;

update public.coaches
   set sport = 'General'
 where id = 'a0000000-0000-0000-0000-000000000001';

update public.programs
   set sport = 'General'
 where id = 'b0000000-0000-0000-0000-000000000001';

commit;
