-- Migration: seed V1 placeholder content
-- Inserts one coach, one onboarding sample lesson, and a minimal set of
-- library lessons (2 per MAC category) so endpoints return data.
-- All content is placeholder — replace with real coaching-partner content.
--
-- Fixed UUIDs are used so ONBOARDING_SAMPLE_LESSON_ID can be set as a
-- Supabase secret without querying the DB first.
--
-- Human Input Needed: real coach name/bio, real lesson titles/content,
-- voiceover asset URLs, reflection prompts, progress_metadata weights.

begin;

-- ============================================================
-- 1. Coach (V1 partner — placeholder)
-- ============================================================

insert into public.coaches (id, name, sport, bio)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Coach TBD',
  'track',
  'V1 track & field mental performance coach. Replace with real partner details.'
);

-- ============================================================
-- 2. Onboarding sample lesson (pre-paywall)
-- ============================================================

insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, reflection_prompt, sort_order, published)
values (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Welcome to Relentless',
  120,
  'onboarding-sample',
  'A quick introduction to mental performance training for athletes.',
  'What is one area of your mental game you want to strengthen?',
  0,
  true
);

insert into public.lesson_categories (lesson_id, category)
values ('b0000000-0000-0000-0000-000000000001', 'mindfulness');

-- ============================================================
-- 3. Library lessons — 2 per MAC category (1 short, 1 long)
-- ============================================================

-- Mindfulness: short
insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, sort_order, published)
values (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Mindfulness — Focus Reset',
  150,
  'library-short',
  'Placeholder short mindfulness lesson.',
  1,
  true
);
insert into public.lesson_categories (lesson_id, category)
values ('c0000000-0000-0000-0000-000000000001', 'mindfulness');

-- Mindfulness: long
insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, sort_order, published)
values (
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'Mindfulness — Present Moment Awareness',
  300,
  'library-long',
  'Placeholder long mindfulness lesson.',
  2,
  true
);
insert into public.lesson_categories (lesson_id, category)
values ('c0000000-0000-0000-0000-000000000002', 'mindfulness');

-- Acceptance: short
insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, sort_order, published)
values (
  'c0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Acceptance — Letting Go of Outcomes',
  150,
  'library-short',
  'Placeholder short acceptance lesson.',
  3,
  true
);
insert into public.lesson_categories (lesson_id, category)
values ('c0000000-0000-0000-0000-000000000003', 'acceptance');

-- Acceptance: long
insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, sort_order, published)
values (
  'c0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'Acceptance — Embracing the Process',
  300,
  'library-long',
  'Placeholder long acceptance lesson.',
  4,
  true
);
insert into public.lesson_categories (lesson_id, category)
values ('c0000000-0000-0000-0000-000000000004', 'acceptance');

-- Commitment: short
insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, sort_order, published)
values (
  'c0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'Commitment — Daily Intention Setting',
  150,
  'library-short',
  'Placeholder short commitment lesson.',
  5,
  true
);
insert into public.lesson_categories (lesson_id, category)
values ('c0000000-0000-0000-0000-000000000005', 'commitment');

-- Commitment: long
insert into public.lessons (id, coach_id, title, duration_seconds, lesson_type, on_screen_text, sort_order, published)
values (
  'c0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'Commitment — Values-Driven Training',
  300,
  'library-long',
  'Placeholder long commitment lesson.',
  6,
  true
);
insert into public.lesson_categories (lesson_id, category)
values ('c0000000-0000-0000-0000-000000000006', 'commitment');

commit;
