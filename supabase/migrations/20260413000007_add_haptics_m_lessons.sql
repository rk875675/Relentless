-- Add haptic fields to all M library lessons so users can follow with eyes closed.
--
-- M-01 Box Breathing : step-level haptics (heavy on Inhale/Exhale, light on both Holds)
-- M-02 Coffee Breath : haptic_pattern cycle 2s (heavy at 0s inhale, medium at 1s exhale)
-- M-03 Milk Breath   : haptic_pattern cycle 8s (medium at 0s inhale, medium at 4s exhale)
-- M-04 Whiskey Breath: haptic_pattern cycle 12s (medium at 0s inhale, light at 4s exhale)
-- M-05 Body Scan     : step-level haptics (medium on every zone transition)
--
-- REMINDER: Apostrophes inside SQL strings are doubled.

begin;

-- ----------------------------------------------------------------
-- M-01 Box Breathing
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- M-02 Coffee Breath
-- ----------------------------------------------------------------
update public.lessons
set content_blocks = '{
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
      "haptic_pattern": {
        "cycle_seconds": 2,
        "cues": [
          { "at_offset_seconds": 0, "intensity": "heavy" },
          { "at_offset_seconds": 1, "intensity": "medium" }
        ]
      },
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
where id = 'e1000000-0000-0000-0000-000000000003';

-- ----------------------------------------------------------------
-- M-03 Milk Breath
-- ----------------------------------------------------------------
update public.lessons
set content_blocks = '{
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
      "haptic_pattern": {
        "cycle_seconds": 8,
        "cues": [
          { "at_offset_seconds": 0, "intensity": "medium" },
          { "at_offset_seconds": 4, "intensity": "medium" }
        ]
      },
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
where id = 'e1000000-0000-0000-0000-000000000005';

-- ----------------------------------------------------------------
-- M-04 Whiskey Breath
-- ----------------------------------------------------------------
update public.lessons
set content_blocks = '{
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
      "haptic_pattern": {
        "cycle_seconds": 12,
        "cues": [
          { "at_offset_seconds": 0, "intensity": "medium" },
          { "at_offset_seconds": 4, "intensity": "light" }
        ]
      },
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
where id = 'e1000000-0000-0000-0000-000000000007';

-- ----------------------------------------------------------------
-- M-05 Body Scan
-- ----------------------------------------------------------------
update public.lessons
set content_blocks = '{
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
        { "text": "Top of your head. Just notice.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your jaw. Is it clenched? Soften it.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your neck and shoulders. Drop them away from your ears.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your chest. Is your breathing shallow? Let it open.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your arms. Are they braced? Let them go heavy.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your hands. Unclench them. Feel them relax.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your core. You don''t need to brace right now. Soften it.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your hips. Release whatever you''re gripping there.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your legs. Notice them. Let them be heavy.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Your feet. Feel them connected to the ground.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "Scan back up. Notice what changed.", "duration_seconds": 10, "haptic": "medium" },
        { "text": "You just gave your body permission to recover.", "duration_seconds": 10, "haptic": "medium" }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "Where were you holding the most tension? Did it release?"
    }
  ]
}'::jsonb
where id = 'e1000000-0000-0000-0000-000000000009';

commit;
