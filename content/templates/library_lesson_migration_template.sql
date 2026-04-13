-- ============================================================
-- Library Lesson [CATEGORY]-[NN] [Short|Long]: [TITLE]
-- [STRUCTURE: e.g. tap_through_text → box_breathing → journal_prompt]
--
-- UUID:       [e.g. e1000000-0000-0000-0000-000000000003]
-- sort_order: [e.g. 110]
-- category:   [mindfulness | acceptance | commitment]
--
-- See content/DEVELOPER_IMPL_GUIDE.md for UUID registry and block docs.
-- REMINDER: Apostrophes inside SQL strings must be doubled (don''t, that''s).
-- ============================================================

begin;

insert into public.lessons (
  id,
  coach_id,
  title,
  lesson_type,
  duration_seconds,
  sort_order,
  published,
  content_blocks
) values (
  -- UUID from registry (DEVELOPER_IMPL_GUIDE.md § 2)
  'e1000000-0000-0000-0000-000000000003',

  -- Coach ID — always this value for V1
  'a0000000-0000-0000-0000-000000000001',

  -- Lesson title shown in the app
  'LESSON TITLE',

  'library',

  -- duration_seconds: realistic wall-clock total (see guide § 6).
  -- The library card shows "SHORT" not the time, so this only affects
  -- the ~X min label on the lesson-player ready screen.
  180,

  -- sort_order: from registry (M=100s, A=200s, C=300s; pairs at 10-increments)
  110,

  true,

  -- ----------------------------------------------------------------
  -- content_blocks — paste the blocks array from the JSON template.
  -- Replace _comment/_option_* keys with the real block you want.
  -- ----------------------------------------------------------------
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Paragraph one.",
          "Paragraph two.",
          "Paragraph three.",
          "Paragraph four.",
          "Paragraph five."
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
        "prompt": "Journal question here."
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e1000000-0000-0000-0000-000000000003',
  'mindfulness'   -- mindfulness | acceptance | commitment
);

commit;
