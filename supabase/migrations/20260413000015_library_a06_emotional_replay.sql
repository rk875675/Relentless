-- ============================================================
-- Library Lesson A-06 Short: Emotional Replay
-- STRUCTURE: tap_through_text → prompt_cards → journal_prompt
--
-- UUID:       e2000000-0000-0000-0000-000000000011
-- sort_order: 250
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
  'e2000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'Emotional Replay',
  'library',
  240,
  250,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "You can''t regulate what you can''t see. Most athletes lose the mental battle not because they''re weak — but because they never learned to read what was happening inside them in real time.",
          "Research in emotional awareness training shows that athletes who can precisely identify and describe their emotional states have significantly better regulation under pressure.",
          "This exercise takes you back to a specific moment when an emotion worked against you.",
          "You''re not going back to fix it. You''re going back to map it — so next time, you recognize it early enough to do something about it.",
          "Think of one moment. A race, a practice, a workout where your head got in the way.",
          "Walk us through it. Be specific."
        ]
      },
      {
        "type": "prompt_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
          {
            "intro_hold_seconds": 3,
            "prompt": "What was the moment? Describe the situation specifically. Where were you? What was at stake?",
            "min_entry_seconds": 30
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "What did the emotion feel like physically? Where was it in your body?",
            "min_entry_seconds": 30
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "What thought came with it?",
            "min_entry_seconds": 20
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "What did you do next — and what do you wish you''d done instead?",
            "min_entry_seconds": 20
          }
        ],
        "summary": {
          "display": "all",
          "header": "This is what it looks like. Now you know.",
          "hold_seconds": 15
        }
      },
      {
        "type": "journal_prompt",
        "prompt": "If that moment happened again tomorrow, what would you do differently now that you can see it clearly?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e2000000-0000-0000-0000-000000000011',
  'acceptance'
);

commit;
