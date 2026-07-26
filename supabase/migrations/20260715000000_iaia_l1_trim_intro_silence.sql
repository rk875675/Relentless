-- Iaia Colella — "THE 8 MENTAL DIMENSIONS OF PERFORMANCE", Lesson 1
-- ("What Is Brain Training?").
--
-- The lesson-1 voiceover (seg_01.mp3) opened with ~2.75s of dead air before she
-- starts speaking, so the lesson felt like it stalled at the very start. A copy
-- of the audio trimmed by 2.5s from the front (leaving a ~0.25s lead-in) was
-- uploaded to storage as seg_01_trimmed.mp3 (the original seg_01.mp3 is kept
-- untouched as a fallback).
--
-- This migration repoints block 0's audio to the trimmed file and shifts every
-- timed_text cue and total_audio_seconds back by the same 2.5s so captions stay
-- aligned with the (now earlier) speech. Content/data only — no new app build.
--
-- Guarded on the voiceover still pointing at the original seg_01.mp3 so a re-run
-- is a no-op (it will not shift the cues a second time).

begin;

with shifted as (
  select
    l.id,
    coalesce(
      jsonb_agg(
        case
          when (t.cue ->> 'start_s') is not null then
            jsonb_set(
              t.cue,
              '{start_s}',
              to_jsonb(greatest(0, round(((t.cue ->> 'start_s')::numeric) - 2.5, 3)))
            )
          else t.cue
        end
        order by t.ord
      ),
      '[]'::jsonb
    ) as new_timed
  from public.lessons l
  cross join lateral jsonb_array_elements(l.content_blocks #> '{blocks,0,timed_text}')
    with ordinality as t(cue, ord)
  where l.id = 'ce11c707-0e2b-5c13-a745-34faede29482'
  group by l.id
)
update public.lessons l
set content_blocks =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            l.content_blocks,
            '{blocks,0,audio_files}',
            '["iaia-colella/the-8-mental-dimensions-of-performance/lesson_01/seg_01_trimmed.mp3"]'::jsonb
          ),
          '{blocks,0,total_audio_seconds}',
          to_jsonb(103.962::numeric)
        ),
        '{blocks,0,timed_text}',
        shifted.new_timed
      ),
    updated_at = now()
from shifted
where l.id = shifted.id
  and l.content_blocks #>> '{blocks,0,type}' = 'voiceover'
  and l.content_blocks #>> '{blocks,0,audio_files,0}'
      = 'iaia-colella/the-8-mental-dimensions-of-performance/lesson_01/seg_01.mp3';

commit;
