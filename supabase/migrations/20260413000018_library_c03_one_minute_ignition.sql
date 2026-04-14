-- ============================================================
-- Library Lesson C-03 Short: One Minute Ignition
-- STRUCTURE: tap_through_text → countdown_timer → journal_prompt
--
-- UUID:       e3000000-0000-0000-0000-000000000005
-- sort_order: 320
-- category:   commitment
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
  'e3000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'One Minute Ignition',
  'library',
  60,
  320,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "You''re not going to wait until you feel motivated. That''s not how this works.",
          "Research in behavioral psychology shows that action precedes motivation — not the other way around. You don''t feel ready and then start. You start, and then you feel ready.",
          "The hardest part is always the first minute. Not the workout. Not the session. The first minute.",
          "You''re going to pick one thing right now and do it for 60 seconds. That''s the whole job.",
          "It doesn''t matter if you finish it. It doesn''t matter if it''s big. What matters is that you start.",
          "Pick something. Hit go. The rest will follow."
        ]
      },
      {
        "type": "countdown_timer",
        "ambient_audio": "ambient/ambient_music.mp3",
        "duration_seconds": 60,
        "task_list": [
          "60 seconds of stretching",
          "A set of pushups",
          "A set of core work",
          "Drink a full glass of water",
          "Do your dishes",
          "Read one page of that book next to you",
          "Write down three things you need to do today",
          "Make your bed",
          "Text someone you''ve been meaning to reach out to",
          "Set your stuff out for your next practice"
        ],
        "completion_message": "You started. That''s the hardest part.",
        "completion_hold_seconds": 3
      },
      {
        "type": "journal_prompt",
        "prompt": "What did you start?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e3000000-0000-0000-0000-000000000005',
  'commitment'
);

commit;
