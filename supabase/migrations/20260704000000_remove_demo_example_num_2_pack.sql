-- ============================================================================
-- 20260704000000_remove_demo_example_num_2_pack.sql
-- Removes the dev-only "example num 2" lesson pack (coach rahul-kumar /
-- program_key example-num-2), loaded via 03_loader.py for smoke testing.
--
-- production_ready = false — real users never saw it. The Rahul Kumar coach
-- row is intentionally KEPT (still owns other dev-gated packs).
--
-- Run:  npx supabase db push
-- ============================================================================

begin;

create temp table _drop_example_num_2 on commit drop as
select p.id as program_id, l.id as lesson_id
  from public.programs p
  join public.coaches c on c.id = p.coach_id
  left join public.lessons l on l.program_id = p.id
 where c.coach_key = 'rahul-kumar'
   and p.program_key = 'example-num-2';

-- Fall back to the sprint if a dev account had this pack active.
update public.profiles
   set active_program_id = 'b0000000-0000-0000-0000-000000000001'
 where active_program_id in (select distinct program_id from _drop_example_num_2);

delete from public.user_lesson_completions
 where lesson_id in (select lesson_id from _drop_example_num_2 where lesson_id is not null);

delete from public.user_lesson_completions_dedupe_archive
 where lesson_id in (select lesson_id from _drop_example_num_2 where lesson_id is not null);

delete from public.journal_entries
 where lesson_id in (select lesson_id from _drop_example_num_2 where lesson_id is not null);

delete from public.lesson_categories
 where lesson_id in (select lesson_id from _drop_example_num_2 where lesson_id is not null);

delete from public.lessons
 where program_id in (select distinct program_id from _drop_example_num_2);

-- user_program_state rows cascade via FK on program_id.
delete from public.programs
 where id in (select distinct program_id from _drop_example_num_2);

commit;

-- VERIFY (run after push):
--   select count(*) from public.programs p
--     join public.coaches c on c.id = p.coach_id
--    where c.coach_key = 'rahul-kumar' and p.program_key = 'example-num-2';  -- expect 0
