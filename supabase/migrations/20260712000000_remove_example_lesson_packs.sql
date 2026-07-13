-- ============================================================================
-- 20260712000000_remove_example_lesson_packs.sql
-- Removes every example/demo/test lesson pack, keeping only:
--   grant-chiasson / 30-day-sprint
--   james-goodall / race-ready-a-7-day-mental-performance-challenge
--
-- Also removes orphaned demo coaches, the Demo: All Block Types lesson,
-- and the Smoke Test Lesson (+ Test Coach with null coach_key).
-- Grant library / onboarding sample lessons are intentionally KEPT.
--
-- Run:  npx supabase db push
-- ============================================================================

begin;

create temp table _drop_example_packs on commit drop as
select p.id as program_id, l.id as lesson_id
  from public.programs p
  join public.coaches c on c.id = p.coach_id
  left join public.lessons l on l.program_id = p.id
 where (c.coach_key, p.program_key) in (
         ('demo-amy-smith', 'demo-elite-runner'),
         ('rahul-kumar', 'example-golf-one'),
         ('trenton-sandler', 'single-test-lesson'),
         ('trenton-sandler', 'test-lesson-pack')
       );

-- Fall back to the sprint if anyone had an example pack active.
update public.profiles
   set active_program_id = 'b0000000-0000-0000-0000-000000000001'
 where active_program_id in (select distinct program_id from _drop_example_packs);

delete from public.user_lesson_completions
 where lesson_id in (select lesson_id from _drop_example_packs where lesson_id is not null);

delete from public.user_lesson_completions_dedupe_archive
 where lesson_id in (select lesson_id from _drop_example_packs where lesson_id is not null);

delete from public.journal_entries
 where lesson_id in (select lesson_id from _drop_example_packs where lesson_id is not null);

delete from public.lesson_categories
 where lesson_id in (select lesson_id from _drop_example_packs where lesson_id is not null);

delete from public.lessons
 where program_id in (select distinct program_id from _drop_example_packs);

-- user_program_state rows cascade via FK on program_id.
delete from public.programs
 where id in (select distinct program_id from _drop_example_packs);

-- Orphan demo lessons (not tied to a pack).
create temp table _drop_demo_lessons on commit drop as
select id as lesson_id
  from public.lessons
 where id in (
         'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',  -- Demo: All Block Types
         '30e78e40-5fc9-4662-a6b3-78b5dd9dc5b3'   -- Smoke Test Lesson
       );

delete from public.user_lesson_completions
 where lesson_id in (select lesson_id from _drop_demo_lessons);

delete from public.user_lesson_completions_dedupe_archive
 where lesson_id in (select lesson_id from _drop_demo_lessons);

delete from public.journal_entries
 where lesson_id in (select lesson_id from _drop_demo_lessons);

delete from public.lesson_categories
 where lesson_id in (select lesson_id from _drop_demo_lessons);

delete from public.lessons
 where id in (select lesson_id from _drop_demo_lessons);

-- Drop coaches that no longer own any program (and aren't Grant / James).
delete from public.coaches c
 where c.coach_key in ('demo-amy-smith', 'rahul-kumar', 'trenton-sandler')
   and not exists (
         select 1 from public.programs p where p.coach_id = c.id
       );

-- Test Coach (null coach_key) — only safe once Smoke Test Lesson is gone.
delete from public.coaches c
 where c.id = '3d74dd22-2b6e-46ff-9fef-77acb8e99b81'
   and c.coach_key is null
   and not exists (
         select 1 from public.programs p where p.coach_id = c.id
       )
   and not exists (
         select 1 from public.lessons l where l.coach_id = c.id
       );

-- Signed-URL cache rows for removed pack audio paths (best-effort).
delete from public.audio_url_cache
 where path like 'demo-amy-smith/%'
    or path like 'rahul-kumar/%'
    or path like 'trenton-sandler/%'
    or path like 'coach/demo-amy-smith%'
    or path like 'coach/rahul-kumar%'
    or path like 'coach/trenton-sandler%';

commit;

-- VERIFY (run after push):
--   select c.coach_key, p.program_key
--     from public.programs p
--     join public.coaches c on c.id = p.coach_id
--    order by c.coach_key, p.program_key;
--   -- expect only:
--   --   grant-chiasson | 30-day-sprint
--   --   james-goodall  | race-ready-a-7-day-mental-performance-challenge
