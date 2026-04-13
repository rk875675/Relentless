-- Library Lesson M-04 Short: Whiskey Breath
-- tap_through_text block (6 paragraphs, ambient music) →
-- timed_exercise whiskey_breath (120s, 12 visual-cue steps × 10s) →
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
  'e1000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'Whiskey Breath',
  'library',
  180,
  130,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Your body doesn''t automatically know when it''s time to stop. You have to tell it.",
          "Whiskey Breath uses a long exhale to activate your parasympathetic nervous system — the system responsible for rest and recovery.",
          "Four seconds in through the nose. Eight seconds out through the mouth.",
          "The exhale is the signal. The longer it is, the more your body believes it''s safe to shut down.",
          "This works best when you''re winding down — after a hard session, before bed, or any time you need to transition out of compete mode.",
          "Get comfortable. Close your eyes. Let the circle lead you out."
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 120,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "whiskey_breath",
        "steps": [
          { "text": "Get comfortable. Let your body go heavy.", "duration_seconds": 10 },
          { "text": "Let the exhale carry you down.", "duration_seconds": 10 },
          { "text": "Longer out than in. Don''t rush it.", "duration_seconds": 10 },
          { "text": "Your heart rate is dropping right now.", "duration_seconds": 10 },
          { "text": "You don''t need to be ready for anything.", "duration_seconds": 10 },
          { "text": "Just breathe out. That''s the whole job.", "duration_seconds": 10 },
          { "text": "Every exhale is a signal to your body — it''s safe to rest.", "duration_seconds": 10 },
          { "text": "Let your jaw soften. Let your shoulders drop.", "duration_seconds": 10 },
          { "text": "You''re not falling behind. You''re recovering.", "duration_seconds": 10 },
          { "text": "Sink a little deeper with every breath out.", "duration_seconds": 10 },
          { "text": "Let your body believe it''s safe to shut down.", "duration_seconds": 10 },
          { "text": "You''ve done enough. Let go.", "duration_seconds": 10 }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "How does your body feel compared to when you started? Do you feel calm?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('e1000000-0000-0000-0000-000000000007', 'mindfulness');

commit;
