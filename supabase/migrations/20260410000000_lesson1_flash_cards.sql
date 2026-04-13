-- Replace Day 1 timed_exercise with flash_cards block type.
-- Cards are user-paced: tap to flip, tap Next to advance.

begin;

update public.lessons
set
  content_blocks = '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_01/lesson_01_seg_01.mp3",
          "lesson_01/lesson_01_seg_02.mp3"
        ],
        "total_audio_seconds": 110.6,
        "timed_text": [
          { "start_s": 0.0,   "text": "Welcome to Relentless." },
          { "start_s": 17.0,  "text": "This is mental performance training." },
          { "start_s": 23.0,  "text": "The framework is called MAC." },
          { "start_s": 44.0,  "text": "Mindfulness — notice where your attention is and choose where it goes." },
          { "start_s": 64.0,  "text": "Acceptance — feel uncomfortable without treating it like an emergency." },
          { "start_s": 77.0,  "text": "Commitment — show up, regardless of how you feel." },
          { "start_s": 104.0, "text": "Which one do you need most?" }
        ]
      },
      {
        "type": "flash_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
          { "front": "M — Mindfulness", "back": "Notice where your attention goes. Choose where it goes." },
          { "front": "A — Acceptance", "back": "Feel the discomfort. Don''t react to it." },
          { "front": "C — Commitment", "back": "Show up. Regardless of how you feel." }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_01/lesson_01_seg_03.mp3"
        ],
        "total_audio_seconds": 26.0,
        "timed_text": [
          { "start_s": 0.0,  "text": "Got your answer? Remember it." },
          { "start_s": 4.0,  "text": "On Day 30 — I''m going to ask you again." },
          { "start_s": 9.0,  "text": "Go ahead and hit the journal. One question. Be honest." },
          { "start_s": 15.0, "text": "After you finish — you''ll officially complete Day 1." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Which of the three — Mindfulness, Acceptance, or Commitment — is your biggest weakness right now? Why?"
      }
    ]
  }'::jsonb,
  updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
