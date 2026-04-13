-- Remove V1 seed placeholder Mindfulness library lessons.
-- These were inserted by 20260328000001_seed_v1_content.sql and are now
-- replaced by real content (M-01 through M-05 Short).
-- Also removes any completion records referencing these placeholder rows
-- before deleting the lessons themselves.

begin;

delete from public.user_lesson_completions
where lesson_id in (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002'
);

delete from public.lesson_categories
where lesson_id in (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002'
);

delete from public.lessons
where id in (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002'
);

commit;
