-- ============================================================================
-- 20260601000000_remove_dev_qb_pack_lesson.sql
-- Removes the old QB-pack smoke-test lesson (dddddddd-...), created by
-- 20260530000000_dev_test_qb_program_lesson.sql and updated by
-- 20260530010000_dev_lesson_preview_gate.sql. It was a dev-only demo
-- (lesson_type='dev-test', production_ready=false) reachable via the now-removed
-- __DEV__ home button; the generalized Loader replaces it.
--
-- Additive/forward-only: historical migrations are left untouched. This only
-- deletes the single dev row + its dependents. No production-user content is
-- affected (the lesson was never production_ready).
--
-- Run on STAGING first, then prod:  npx supabase db push
-- ============================================================================

begin;

-- Clear every child row that references the dev lesson before deleting it.
-- lessons has RESTRICT foreign keys from user_lesson_completions and
-- journal_entries (and ON DELETE CASCADE from lesson_categories), so each must
-- be removed first. These are all dev-only test rows tied to the removed demo.
delete from public.user_lesson_completions
 where lesson_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

delete from public.journal_entries
 where lesson_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

delete from public.lesson_categories
 where lesson_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

delete from public.lessons
 where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

commit;

-- VERIFY (run after push):
--   select count(*) from public.lessons where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'; -- expect 0
