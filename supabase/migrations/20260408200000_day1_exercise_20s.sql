-- Shorten Day 1 exercise from 60s to 20s (7+7+6).

begin;

update public.lessons
set
  duration_seconds = 148,
  content_blocks = '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_01/lesson_01_seg_01.mp3",
          "lesson_01/lesson_01_seg_02.mp3"
        ],
        "total_audio_seconds": 103.0,
        "timed_text": [
          { "start_s": 0.0,  "text": "This is mental performance training." },
          { "start_s": 23.0, "text": "The framework is called MAC." },
          { "start_s": 38.0, "text": "Mindfulness — notice where your attention is and choose where it goes." },
          { "start_s": 55.0, "text": "Acceptance — feel uncomfortable without treating it like an emergency." },
          { "start_s": 72.0, "text": "Commitment — show up, regardless of how you feel." },
          { "start_s": 90.0, "text": "Which one do you need most?" }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 20,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "Three text cards displayed one at a time, centered on screen, auto-advancing. Each card fades out and the next fades in. Ambient music plays throughout. No user input required — athlete reads and reflects silently.",
        "steps": [
          { "text": "M — Mindfulness. Notice where your attention goes. Choose where it goes.", "duration_seconds": 7 },
          { "text": "A — Acceptance. Feel the discomfort. Don''t react to it.", "duration_seconds": 7 },
          { "text": "C — Commitment. Show up. Regardless of how you feel.", "duration_seconds": 6 }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_01/lesson_01_seg_03.mp3"
        ],
        "total_audio_seconds": 25.0,
        "timed_text": [
          { "start_s": 0.0,  "text": "Got your answer? Remember it." },
          { "start_s": 5.0,  "text": "On Day 30 — I''m going to ask you again." },
          { "start_s": 10.0, "text": "Go ahead and hit the journal. One question. Be honest." },
          { "start_s": 17.0, "text": "After you finish — you''ll officially complete Day 1." }
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
