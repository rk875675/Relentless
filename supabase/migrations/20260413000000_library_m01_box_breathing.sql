-- Library Lesson M-01 Short: Box Breathing
-- tap_through_text block (5 paragraphs, ambient music) →
-- timed_exercise box_breathing (120s, animated circle) →
-- journal_prompt

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
  'e1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Box Breathing',
  'library',
  180,
  100,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Box Breathing is used by Navy SEALs before combat, surgeons before operations, and now athletes before battle.",
          "The structure is simple: four seconds in, four hold, four out, four hold.",
          "Box breathing is the most researched breath control technique for high-pressure performance.",
          "It doesn''t just calm you down — it gives your mind something precise to lock onto, which is exactly what you need when your brain wants to spiral.",
          "If your mind drifts, that''s ok. Just acknowledge the thought, let it go, and then calmly return your focus to your breath."
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 120,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "box_breathing",
        "steps": [
          { "text": "Inhale", "duration_seconds": 4 },
          { "text": "Hold",   "duration_seconds": 4 },
          { "text": "Exhale", "duration_seconds": 4 },
          { "text": "Hold",   "duration_seconds": 4 }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Is there anywhere you found your mind drifting? Write about it."
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('e1000000-0000-0000-0000-000000000001', 'mindfulness');

commit;
