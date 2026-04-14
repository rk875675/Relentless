-- ============================================================
-- Library Lesson A-04 Short: The Honest Line
-- STRUCTURE: tap_through_text → prompt_cards → journal_prompt
--
-- UUID:       e2000000-0000-0000-0000-000000000007
-- sort_order: 230
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
  'e2000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'The Honest Line',
  'library',
  120,
  230,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Pretending you feel ready when you don''t costs more energy than just admitting it. Your brain knows the truth. Fighting it is the drain.",
          "Cognitive acceptance research shows that athletes who acknowledge their actual situation — rather than suppressing or reframing it — perform more consistently under pressure.",
          "Even the most positive athletes can crash and burn. When positivity has no direction, it becomes suppression. And suppressed fears eventually surface.",
          "This exercise isn''t about feeling better. It''s about being clear.",
          "You''re going to write exactly where you are right now. No spin. No positivity for the sake of it.",
          "Then you''re going to answer one question that matters more than any pep talk. Be honest. The only person reading this is you."
        ]
      },
      {
        "type": "prompt_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
          {
            "intro_hold_seconds": 3,
            "prompt": "What is actually true about your situation right now? What are you actually feeling toward it? Don''t filter your thoughts.",
            "min_entry_seconds": 30
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "How can you reframe your mindset to be prepared for what actually could happen?",
            "min_entry_seconds": 30
          }
        ],
        "summary": {
          "display": "last",
          "header": "",
          "hold_seconds": 10
        }
      },
      {
        "type": "journal_prompt",
        "prompt": "What does following through on that reframe actually look like in practice tomorrow?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e2000000-0000-0000-0000-000000000007',
  'acceptance'
);

commit;
