-- Migration: add content_blocks JSONB column to lessons, insert Day 1 real
-- content, update Coach TBD → Coach Grant, create lesson-audio storage bucket.
--
-- Backward-compatible: content_blocks is nullable.  Days 2-30 keep old flat
-- columns until real content is delivered for those days.

begin;

-- ============================================================
-- 1. Add content_blocks column (nullable for backward compat)
-- ============================================================

alter table public.lessons add column if not exists content_blocks jsonb;

comment on column public.lessons.content_blocks is
  'Ordered array of typed lesson blocks (voiceover, timed_exercise, journal_prompt). When present, the client uses block-based playback; when null, falls back to legacy flat columns.';

-- ============================================================
-- 2. Update coach name
-- ============================================================

update public.coaches
set name = 'Coach Grant',
    bio  = 'V1 track & field mental performance coach.'
where id = 'a0000000-0000-0000-0000-000000000001';

-- ============================================================
-- 3. Insert Day 1 real lesson
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'What MAC Training Actually Is',
  187,
  'standard',
  0,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_01/lesson_01_seg_01.wav",
          "lesson_01/lesson_01_seg_02.wav"
        ],
        "total_audio_seconds": 108.0,
        "timed_text": [
          { "start_s": 0.0,  "text": "This is mental performance training." },
          { "start_s": 22.7, "text": "The framework is called MAC." },
          { "start_s": 38.0, "text": "Mindfulness — notice where your attention is and choose where it goes." },
          { "start_s": 55.0, "text": "Acceptance — feel uncomfortable without treating it like an emergency." },
          { "start_s": 72.0, "text": "Commitment — show up, regardless of how you feel." },
          { "start_s": 90.0, "text": "Which one do you need most?" }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 60,
        "ambient_audio": "ambient/ambient_music.mp3",
        "steps": [
          { "text": "M — Mindfulness. Notice where your attention goes. Choose where it goes.", "duration_seconds": 20 },
          { "text": "A — Acceptance. Feel the discomfort. Don''t react to it.", "duration_seconds": 20 },
          { "text": "C — Commitment. Show up. Regardless of how you feel.", "duration_seconds": 20 }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_01/lesson_01_seg_03.wav"
        ],
        "total_audio_seconds": 18.5,
        "timed_text": [
          { "start_s": 0.0, "text": "Remember your answer." },
          { "start_s": 8.0, "text": "On Day 30 — I''m going to ask you again." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Which of the three — Mindfulness, Acceptance, or Commitment — is your biggest weakness right now? Why?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('d0000000-0000-0000-0000-000000000001', 'mindfulness');

-- ============================================================
-- 4. Point program_schedule Day 1 to the real lesson
-- ============================================================

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000001',
    updated_at = now()
where program_version = 'v1'
  and day_number = 1;

-- ============================================================
-- 5. Create private storage bucket for lesson audio
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-audio', 'lesson-audio', false, 52428800)
on conflict (id) do nothing;

commit;
