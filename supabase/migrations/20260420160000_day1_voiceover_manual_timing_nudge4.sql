-- Day 1 VO: mental performance +0.5s; Mindfulness -2s.

begin;

update public.lessons
set duration_seconds = 268,
    content_blocks = '{"blocks": [{"type": "voiceover", "audio_files": ["lesson_01/lesson_01_seg_01_02.mp3"], "total_audio_seconds": 109.48, "timed_text": [{"start_s": 0.24, "text": "Welcome to Relentless."}, {"start_s": 15.28, "text": "This is mental performance training."}, {"start_s": 22.68, "text": "The framework is called MAC."}, {"start_s": 49.9, "text": "Mindfulness — notice where your attention is and choose where it goes."}, {"start_s": 66.22, "text": "Acceptance — feel uncomfortable without treating it like an emergency."}, {"start_s": 81.36, "text": "Commitment — show up, regardless of how you feel."}, {"start_s": 107.72, "text": "Which one do you need most?"}]}, {"type": "flash_cards", "ambient_audio": "ambient/ambient_music.mp3", "cards": [{"front": "M — Mindfulness", "back": "Notice where your attention goes. Choose where it goes."}, {"front": "A — Acceptance", "back": "Feel the discomfort. Don''t react to it."}, {"front": "C — Commitment", "back": "Show up. Regardless of how you feel."}]}, {"type": "voiceover", "audio_files": ["lesson_01/lesson_01_seg_03.mp3"], "total_audio_seconds": 23.94, "timed_text": [{"start_s": 0.66, "text": "Got your answer?"}, {"start_s": 2.72, "text": "Remember it."}, {"start_s": 4.22, "text": "On Day 30 — I''m going to ask you again."}, {"start_s": 7.94, "text": "Go ahead and hit the journal."}, {"start_s": 9.9, "text": "One question."}, {"start_s": 11.66, "text": "Be honest."}, {"start_s": 13.88, "text": "After you finish — you''ll officially complete Day 1."}]}, {"type": "journal_prompt", "prompt": "Which of the three — Mindfulness, Acceptance, or Commitment — is your biggest weakness right now? Why?"}]}'::jsonb,
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
