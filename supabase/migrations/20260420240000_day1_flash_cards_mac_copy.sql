-- WOD Day 1: update flash_cards copy only (voiceover, duration, journal unchanged).

begin;

update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,1,cards}',
      '[
        {"front": "Mindfulness", "back": "Notice where your attention goes. No judgement, just awareness."},
        {"front": "Acceptance", "back": "Feel the discomfort, don''t react to it."},
        {"front": "Commitment", "back": "Create behavior change that is consistent with your values."}
      ]'::jsonb
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
