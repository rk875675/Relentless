-- ============================================================
-- Library Lesson A-01 Short: Worry Drop
-- STRUCTURE: tap_through_text → bubble_sort
--
-- UUID:       e2000000-0000-0000-0000-000000000001
-- sort_order: 200
-- category:   acceptance
--
-- See content/DEVELOPER_IMPL_GUIDE.md for UUID registry and block docs.
-- REMINDER: Apostrophes inside SQL strings must be doubled (don''t, that''s).
-- ============================================================

begin;

insert into public.lessons (
  id,
  coach_id,
  title,
  lesson_type,
  duration_seconds,
  sort_order,
  published,
  content_blocks
) values (
  'e2000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Worry Drop',
  'library',
  180,
  200,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Your brain doesn''t know the difference between a real threat and a perceived one. It treats every worry the same — urgent, unresolved, consuming.",
          "The goal of this exercise isn''t to fix your worries. It''s to sort them.",
          "You''re going to write down everything on your mind right now. Every fear, every doubt, every what-if — as separate entries.",
          "Then you''re going to let go of anything you can''t control today. Not forever. Just for now.",
          "What''s left is your actual job. And you''re going to figure out exactly what to do about it.",
          "Start by getting it all out. Don''t filter. Don''t judge. Just write."
        ]
      },
      {
        "type": "bubble_sort",
        "ambient_audio": "ambient/ambient_music.mp3",
        "entry_instruction": "Write down everything on your mind. One worry at a time.",
        "entry_done_label": "I''m done",
        "discard_instruction": "Tap any bubble that is outside your control right now.",
        "can_restore": true,
        "action_prompt": "What is the one next step you can take on this?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e2000000-0000-0000-0000-000000000001',
  'acceptance'
);

commit;
