-- Library Lesson M-03 Short: Milk Breath
-- tap_through_text block (6 paragraphs, ambient music) →
-- timed_exercise milk_breath (80s, 8 visual-cue steps × 10s) →
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
  'e1000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'Milk Breath',
  'library',
  120,
  120,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Not every moment calls for intensity. Not every moment calls for calm. Sometimes you just need to be level.",
          "Milk Breath is equal breathing — the same count in as out. No force in either direction.",
          "Four seconds in through the nose. Four seconds out through the mouth.",
          "The goal isn''t to feel anything. The goal is to return to zero.",
          "Use this between events, between reps, or any time you''ve been pulled off your baseline.",
          "Start now. Let the circle guide you."
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 80,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "milk_breath",
        "steps": [
          { "text": "No agenda. Just breathe.", "duration_seconds": 10 },
          { "text": "In through the nose. Out through the mouth.", "duration_seconds": 10 },
          { "text": "Don''t force calm. Let it come.", "duration_seconds": 10 },
          { "text": "You''re not going up or down. You''re finding zero.", "duration_seconds": 10 },
          { "text": "Notice where you were when you started. Notice where you are now.", "duration_seconds": 10 },
          { "text": "Stay even. That''s the whole job.", "duration_seconds": 10 },
          { "text": "This is what steady feels like.", "duration_seconds": 10 },
          { "text": "Carry this into whatever''s next.", "duration_seconds": 10 }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Where were you mentally before this? Where are you now?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('e1000000-0000-0000-0000-000000000005', 'mindfulness');

commit;
