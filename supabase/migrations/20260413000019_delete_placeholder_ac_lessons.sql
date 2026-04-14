-- Remove V1 seed placeholder Acceptance and Commitment library lessons.
-- These were inserted by 20260328000001_seed_v1_content.sql and are now
-- replaced by real content (A-01 through A-06 and C-01 through C-03 Short).

begin;

delete from public.user_lesson_completions
where lesson_id in (
  'c0000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000005',
  'c0000000-0000-0000-0000-000000000006'
);

delete from public.lesson_categories
where lesson_id in (
  'c0000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000005',
  'c0000000-0000-0000-0000-000000000006'
);

delete from public.lessons
where id in (
  'c0000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000005',
  'c0000000-0000-0000-0000-000000000006'
);

commit;
