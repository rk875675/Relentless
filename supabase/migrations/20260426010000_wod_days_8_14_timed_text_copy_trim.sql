-- WOD Days 8-14: tighten long voiceover on-screen text only.
-- Preserves all start_s timings, total_audio_seconds, durations, IDs, block order, and categories.

begin;

update public.lessons
set content_blocks = jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,8,text}', to_jsonb('The game starts: mechanics, scoreboard, mistakes, coach.'::text), false), '{blocks,0,timed_text,11,text}', to_jsonb('That pressure gap is what we''re here to close.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000008';

update public.lessons
set content_blocks = jsonb_set(jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,4,text}', to_jsonb('Your reset gets you back after mistakes, calls, or mental spirals.'::text), false), '{blocks,0,timed_text,15,text}', to_jsonb('The physical cue breaks tension in your body.'::text), false), '{blocks,0,timed_text,18,text}', to_jsonb('You''ll fill in three fields: breath, cue, and word.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000009';

update public.lessons
set content_blocks = jsonb_set(jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,9,text}', to_jsonb('Focusing on what you can''t control drains execution energy.'::text), false), '{blocks,0,timed_text,12,text}', to_jsonb('Control: preparation, process, response, effort, attitude.'::text), false), '{blocks,0,timed_text,21,text}', to_jsonb('Write what''s taking up space, then sort it.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000010';

update public.lessons
set content_blocks = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,1,text}', to_jsonb('Pressure hits: heart pounding, palms sweating, stomach tight.'::text), false), '{blocks,0,timed_text,3,text}', to_jsonb('Your brain treats competition like a threat.'::text), false), '{blocks,0,timed_text,7,text}', to_jsonb('Move from fight-or-flight into reset mode.'::text), false), '{blocks,0,timed_text,15,text}', to_jsonb('Full nose inhale, then one small extra inhale.'::text), false), '{blocks,0,timed_text,16,text}', to_jsonb('The double inhale helps your body offload CO2.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000011';

update public.lessons
set content_blocks = jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,8,text}', to_jsonb('An evidence log records facts about who you are.'::text), false), '{blocks,0,timed_text,16,text}', to_jsonb('Write one moment from last week when you competed well.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000012';

update public.lessons
set content_blocks = jsonb_set(jsonb_set(jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,0,text}', to_jsonb('Day 13. You''re building a daily routine.'::text), false), '{blocks,0,timed_text,3,text}', to_jsonb('Game day, off day, travel day, bad day.'::text), false), '{blocks,0,timed_text,6,text}', to_jsonb('Daily focus beats occasional intensity.'::text), false), '{blocks,0,timed_text,14,text}', to_jsonb('Your routine has three moments: morning, pre-comp, end of day.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000013';

update public.lessons
set content_blocks = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(content_blocks, '{blocks,0,timed_text,0,text}', to_jsonb('Day 14. Two weeks in. Your anchor brings attention back.'::text), false), '{blocks,0,timed_text,3,text}', to_jsonb('Game day adds noise, fatigue, and distraction.'::text), false), '{blocks,0,timed_text,8,text}', to_jsonb('Use every gap to return to your word.'::text), false), '{blocks,0,timed_text,9,text}', to_jsonb('One athlete used his anchor between every golf shot.'::text), false), '{blocks,0,timed_text,10,text}', to_jsonb('He used it before struggle filled the space.'::text), false), '{blocks,0,timed_text,13,text}', to_jsonb('Describe your pressure moment and how you''ll use your anchor.'::text), false), '{blocks,3,timed_text,3,text}', to_jsonb('Your anchor bridges training in here to competing out there.'::text), false),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000014';

commit;
