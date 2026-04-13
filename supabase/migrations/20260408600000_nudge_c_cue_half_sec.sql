-- Nudge C cue 78.0 → 78.5 (was 0.5 s early).

begin;

update public.lessons
set
  content_blocks = jsonb_set(
    content_blocks,
    '{blocks,0,timed_text,5,start_s}',
    '78.5'::jsonb
  ),
  updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
