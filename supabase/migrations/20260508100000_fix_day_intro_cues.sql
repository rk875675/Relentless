-- Fix Whisper misread day-intro cues in Days 18, 19, and 23.
-- Only the first timed_text cue text is changed; start_s and all other
-- fields (audio_files, total_audio_seconds, exercise blocks, etc.) are untouched.

begin;

-- Day 18: 'A -18.' -> 'Day 18.'
update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,0,timed_text,0,text}',
      '"Day 18."'
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000018';

-- Day 19: 'A19, today we do something different.' -> 'Day 19. Today we do something different.'
update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,0,timed_text,0,text}',
      '"Day 19. Today we do something different."'
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000019';

-- Day 23: 'A23.' -> 'Day 23.'
update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,0,timed_text,0,text}',
      '"Day 23."'
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000023';

commit;
