-- ============================================================
-- Library Lesson A-03 Short: Name It, Face It
-- STRUCTURE: tap_through_text → prompt_cards → journal_prompt
--
-- UUID:       e2000000-0000-0000-0000-000000000005
-- sort_order: 220
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
  'e2000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'Name It, Face It',
  'library',
  120,
  220,
  true,
  '{
    "blocks": [
      {
        "type": "tap_through_text",
        "ambient_audio": "ambient/ambient_music.mp3",
        "paragraphs": [
          "Suppressing an emotion doesn''t make it weaker. It makes it louder.",
          "Psychologist Matthew Lieberman at UCLA found that simply labeling an emotion reduces activity in the amygdala — the brain''s threat center — almost immediately.",
          "Right now, you''re going to name exactly what you''re feeling. Not what you wish you were feeling.",
          "Then you''re going to find it in your body. Where does it live?",
          "Then you''re going to answer one question honestly.",
          "That''s the whole exercise. It''s short because it doesn''t need to be long."
        ]
      },
      {
        "type": "prompt_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
          {
            "intro_hold_seconds": 3,
            "prompt": "When you go into competition, what emotions do you feel? Get precise as to what, when, and where you feel these emotions.",
            "min_entry_seconds": 20
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "Where do they show up in your body? Do your legs feel detached as you walk out of the tunnel? Do you feel like you are watching through windows in your eyes rather than being in control?",
            "min_entry_seconds": 20
          },
          {
            "intro_hold_seconds": 3,
            "prompt": "What can you do to overcome this, and still compete?",
            "min_entry_seconds": 20
          }
        ],
        "summary": {
          "display": "last",
          "header": "",
          "hold_seconds": 10
        }
      },
      {
        "type": "journal_prompt",
        "prompt": "After seeing your answer, does it still hold? What would it actually look like to do that in the moment?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values (
  'e2000000-0000-0000-0000-000000000005',
  'acceptance'
);

commit;
