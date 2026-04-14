-- ============================================================
-- Library Lesson A-02 Short: Control Check
-- STRUCTURE: tap_through_text → two_column_sort
--
-- UUID:       e2000000-0000-0000-0000-000000000003
-- sort_order: 210
-- category:   acceptance
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
  'e2000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Control Check',
  'library',
  240,
  210,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "One of the fastest ways to lose your mental edge is spending energy on things you cannot change. Research consistently shows that perceived control is one of the strongest predictors of performance under pressure.",
          "This exercise forces you to get specific. Exactly what is and isn''t in your hands.",
          "You''re going to fill two columns. What I control. What I don''t.",
          "The uncontrollable side gets acknowledged, and then closed. You''re not ignoring it. You''re making a deliberate decision to stop spending energy there.",
          "The controllable side becomes your entire focus from this point forward.",
          "Be honest. Vague answers won''t help you."
        ]
      },
      {
        "type": "two_column_sort",
        "ambient_audio": "ambient/ambient_music.mp3",
        "columns": [
          { "id": "control", "label": "What I Control" },
          { "id": "no_control", "label": "What I Don''t" }
        ],
        "min_per_column": 1,
        "min_entry_seconds": 20,
        "intro_hold_seconds": 3,
        "close_column_id": "no_control",
        "action_prompt": "What is your next action on this?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e2000000-0000-0000-0000-000000000003',
  'acceptance'
);

commit;
