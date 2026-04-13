-- Add visual_cues to M-01 Box Breathing exercise block.
-- These 12 motivational phrases cycle every 10 s during the 120 s exercise,
-- displayed beneath the INHALE/HOLD/EXHALE/HOLD phase label.
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
      "visual_cues": [
        "Drop your shoulders. Relax.",
        "Breathe in through your nose, out through your mouth.",
        "Your heart rate may shift with each cycle. That''s normal.",
        "Breath connects your mind and your body.",
        "Where is your mind right now? Return it to your breath.",
        "Your heart rate will settle with each cycle. Notice it.",
        "The hold phases level your blood-oxygen. Stay with them.",
        "You can''t always control what happens out there.",
        "Release any tension you''re holding right now.",
        "Don''t lose your rhythm.",
        "What is one thing you can always control? Your breath.",
        "Breath brings awareness."
      ],
      "steps": [
        { "text": "Inhale", "duration_seconds": 4, "haptic": "heavy" },
        { "text": "Hold",   "duration_seconds": 4, "haptic": "light" },
        { "text": "Exhale", "duration_seconds": 4, "haptic": "heavy" },
        { "text": "Hold",   "duration_seconds": 4, "haptic": "light" }
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
