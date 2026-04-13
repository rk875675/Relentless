-- Library Lesson M-02 Short: Coffee Breath
-- tap_through_text block (6 paragraphs, ambient music) →
-- timed_exercise coffee_breath (60s, 6 visual-cue steps × 10s) →
-- journal_prompt
-- REMINDER: Apostrophes inside SQL strings are doubled.

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
  'e1000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Coffee Breath',
  'library',
  60,
  110,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Most athletes wait to feel ready. You don''t have that luxury right now.",
          "Coffee Breath is controlled hyperventilating — one second in, one second out.",
          "It activates your sympathetic nervous system — the same switch that fires when your body needs to perform.",
          "This isn''t meditation. This is ignition.",
          "When the exercise starts, breathe fast and keep pace with the circle.",
          "Don''t overthink it. Just move air. The energy will follow."
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 60,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "coffee_breath",
        "steps": [
          { "text": "Keep pace. Don''t slow down.", "duration_seconds": 10 },
          { "text": "Fast in, fast out. Stay with it.", "duration_seconds": 10 },
          { "text": "You''re firing up your nervous system right now.", "duration_seconds": 10 },
          { "text": "You may feel a tingle. That''s the shift happening.", "duration_seconds": 10 },
          { "text": "Stay sharp. You''re almost there.", "duration_seconds": 10 },
          { "text": "Feel the difference. That''s intensity on demand.", "duration_seconds": 10 }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "What did that feel like in your body? Did it work?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('e1000000-0000-0000-0000-000000000003', 'mindfulness');

commit;
