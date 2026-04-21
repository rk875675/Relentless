-- Day 1 first voiceover: nudge timed_text (mental perf +0.25s; mindfulness −1s; acceptance −0.8s).

begin;

update public.lessons
set content_blocks = jsonb_set(
      jsonb_set(
        jsonb_set(
          content_blocks,
          '{blocks,0,timed_text,1,start_s}',
          '15.78'::jsonb
        ),
        '{blocks,0,timed_text,3,start_s}',
        '46.9'::jsonb
      ),
      '{blocks,0,timed_text,4,start_s}',
      '65.42'::jsonb
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000001';

commit;
