-- Race Ready Day 1 (Know Your Why): two on-screen caption word fixes.
-- Audio, start_s, and every other cue/block are unchanged.
-- Applies only while the current live strings still match (safe to re-run).

begin;

update public.lessons
set content_blocks = jsonb_set(
      jsonb_set(
        content_blocks,
        '{blocks,0,timed_text,17,text}',
        '"What has it taught you?"'
      ),
      '{blocks,0,timed_text,20,text}',
      '"And today your challenge is simple."'
    ),
    updated_at = now()
where id = '2731ff89-91eb-5d09-9b61-08ddf177ac0b'
  and content_blocks #>> '{blocks,0,timed_text,17,text}' = 'What does it taught you?'
  and content_blocks #>> '{blocks,0,timed_text,20,text}' = 'And today your challenges is simple.';

commit;
