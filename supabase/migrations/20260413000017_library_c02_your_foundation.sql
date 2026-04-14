-- ============================================================
-- Library Lesson C-02 Short: Your Foundation
-- STRUCTURE: tap_through_text → list_builder
--
-- UUID:       e3000000-0000-0000-0000-000000000003
-- sort_order: 310
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
  'e3000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Your Foundation',
  'library',
  240,
  310,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Every athlete hits a point where the grind stops feeling worth it. The times aren''t coming. The body isn''t cooperating. The motivation that used to come easy has gone quiet.",
          "This is the moment that separates the ones who make it from the ones who don''t. Not talent. Not training. The ability to return to why you started.",
          "You''re going to build a list of everything that fuels you. Why you love this. What keeps you coming back. What you''d miss if it were gone tomorrow.",
          "This isn''t a motivation exercise. It''s a foundation. Something you can return to on any day, in any season, when everything else stops making sense.",
          "There are no wrong answers. Write what''s actually true for you — not what sounds good.",
          "Build your list. Take your time."
        ]
      },
      {
        "type": "list_builder",
        "ambient_audio": "ambient/ambient_music.mp3",
        "prompts": [
          "Why do you love your sport?",
          "What do you love about it?",
          "What would you miss?",
          "Who got you into it?",
          "What are you willing to struggle for?"
        ],
        "min_entries": 5,
        "min_entry_seconds": 10,
        "summary_header": "This is your foundation.",
        "summary_hold_seconds": 15,
        "save_to_profile": true
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e3000000-0000-0000-0000-000000000003',
  'commitment'
);

commit;
