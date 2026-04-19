-- User-paced lesson UX: text-step `timed_exercise` blocks and `prompt_cards`
-- blocks no longer auto-advance on a timer. Recompute lessons.duration_seconds
-- so the home-card "approx min" reflects the new pacing.
--
-- Formula:
--   voiceover            -> total_audio_seconds
--   timed_exercise (interactive_model)        -> unchanged (still timer-driven)
--   timed_exercise (text-step, no model)      -> steps.length * 5
--   tap_through_text     -> paragraphs.length * 4
--   prompt_cards         -> cards.length * 25
--   journal_prompt       -> 60 (writing time, matches prior convention)
--
-- Lessons NOT touched here:
--   Day 1 (lesson_01): no timed text steps to begin with.
--   Day 5/6 (lesson_05/06): only box_breathing exercises (interactive, unchanged).
--   library_m_*, library_a_01/02, library_c_02/03: no text-step exercises or
--     prompt_cards (or already accurate).

begin;

-- Day 2: 116 (vo seg01) + 2*5 (text-step exercise) + 24 (vo seg02) + 60 (journal) = 210
update public.lessons
set duration_seconds = 210
where id = 'd0000000-0000-0000-0000-000000000002';

-- Day 3: 51 + 3*5 + 26 + 60 = 152
update public.lessons
set duration_seconds = 152
where id = 'd0000000-0000-0000-0000-000000000003';

-- Day 4: 83 + 4*5 + 17 + 60 = 180
update public.lessons
set duration_seconds = 180
where id = 'd0000000-0000-0000-0000-000000000004';

-- Day 7: 71 (vo seg01) + 16 (box_breathing intro, kept) + 2*5 (text-step) + 24 (vo seg02) + 60 = 181
update public.lessons
set duration_seconds = 181
where id = 'd0000000-0000-0000-0000-000000000007';

-- Future Self (library_c_01_short): 6*4 (tap_through) + 4*25 (prompt_cards) + 60 (journal) = 184
update public.lessons
set duration_seconds = 184
where id = 'e3000000-0000-0000-0000-000000000001';

-- library_a_03_short (Name It, Face It): 6*4 + 3*25 + 60 = 159
update public.lessons
set duration_seconds = 159
where id = 'e2000000-0000-0000-0000-000000000005';

-- library_a_04_short (The Honest Line): 6*4 + 2*25 + 60 = 134
update public.lessons
set duration_seconds = 134
where id = 'e2000000-0000-0000-0000-000000000007';

-- library_a_05_short (The Coach's Perspective): 6*4 + 2*25 + 60 = 134
update public.lessons
set duration_seconds = 134
where id = 'e2000000-0000-0000-0000-000000000009';

-- library_a_06_short (Emotional Replay): 6*4 + 4*25 + 60 = 184
update public.lessons
set duration_seconds = 184
where id = 'e2000000-0000-0000-0000-000000000011';

commit;
