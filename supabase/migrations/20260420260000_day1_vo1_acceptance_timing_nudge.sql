-- Day 1 first voiceover: Acceptance cue −0.15s (was slightly late).

begin;

update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,0,timed_text,4,start_s}',
      '65.27'::jsonb
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
