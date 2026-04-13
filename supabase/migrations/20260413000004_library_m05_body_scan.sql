-- Library Lesson M-05 Short: Body Scan
-- tap_through_text block (6 paragraphs, ambient music) →
-- timed_exercise body_scan (120s, 12 zone-cue steps × 10s, head to feet) →
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
  'e1000000-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000001',
  'Body Scan',
  'library',
  180,
  140,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Your body is always sending you signals. Most of the time, you''re not listening.",
          "Right now, you''re holding tension somewhere — your jaw, your shoulders, your hands. You might not even know it.",
          "A body scan moves your attention slowly through your body from head to feet.",
          "You''re not trying to fix anything. You''re just noticing. Then releasing.",
          "This is one of the most practiced techniques in elite sports psychology. Simple doesn''t mean easy.",
          "Sit or lie down if you can. Close your eyes. Begin when you''re ready."
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 120,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "body_scan",
        "steps": [
          { "text": "Top of your head. Just notice.", "duration_seconds": 10 },
          { "text": "Your jaw. Is it clenched? Soften it.", "duration_seconds": 10 },
          { "text": "Your neck and shoulders. Drop them away from your ears.", "duration_seconds": 10 },
          { "text": "Your chest. Is your breathing shallow? Let it open.", "duration_seconds": 10 },
          { "text": "Your arms. Are they braced? Let them go heavy.", "duration_seconds": 10 },
          { "text": "Your hands. Unclench them. Feel them relax.", "duration_seconds": 10 },
          { "text": "Your core. You don''t need to brace right now. Soften it.", "duration_seconds": 10 },
          { "text": "Your hips. Release whatever you''re gripping there.", "duration_seconds": 10 },
          { "text": "Your legs. Notice them. Let them be heavy.", "duration_seconds": 10 },
          { "text": "Your feet. Feel them connected to the ground.", "duration_seconds": 10 },
          { "text": "Scan back up. Notice what changed.", "duration_seconds": 10 },
          { "text": "You just gave your body permission to recover.", "duration_seconds": 10 }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Where were you holding the most tension? Did it release?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('e1000000-0000-0000-0000-000000000009', 'mindfulness');

commit;
