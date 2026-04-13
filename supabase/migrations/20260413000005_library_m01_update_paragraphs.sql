-- Library Lesson M-01 Short: Box Breathing — content update
-- Updates tap_through_text paragraphs to new copy (6 paragraphs replacing 5).
-- exercise block and journal_prompt are unchanged.
-- REMINDER: Apostrophes inside SQL strings are doubled.

begin;

update public.lessons
set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "Navy SEALs use this before combat. Surgeons use it before operations. Now you''re going to use it before battle.",
        "The structure is simple: four seconds in, four hold, four out, four hold.",
        "Breathe in through your nose, out through your mouth.",
        "This isn''t just about calming down — it gives your mind something precise to lock onto when it wants to spiral.",
        "If your mind drifts, that''s fine. Acknowledge the thought, let it go, and return to your breath.",
        "Close your eyes if you''d like. The exercise begins now."
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
where id = 'e1000000-0000-0000-0000-000000000001';

commit;
