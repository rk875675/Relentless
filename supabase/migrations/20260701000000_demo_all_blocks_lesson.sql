-- ============================================================================
-- 20260701000000_demo_all_blocks_lesson.sql
-- TEMPORARY dev-only demo lesson containing EVERY content block type, for a
-- screen-recording walkthrough of the block library for coaches.
--
-- ISOLATED / SAFE FOR PROD:
--   * production_ready = false  -> the lessons Edge Function only returns this
--     lesson to is_dev accounts; real users can never fetch it.
--   * lesson_type = 'dev-test', NO program_schedule row, NO lesson_categories
--     rows -> it never surfaces in the WOD rotation, library tabs, or program
--     feeds.
--   * Reachable ONLY via the is_dev/__DEV__-gated button at the bottom of the
--     home screen (see mobile/app/(tabs)/index.tsx).
--
-- Audio reuses Grant's Day 1 closing segment (lesson_01/lesson_01_seg_03.mp3)
-- for the voiceover block; all exercise blocks reuse ambient/ambient_music.mp3.
--
-- TEARDOWN (after recording): delete this lesson row + revert the home button.
--   delete from public.lessons where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
--
-- Run:  npx supabase db push
-- ============================================================================

begin;

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published, production_ready, content_blocks
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'a0000000-0000-0000-0000-000000000001',
  'Demo: All Block Types',
  200,
  'dev-test',
  0,
  true,
  false,
  '{"blocks":[
    {"type":"voiceover","audio_files":["lesson_01/lesson_01_seg_03.mp3"],"total_audio_seconds":23.94,"timed_text":[{"start_s":0,"text":"Voiceover block. The coach talks and words appear on screen."},{"start_s":8,"text":"This is the on-screen text, synced to the audio."}]},
    {"type":"timed_exercise","interactive_model":"breathing","ambient_audio":"ambient/ambient_music.mp3","pattern":[{"phase":"inhale","duration_seconds":4,"label":"Inhale"},{"phase":"exhale","duration_seconds":4,"label":"Exhale"}],"rep_count":4,"duration_seconds":32},
    {"type":"flash_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"front":"Front","back":"Back"},{"front":"Flash card 2 front","back":"Flash card 2 back"}]},
    {"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Multi-step question 1. Write your answer.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Multi-step question 2. Write your answer.","min_entry_seconds":0}],"summary":{"display":"all","header":"Your answers","hold_seconds":3}},
    {"type":"examples_with_entry","ambient_audio":"ambient/ambient_music.mp3","examples_header":"Examples","examples":["Example one","Example two","Example three"],"input_prompt":"Now write your own."},
    {"type":"anchor_entry","ambient_audio":"ambient/ambient_music.mp3","entry_prompt":"Enter one word to anchor your focus.","hold_prompt":"Hold your focus on this word."},
    {"type":"multi_select","ambient_audio":"ambient/ambient_music.mp3","prompt":"Multiple choice. Tap all that apply.","options":["Option A","Option B","Option C","Option D"],"min_select":0},
    {"type":"multi_field_entry","ambient_audio":"ambient/ambient_music.mp3","header":"Labelled form","fields":[{"label":"Field one label"},{"label":"Field two label"},{"label":"Field three label"}]},
    {"type":"physiological_sigh","first_inhale_seconds":4,"sneak_inhale_seconds":1,"exhale_seconds":8,"phase_cues":{"first_inhale":"First inhale","sneak_inhale":"Second short inhale","exhale":"Long exhale"}},
    {"type":"journal_prompt","prompt":"Journal prompt. This saves to your journal and always ends the lesson."}
  ]}'::jsonb
)
on conflict (id) do update set
  coach_id = excluded.coach_id,
  title = excluded.title,
  duration_seconds = excluded.duration_seconds,
  lesson_type = excluded.lesson_type,
  sort_order = excluded.sort_order,
  published = excluded.published,
  production_ready = excluded.production_ready,
  content_blocks = excluded.content_blocks,
  updated_at = now();

commit;

-- VERIFY (run after push):
--   select id, title, production_ready, lesson_type from public.lessons
--    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
