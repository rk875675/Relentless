-- Nudge Mindfulness timed_text cue from 48.0 s → 44.0 s (showed slightly late).

begin;

update public.lessons
set
  content_blocks = jsonb_set(
    content_blocks,
    '{blocks,0,timed_text,3,start_s}',
    '44.0'::jsonb
  ),
  updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
