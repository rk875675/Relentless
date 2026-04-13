-- Fix M-01 Box Breathing visual_cues that referenced "breathe in/out" during
-- the wrong phase. Because visual_cues cycle every 10 s while box phases
-- cycle every 4 s, directional cues will always span multiple phases and
-- mismatch. Replaced with phase-neutral motivational copy.
--
-- Changed cues (indices 2, 5, 8):
--   "When you breathe in, your heart may speed up. Accept it."
--     → "Your heart rate may shift with each cycle. That's normal."
--   "When you breathe out, your heart will slow down. Notice it."
--     → "Your heart rate will settle with each cycle. Notice it."
--   "When you breathe out, release your tension."
--     → "Release any tension you're holding right now."
--
-- REMINDER: Apostrophes inside SQL strings are doubled.

begin;

update public.lessons
set content_blocks = jsonb_set(
  content_blocks,
  '{blocks,1,visual_cues}',
  '[
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
  ]'::jsonb
)
where id = 'e1000000-0000-0000-0000-000000000001';

commit;
