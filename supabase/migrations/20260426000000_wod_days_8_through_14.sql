-- Migration: insert WOD Days 8-14 real lesson content and update program_schedule.
-- Voiceover timed_text.start_s + total_audio_seconds generated from local MP3s
-- using faster-whisper + ffprobe.
-- Exercise/journal copy transcribed from the approved Day 8-14 scripts.

begin;

-- Day 8: Why You're Better in Practice Than Games
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000001',
  'Why You''re Better in Practice Than Games',
  177,
  'standard',
  7,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_08/lesson_08_seg_01.mp3"],"total_audio_seconds":54.48,"timed_text":[{"start_s":0.0,"text":"Day 8."},{"start_s":1.42,"text":"Every athlete I''ve coached has dealt with this."},{"start_s":4.14,"text":"You''re better in practice than you are in games."},{"start_s":7.68,"text":"And it''s not a physical problem."},{"start_s":9.84,"text":"It''s not a technique problem."},{"start_s":12.26,"text":"But in practice, your brain actually just trusts your body."},{"start_s":16.0,"text":"It lets your training just run."},{"start_s":18.04,"text":"You play free."},{"start_s":19.04,"text":"The game starts, and suddenly you''re thinking about your mechanics, scoreboard, the last mistake, what the coach is thinking."},{"start_s":27.6,"text":"And your body is the same, but your brain is somewhere else."},{"start_s":32.06,"text":"So I played quarterback at the D1 level and I know exactly what this feels like."},{"start_s":36.62,"text":"That gap between what you''re capable of and what you produce under pressure — that''s what we''re here to close."},{"start_s":43.42,"text":"So today, I want you to name your version of it."},{"start_s":46.38,"text":"On your screen, you''re going to see two prompts."},{"start_s":47.94,"text":"And I want you to think about a real competition and get specific."},{"start_s":52.92,"text":"Take your time."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Think about your last competition. At what exact moment did your focus shift away from execution and toward something you couldn''t control?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What was your brain doing instead of competing?","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_08/lesson_08_seg_02.mp3"],"total_audio_seconds":13.34,"timed_text":[{"start_s":0.0,"text":"What you just named is your pattern."},{"start_s":2.96,"text":"Most athletes never identify it."},{"start_s":5.86,"text":"You just did."},{"start_s":7.42,"text":"That''s where the work starts."},{"start_s":9.72,"text":"Go hit the journal."},{"start_s":10.8,"text":"After you finish — Day 8 is complete."}]},{"type":"journal_prompt","prompt":"What''s the difference between how you feel mentally in practice versus competition? When does the shift happen?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

-- Day 9: The 30-Second Reset
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000001',
  'The 30-Second Reset',
  232,
  'standard',
  8,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_09/lesson_09_seg_01.mp3"],"total_audio_seconds":74.02,"timed_text":[{"start_s":0.0,"text":"Day 9."},{"start_s":1.32,"text":"One of the first things I build with every athlete I coach is a reset."},{"start_s":5.68,"text":"Not a pep talk."},{"start_s":7.14,"text":"Not five minutes of deep breathing."},{"start_s":9.38,"text":"A 30-second sequence that puts you back in control after anything goes wrong — a mistake, a bad call, a moment where your brain tries to take over."},{"start_s":20.34,"text":"You are going to make mistakes in competition."},{"start_s":22.3,"text":"The question is what happens in the five seconds after."},{"start_s":26.24,"text":"Because that''s where the spiral starts."},{"start_s":28.4,"text":"One bad play becomes two."},{"start_s":32.58,"text":"Two becomes a bad half."},{"start_s":36.06,"text":"The reset has three steps."},{"start_s":38.98,"text":"One breath."},{"start_s":40.14,"text":"One physical cue."},{"start_s":41.62,"text":"One word."},{"start_s":43.74,"text":"The breath interrupts the stress response."},{"start_s":47.54,"text":"The physical cue — a shake-out, a wrist tap, rolling your shoulders — breaks the body out of tension."},{"start_s":55.66,"text":"The word brings your attention back to the present moment."},{"start_s":59.94,"text":"Today you''re building yours."},{"start_s":62.88,"text":"On your screen you''re going to see three fields — your breath, your physical cue, and your word."},{"start_s":70.6,"text":"Fill each one in."},{"start_s":72.26,"text":"This becomes your protocol."}]},{"type":"multi_field_entry","ambient_audio":"ambient/ambient_music.mp3","header":"Build Your 30-Second Reset","fields":[{"label":"Your breath — one box breath. 4 seconds in, hold 4, out 4, hold 4. This is your default.","input":false},{"label":"Your physical cue — what movement signals the reset? (Ex: shake out your hands, tap your wrist, roll your shoulders)","input":true},{"label":"Your word — one word that brings you back to the present moment.","input":true}],"submit_label":"Save","summary_header":"Build Your 30-Second Reset","continue_label":"Continue"},{"type":"voiceover","audio_files":["lesson_09/lesson_09_seg_02.mp3"],"total_audio_seconds":23.4,"timed_text":[{"start_s":0.0,"text":"That sequence is yours now."},{"start_s":2.78,"text":"Drill it in practice this week — intentionally."},{"start_s":7.08,"text":"Make a mistake on purpose and run the reset."},{"start_s":10.24,"text":"That''s how it becomes automatic."},{"start_s":12.62,"text":"The goal is to make it so trained your nervous system just does it."},{"start_s":16.36,"text":"Without deciding."},{"start_s":18.18,"text":"It just happens."},{"start_s":19.74,"text":"Go hit the journal."},{"start_s":20.82,"text":"After you finish — Day 9 is complete."}]},{"type":"journal_prompt","prompt":"When in competition do you most need a reset? What happens right now in those moments instead?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

-- Day 10: Controlling the Controllables
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000010',
  'a0000000-0000-0000-0000-000000000001',
  'Controlling the Controllables',
  228,
  'standard',
  9,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_10/lesson_10_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 10."},{"start_s":1.32,"text":"Before competition, your brain fills up with noise."},{"start_s":5.06,"text":"The opponent."},{"start_s":6.04,"text":"The weather."},{"start_s":6.7,"text":"The officiating."},{"start_s":8.02,"text":"What your coach is thinking."},{"start_s":9.86,"text":"Whether the scouts are paying attention."},{"start_s":12.92,"text":"All of that feels urgent."},{"start_s":14.6,"text":"And all of it is outside your control."},{"start_s":17.96,"text":"When you direct your focus toward things you cannot control, you are spending energy you need for execution."},{"start_s":24.76,"text":"That''s the leak."},{"start_s":26.38,"text":"That''s why athletes who are physically prepared still underperform."},{"start_s":31.18,"text":"What you can control: your preparation, your process, your response to what happens, your effort, your attitude."},{"start_s":40.02,"text":"That''s your whole list."},{"start_s":42.64,"text":"I do this exercise with my athletes before big competitions."},{"start_s":46.66,"text":"Write down everything on your mind."},{"start_s":49.08,"text":"Sort it — in my control, out of my control."},{"start_s":53.74,"text":"Circle the controllables."},{"start_s":55.72,"text":"That''s your only focus."},{"start_s":57.78,"text":"Everything else goes on the page and stays there."},{"start_s":61.34,"text":"That''s what we''re doing today."},{"start_s":63.28,"text":"On your screen you''re going to write everything that''s taking up space in your head — then sort it."},{"start_s":68.74,"text":"In my control."},{"start_s":70.86,"text":"Out of my control."},{"start_s":72.2,"text":"And identify what actually gets your focus."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"What is taking up space in your head right now about an upcoming competition or practice? Write everything down.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Go through your list. For each item — in my control, or out of my control?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What are the two or three controllables that get your full focus?","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_10/lesson_10_seg_02.mp3"],"total_audio_seconds":18.18,"timed_text":[{"start_s":0.0,"text":"Every time you focus on something you cannot control, it costs you."},{"start_s":4.64,"text":"This is acceptance — choosing where your energy goes."},{"start_s":8.2,"text":"Not ignoring the pressure."},{"start_s":9.94,"text":"Just refusing to spend yourself on things that don''t move the needle."},{"start_s":15.24,"text":"Go hit the journal."},{"start_s":16.24,"text":"After you finish — Day 10 is complete."}]},{"type":"journal_prompt","prompt":"What uncontrollable do you spend the most mental energy on before competition? What would it look like to actually put it down?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

-- Day 11: The Physiological Sigh
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000001',
  'The Physiological Sigh',
  240,
  'standard',
  10,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_11/lesson_11_seg_01.mp3"],"total_audio_seconds":96.84,"timed_text":[{"start_s":0.0,"text":"Day 11."},{"start_s":1.3,"text":"When pressure hits — heart pounding, palms sweating, stomach tight — that''s your sympathetic nervous system firing."},{"start_s":10.94,"text":"Fight or flight."},{"start_s":13.02,"text":"Your brain reads the competition as a threat, and it floods your body with cortisol and adrenaline to prepare you to fight or run."},{"start_s":23.3,"text":"The problem is you don''t need to fight or run."},{"start_s":26.2,"text":"You need to execute."},{"start_s":27.82,"text":"So we need a way to flip the switch fast."},{"start_s":30.24,"text":"To bring your body out of sympathetic — fight or flight — and into parasympathetic."},{"start_s":37.5,"text":"Rest and digest."},{"start_s":40.1,"text":"The state where you can actually think, react, and perform."},{"start_s":44.86,"text":"Box breathing does this."},{"start_s":46.54,"text":"But there''s a faster tool."},{"start_s":48.92,"text":"It''s called the physiological sigh."},{"start_s":51.3,"text":"And it''s the quickest way your nervous system can bring itself down."},{"start_s":56.68,"text":"Here''s how it works."},{"start_s":58.18,"text":"You take a full breath in through your nose — then before you exhale, you sneak in one more small breath on top of it."},{"start_s":66.28,"text":"That double inhale fully inflates the air sacs in your lungs and gives your body the maximum surface area to offload CO2."},{"start_s":76.18,"text":"Then you release it in one long, slow exhale through your mouth."},{"start_s":81.36,"text":"That exhale is what activates the parasympathetic response."},{"start_s":85.66,"text":"And it works within one or two cycles."},{"start_s":88.9,"text":"On your screen you''re going to practice it now."},{"start_s":91.64,"text":"Follow the cues until you feel your body settle."},{"start_s":95.28,"text":"Take as many cycles as you need."}]},{"type":"physiological_sigh","first_inhale_seconds":3,"sneak_inhale_seconds":1,"exhale_seconds":8,"phase_cues":{"first_inhale":"Breathe in fully through your nose.","sneak_inhale":"Sneak in one more small breath on top.","exhale":"Slow release through your mouth. All the way out."},"done_label":"Done","estimated_duration_seconds":60},{"type":"voiceover","audio_files":["lesson_11/lesson_11_seg_02.mp3"],"total_audio_seconds":23.48,"timed_text":[{"start_s":0.0,"text":"That''s the physiological sigh."},{"start_s":2.64,"text":"Two inhales, one long exhale."},{"start_s":6.58,"text":"You can do that in the middle of a competition and nobody around you will notice."},{"start_s":11.84,"text":"On the bench."},{"start_s":12.9,"text":"In the on-deck circle."},{"start_s":14.74,"text":"At the starting line."},{"start_s":16.44,"text":"Anywhere your nervous system needs a reset."},{"start_s":19.78,"text":"Go hit the journal."},{"start_s":20.96,"text":"After you finish — Day 11 is complete."}]},{"type":"journal_prompt","prompt":"What does fight or flight feel like in your body specifically — nausea, sweaty hands, tight chest, tunnel vision? What triggers it for you, and when would the physiological sigh be most useful?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

-- Day 12: The Evidence Log
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000012',
  'a0000000-0000-0000-0000-000000000001',
  'The Evidence Log',
  218,
  'standard',
  11,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_12/lesson_12_seg_01.mp3"],"total_audio_seconds":76.14,"timed_text":[{"start_s":1.42,"text":"Day 12. Your brain has a negativity bias."},{"start_s":4.82,"text":"It holds onto bad performances more tightly than good ones."},{"start_s":9.02,"text":"One bad game sits heavier than five good ones."},{"start_s":12.78,"text":"One mistake loops while twenty correct executions disappear."},{"start_s":18.6,"text":"That''s not a mental weakness. That''s biology."},{"start_s":22.1,"text":"But in sport it works against you — and we''re going to fight it directly."},{"start_s":26.68,"text":"Not with affirmations. With facts."},{"start_s":29.6,"text":"This tool is called the evidence log."},{"start_s":32.76,"text":"A running record of real moments — specific things that happened that prove who you are as a competitor."},{"start_s":42.3,"text":"I use this with every athlete that I coach."},{"start_s":46.1,"text":"When the self-doubt shows up, we don''t go to motivation. We go to the log."},{"start_s":51.92,"text":"Here''s what you did on Tuesday."},{"start_s":54.04,"text":"Here''s what you did in last week''s competition."},{"start_s":56.6,"text":"That is the factual record."},{"start_s":58.94,"text":"Doubt doesn''t have an argument against facts."},{"start_s":62.48,"text":"Your log starts right now."},{"start_s":65.02,"text":"On your screen you''re going to write your first entry — a specific moment from the last week where you competed the way you want to compete."},{"start_s":72.86,"text":"Then you''re going to name what it proves about you."}]},{"type":"multi_field_entry","ambient_audio":"ambient/ambient_music.mp3","header":"Evidence Log — Entry 1","fields":[{"label":"Describe a specific moment from the last week where you competed the way you want to compete. Be specific — what happened, where were you, what did you do?","input":true},{"label":"What does this moment prove about you as a competitor? Complete this sentence: ''This proves I am an athlete who...''","input":true}],"submit_label":"Save","continue_label":"Continue"},{"type":"voiceover","audio_files":["lesson_12/lesson_12_seg_02.mp3"],"total_audio_seconds":32.4,"timed_text":[{"start_s":1.84,"text":"Add to that log after every practice."},{"start_s":6.66,"text":"After every competition."},{"start_s":10.06,"text":"Even on bad days — find one moment where you did something right and log it."},{"start_s":22.66,"text":"Over 30 days it becomes something real."},{"start_s":25.52,"text":"The factual case for believing in yourself."},{"start_s":29.42,"text":"Go hit the journal."},{"start_s":30.4,"text":"After you finish — Day 12 is complete."}]},{"type":"journal_prompt","prompt":"Why is it easier to remember mistakes than the moments you competed well? What would change if you logged the good ones just as consistently?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

-- Day 13: Building Your Daily Routine
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000013',
  'a0000000-0000-0000-0000-000000000001',
  'Building Your Daily Routine',
  235,
  'standard',
  12,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_13/lesson_13_seg_01.mp3"],"total_audio_seconds":81.52,"timed_text":[{"start_s":0.0,"text":"Day 13. One of the first things I install with every athlete I work with is a daily routine."},{"start_s":7.48,"text":"Not a workout plan. A mental performance routine."},{"start_s":11.94,"text":"15 minutes a day that runs regardless of what else is happening."},{"start_s":16.32,"text":"If it''s a game day, competition day, you''re off, a travel, or just a bad day overall."},{"start_s":22.64,"text":"Here''s the principle."},{"start_s":24.58,"text":"Consistency beats intensity."},{"start_s":27.3,"text":"An athlete who does 15 focused minutes every single day outperforms one who goes hard once a week, wings it the rest of the time."},{"start_s":37.88,"text":"Never fails."},{"start_s":39.22,"text":"The brain builds through repetition."},{"start_s":42.08,"text":"Through showing up."},{"start_s":43.58,"text":"Most athletes have no mental routine at all."},{"start_s":46.68,"text":"Good days are luck."},{"start_s":48.08,"text":"Bad days are excuses."},{"start_s":49.82,"text":"Nothing stacks."},{"start_s":51.78,"text":"Your routine hits three moments — morning or pre-practice, right before competition, and at the end of the day."},{"start_s":60.98,"text":"Keep it simple."},{"start_s":63.1,"text":"The simpler it is, the more likely you are to actually do it."},{"start_s":68.08,"text":"Today, you''re going to build yours."},{"start_s":70.04,"text":"On your screen, you''re going to fill in three blocks."},{"start_s":72.84,"text":"Your morning, through pre-competition, and end of day."},{"start_s":76.52,"text":"Keep each one simple."},{"start_s":78.96,"text":"One or two things max per block."}]},{"type":"multi_field_entry","ambient_audio":"ambient/ambient_music.mp3","header":"Your Daily Mental Performance Routine","fields":[{"label":"Morning or pre-practice (5 min) — What will you do? Choose one or two: box breathing, read your identity statement, evidence log entry, focus anchor hold. Write what you''ll do and when.","input":true},{"label":"Pre-competition trigger (2-3 min) — What is your mental sequence right before you compete or train? Include your reset and at least one other tool.","input":true},{"label":"End of day (5 min) — How do you close the day? Choose one: evidence log entry, journal reflection, tomorrow''s intention.","input":true}],"submit_label":"Save","continue_label":"Continue"},{"type":"voiceover","audio_files":["lesson_13/lesson_13_seg_02.mp3"],"total_audio_seconds":18.32,"timed_text":[{"start_s":0.58,"text":"That''s your routine."},{"start_s":3.14,"text":"It''s not perfect — it doesn''t need to be."},{"start_s":5.92,"text":"Refine it as you go."},{"start_s":8.18,"text":"The athletes who transform are not the ones with the best plan."},{"start_s":12.3,"text":"They''re the ones who showed up for it every day."},{"start_s":14.08,"text":"Go hit the journal."},{"start_s":15.92,"text":"After you finish — Day 13 is complete."}]},{"type":"journal_prompt","prompt":"Which part of your routine will be hardest to stick to? What usually gets in the way of your habits — and what will you do when it does?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

-- Day 14: Using Your Anchor In Competition
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000014',
  'a0000000-0000-0000-0000-000000000001',
  'Using Your Anchor In Competition',
  231,
  'standard',
  13,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_14/lesson_14_seg_01.mp3"],"total_audio_seconds":76.78,"timed_text":[{"start_s":0.0,"text":"Day 14. Two weeks in. A focus anchor is a word or phrase your mind returns to when it starts to drift."},{"start_s":8.88,"text":"And today I want to make sure yours is actually ready for competition."},{"start_s":14.02,"text":"Here''s the difference between practice and game day use."},{"start_s":17.82,"text":"In training, you have quiet and time. In competition you have noise, fatigue, and a brain actively pulling your attention away from the task in front of you."},{"start_s":28.54,"text":"The anchor is not something you reach for when things go wrong."},{"start_s":32.92,"text":"By then, it''s too late."},{"start_s":34.4,"text":"You hold it proactively."},{"start_s":36.38,"text":"Between plays, between points, between reps, between laps."},{"start_s":40.5,"text":"Every gap in competition is a chance to return to your word before the noise gets in."},{"start_s":46.1,"text":"One of my athletes used his anchor word between every single shot on the golf course."},{"start_s":50.5,"text":"Not because he was struggling. Because he knew if he didn''t direct his attention, his brain would fill the space with something unhelpful."},{"start_s":59.9,"text":"Today you''re going to practice using yours under simulated pressure."},{"start_s":64.7,"text":"On your screen, we''re going to start with one breath to settle in."},{"start_s":68.7,"text":"Then I want you to describe your highest-pressure moment and walk through exactly how you''d use your anchor in it."}]},{"type":"timed_exercise","duration_seconds":16,"interactive_model":"box_breathing","visual_cues":["One full cycle. Settle in.","Follow the circle."],"steps":[{"text":"Inhale","duration_seconds":4,"haptic":"heavy"},{"text":"Hold","duration_seconds":4,"haptic":"light"},{"text":"Exhale","duration_seconds":4,"haptic":"heavy"},{"text":"Hold","duration_seconds":4,"haptic":"light"}]},{"type":"multi_field_entry","ambient_audio":"ambient/ambient_music.mp3","header":"Using Your Anchor In Competition","fields":[{"label":"Describe the highest-pressure moment in your sport. The exact moment when your mind is most likely to drift — where are you, what''s happening around you?","input":true},{"label":"In that moment, your anchor is your one word. Walk through step by step — what do you do to return to it when your mind drifts?","input":true}],"submit_label":"Save","continue_label":"Continue"},{"type":"voiceover","audio_files":["lesson_14/lesson_14_seg_02.mp3"],"total_audio_seconds":28.32,"timed_text":[{"start_s":0.0,"text":"Your anchor goes with you."},{"start_s":1.6,"text":"Into the competition."},{"start_s":3.26,"text":"Into the last 400 meters when everything in your body is asking you to quit."},{"start_s":16.0,"text":"That one word is the bridge between what you''ve trained in here and what you do out there."},{"start_s":22.3,"text":"Go hit the journal."},{"start_s":23.14,"text":"After you finish — Day 14 is complete."},{"start_s":26.18,"text":"Two weeks of Relentless."}]},{"type":"journal_prompt","prompt":"Have you ever naturally used something like a focus anchor in competition without realizing it? What was it — and did it work?"}]}'::jsonb
)
on conflict (id) do update
set coach_id = excluded.coach_id,
    title = excluded.title,
    duration_seconds = excluded.duration_seconds,
    lesson_type = excluded.lesson_type,
    sort_order = excluded.sort_order,
    published = excluded.published,
    content_blocks = excluded.content_blocks,
    updated_at = now();

delete from public.lesson_categories where lesson_id in ('d0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000014');

insert into public.lesson_categories (lesson_id, category)
values
  ('d0000000-0000-0000-0000-000000000008', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000009', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000009', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000010', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000011', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000011', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000012', 'commitment'),
  ('d0000000-0000-0000-0000-000000000013', 'commitment'),
  ('d0000000-0000-0000-0000-000000000014', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000014', 'acceptance');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000008',
    updated_at = now()
where program_version = 'v1'
  and day_number = 8;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000009',
    updated_at = now()
where program_version = 'v1'
  and day_number = 9;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000010',
    updated_at = now()
where program_version = 'v1'
  and day_number = 10;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000011',
    updated_at = now()
where program_version = 'v1'
  and day_number = 11;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000012',
    updated_at = now()
where program_version = 'v1'
  and day_number = 12;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000013',
    updated_at = now()
where program_version = 'v1'
  and day_number = 13;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000014',
    updated_at = now()
where program_version = 'v1'
  and day_number = 14;

commit;
