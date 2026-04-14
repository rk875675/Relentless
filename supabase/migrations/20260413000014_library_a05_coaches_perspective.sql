-- ============================================================
-- Library Lesson A-05 Short: The Coach's Perspective
-- STRUCTURE: tap_through_text → prompt_cards → journal_prompt
--
-- UUID:       e2000000-0000-0000-0000-000000000009
-- sort_order: 240
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
  'e2000000-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000001',
  'The Coach''s Perspective',
  'library',
  240,
  240,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "You are almost always harder on yourself than you would ever be on someone you care about.",
          "Psychologist Ethan Kross at the University of Michigan found that advising yourself from a third-person perspective — as if you were coaching someone else — dramatically reduces emotional intensity and improves decision-making under stress.",
          "Distance is the tool. You''re going to use it right now.",
          "Think about an athlete coming to you with everything you''re currently carrying — the doubt, the fear, the pressure.",
          "What would you actually tell them? Not what sounds good. What would genuinely help?",
          "Write like you mean it. That athlete needs you right now."
        ]
      },
      {
        "type": "prompt_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
          {
            "intro_hold_seconds": 3,
            "prompt": "Describe your current situation as if you were an athlete walking into your own office. What are you dealing with?",
            "min_entry_seconds": 30
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "What would you tell that athlete right now?",
            "min_entry_seconds": 20
          }
        ],
        "summary": {
          "display": "last",
          "header": "Now read that back — this is what you need to tell yourself.",
          "hold_seconds": 15
        }
      },
      {
        "type": "journal_prompt",
        "prompt": "Is there anything in that advice you''re not currently giving yourself? What''s stopping you?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e2000000-0000-0000-0000-000000000009',
  'acceptance'
);

commit;
