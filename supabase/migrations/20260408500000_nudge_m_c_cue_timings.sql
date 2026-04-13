-- Nudge M cue 44.0 → 45.5 (was 1.5 s early) and C cue 77.0 → 78.0 (was 1 s early).
-- A cue at 64.0 stays unchanged.

begin;

update public.lessons
set
  content_blocks = jsonb_set(
    jsonb_set(
      content_blocks,
      '{blocks,0,timed_text,3,start_s}',
      '45.5'::jsonb
    ),
    '{blocks,0,timed_text,5,start_s}',
    '78.0'::jsonb
  ),
  updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
