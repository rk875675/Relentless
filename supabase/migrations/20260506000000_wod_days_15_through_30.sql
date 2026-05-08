-- Migration: insert WOD Days 15-30 real lesson content and update program_schedule.
-- Voiceover timed_text.start_s estimated at ~2.5 words/sec (placeholder — refine after MP3 upload).
-- Exercise and journal copy transcribed verbatim from approved Relentless_Days15to30_Final script.
-- New block types introduced: visualization_board (Day 23), program_completion (Day 30).

begin;

-- ============================================================
-- Day 15: The Anchor Check
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000015',
  'a0000000-0000-0000-0000-000000000001',
  'The Anchor Check',
  255,
  'standard',
  14,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_15/lesson_15_seg_01.mp3"],"total_audio_seconds":70.0,"timed_text":[{"start_s":0.0,"text":"Day 15."},{"start_s":0.8,"text":"You chose your focus anchor earlier in this program."},{"start_s":4.4,"text":"A word or phrase your mind returns to when it starts to drift."},{"start_s":9.6,"text":"Today I want to take that further — because the most powerful version of an anchor isn''t just a word in your head."},{"start_s":17.6,"text":"It''s something physical."},{"start_s":18.8,"text":"Something that exists in the actual space where you compete."},{"start_s":22.8,"text":"Elite athletes do this instinctively."},{"start_s":24.8,"text":"A basketball player who bounces the ball exactly three times before a free throw."},{"start_s":30.4,"text":"A sprinter who locks eyes on the same spot on the track before the gun."},{"start_s":36.0,"text":"A quarterback who taps his wrist band before walking to the line."},{"start_s":40.8,"text":"These aren''t superstitions."},{"start_s":42.0,"text":"They''re trained focus triggers — physical anchors that pull the mind back to the present moment on command."},{"start_s":48.8,"text":"The key is consistency."},{"start_s":50.4,"text":"The same thing, the same way, every single time."},{"start_s":54.0,"text":"Because your nervous system responds to patterns."},{"start_s":56.8,"text":"When you perform that cue enough times in a focused state, the cue begins to trigger the state."},{"start_s":63.6,"text":"That''s conditioning."},{"start_s":64.4,"text":"That''s what we''re building today."},{"start_s":66.4,"text":"On your screen you''re going to identify it and lock it in."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Think about the physical space where you compete. What do you see, hear, or feel in that environment that is always there — every competition, every time?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Identify your physical anchor — something in that space, or something you wear or carry, that you can use as a consistent focus trigger. Something you can touch, see, or do deliberately before or during competition.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Design the moment — exactly when in competition will you use this anchor? Between plays? Before the starting signal? After a mistake? Write the specific moment and the exact action.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Say your focus word once. Feel your attention settle. That word plus that physical anchor — those two together are your return to center.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_15/lesson_15_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Every time you use that physical anchor, you''re strengthening the connection between that action and your focused state."},{"start_s":7.0,"text":"Do it in practice. Do it in warm-ups. Do it in competition."},{"start_s":11.5,"text":"The more consistent you are, the faster it works when the pressure is real."},{"start_s":17.0,"text":"Go hit the journal."},{"start_s":20.0,"text":"After you finish — Day 15 is complete."}]},{"type":"journal_prompt","prompt":"What physical anchor did you choose — and why does that specific thing feel right for your competition environment?"}]}'::jsonb
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

-- ============================================================
-- Day 16: The Traffic Light System
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000016',
  'a0000000-0000-0000-0000-000000000001',
  'The Traffic Light System',
  260,
  'standard',
  15,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_16/lesson_16_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 16."},{"start_s":1.0,"text":"One of the most practical tools I''ve ever come across in sports psychology comes from Bill Beswick."},{"start_s":6.8,"text":"He calls it the Traffic Light System."},{"start_s":9.0,"text":"Green. Amber. Red."},{"start_s":11.4,"text":"Green is where you want to compete."},{"start_s":13.4,"text":"Relaxed. In the flow. System 1 running the show."},{"start_s":16.2,"text":"You''re executing without overthinking. Your body trusts your training."},{"start_s":20.2,"text":"This is what flow state looks like."},{"start_s":22.0,"text":"Amber is the warning state."},{"start_s":24.0,"text":"You''re starting to feel the fatigue, the frustration, the pressure."},{"start_s":28.0,"text":"Your focus is starting to drift. You''re not in the red yet — but you''re heading there."},{"start_s":33.2,"text":"Amber is where the mental tools matter most, because if you catch yourself here, you can course-correct before the spiral starts."},{"start_s":40.0,"text":"Red is where performance goes to die."},{"start_s":42.6,"text":"Dominated by negative self-talk. Poor decisions. Emotional reactions instead of trained responses."},{"start_s":47.4,"text":"Once you''re in the red in competition, it takes significant effort to come back."},{"start_s":52.2,"text":"Most athletes don''t know where they are. They just feel bad and can''t explain why."},{"start_s":57.0,"text":"The traffic light gives you a language for your own psychological state — and a plan for each one."},{"start_s":63.6,"text":"On your screen you''re going to learn what each state looks and feels like specifically for you."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Describe what GREEN feels like for you in competition — physically, mentally, emotionally. What are the specific signs that you are in your optimal performance state?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Describe AMBER — the warning signs that tell you your state is slipping. What do you notice first? Is it physical tension, a specific thought, a change in your breathing?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Describe RED — what it looks and feels like when you''ve lost the mental battle. What are the unmistakable signs for you specifically?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"For AMBER only — when you notice those warning signs, what is your first move? Which tool do you use to bring yourself back before you hit red?","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_16/lesson_16_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"The goal isn''t to always be green. That''s not realistic."},{"start_s":4.6,"text":"The goal is to recognize amber before it becomes red — and to have a tool ready when it does."},{"start_s":12.4,"text":"Go hit the journal."},{"start_s":15.0,"text":"After you finish — Day 16 is complete."}]},{"type":"journal_prompt","prompt":"In your last competition, were you mostly green, amber, or red? At what point did your state shift — and what caused it?"}]}'::jsonb
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

-- ============================================================
-- Day 17: First Things First
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000017',
  'a0000000-0000-0000-0000-000000000001',
  'First Things First',
  230,
  'standard',
  16,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_17/lesson_17_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 17."},{"start_s":1.0,"text":"Before we go any deeper into competition performance, I need to ask you something."},{"start_s":6.4,"text":"Why are you doing this?"},{"start_s":8.4,"text":"Not the athletic goals. Not the starting spot or the stats or the scholarship."},{"start_s":13.2,"text":"I mean the bigger picture. What are the things in your life that matter most — the people, the relationships, the responsibilities — that your athletic career is supposed to serve?"},{"start_s":22.0,"text":"Bill Beswick calls this keeping the first things first."},{"start_s":25.4,"text":"And what he found working with professional athletes at the highest level is that the ones who burn out, who lose motivation, who hit performance plateaus they can''t climb out of — they''ve usually lost their connection to their why."},{"start_s":37.0,"text":"When sport becomes the only thing, it becomes the wrong thing."},{"start_s":40.8,"text":"Because sport is not the point. Sport is the vehicle."},{"start_s":44.0,"text":"The relationships you build through it, the character it develops, the future it creates — that''s the point."},{"start_s":50.4,"text":"Family. Friends. Health. Academics. The people counting on you. The version of yourself you''re building beyond the field."},{"start_s":57.6,"text":"When you stay connected to that — when you compete for something bigger than the scoreboard — you''re tougher to break."},{"start_s":64.0,"text":"Because the foundation is bigger than any outcome."},{"start_s":66.8,"text":"On your screen you''re going to name your first things. The ones that matter most regardless of whether you ever play another game."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Family — Who are the people in your family that your athletic journey is connected to? Why does competing well matter when you think about them?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Friends and teammates — Who in your life shows up for you regardless of performance? Why do those relationships matter to how you compete?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Health — Your body is the vehicle. What does taking care of it mean to you beyond sport — for the life you''re building after the final game?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Academics and future — What are you building outside the lines? Why does the person you''re becoming in the classroom and in the real world matter?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Now — write one sentence: ''I compete because...'' Let it be honest. Let it be bigger than wins and losses.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_17/lesson_17_seg_02.mp3"],"total_audio_seconds":30.0,"timed_text":[{"start_s":0.0,"text":"That why is now saved in your profile."},{"start_s":2.8,"text":"Read it when competition stops feeling worth it."},{"start_s":5.8,"text":"Read it when the training is hard and the results aren''t showing up yet."},{"start_s":10.2,"text":"The athletes who last — who keep competing at a high level when everything gets difficult — they''ve never lost their connection to that answer."},{"start_s":21.0,"text":"After you finish — Day 17 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 18: The If-Then Plan
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000018',
  'a0000000-0000-0000-0000-000000000001',
  'The If-Then Plan',
  170,
  'standard',
  17,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_18/lesson_18_seg_01.mp3"],"total_audio_seconds":70.0,"timed_text":[{"start_s":0.0,"text":"Day 18."},{"start_s":1.0,"text":"One of the biggest reasons athletes break in big moments is that they''ve never planned for them."},{"start_s":7.2,"text":"Not the success. The worst case."},{"start_s":9.8,"text":"What happens if you fall behind early?"},{"start_s":12.4,"text":"What happens if you make a visible error in front of the biggest crowd you''ve ever competed in front of?"},{"start_s":17.8,"text":"What happens if your body starts to give out before the competition is over?"},{"start_s":22.0,"text":"Most athletes avoid those questions. They think planning for failure invites it."},{"start_s":27.2,"text":"That''s backwards. Planning for adversity is what makes you dangerous — because now you have a response ready before the moment hits."},{"start_s":34.6,"text":"This is the If-Then plan. If X happens, then I do Y."},{"start_s":38.8,"text":"It''s not pessimism. It''s preparation."},{"start_s":41.4,"text":"Research is clear on this. Athletes who pre-plan responses to adversity recover faster and perform more consistently than athletes who respond in the moment without a plan."},{"start_s":52.0,"text":"You''re not hoping the bad thing doesn''t happen."},{"start_s":55.0,"text":"You''re deciding in advance that it doesn''t own you."},{"start_s":58.8,"text":"On your screen you''re going to build your If-Then plan for the three most likely adversity scenarios in your sport."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"What is the most likely thing to go wrong in your next competition — the one that typically starts your mental spiral? Describe the scenario and write your exact response: breath, reset word, refocus.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Second most likely adversity scenario — and your response.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Third scenario — and your response.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_18/lesson_18_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"You just made three decisions in advance."},{"start_s":3.0,"text":"When those moments arrive — and they will — your brain already has the answer."},{"start_s":9.0,"text":"No freeze. No spiral. Just the plan."},{"start_s":12.4,"text":"After you finish — Day 18 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 19: Reframe — When Your Mind Broke
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000019',
  'a0000000-0000-0000-0000-000000000001',
  'Reframe — When Your Mind Broke',
  175,
  'standard',
  18,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_19/lesson_19_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 19."},{"start_s":1.0,"text":"Today we do something different."},{"start_s":3.4,"text":"There''s a moment in your competitive career where your mind completely broke on you."},{"start_s":8.0,"text":"Your focus left. The spiral started. You couldn''t come back. And the performance suffered because of it."},{"start_s":13.4,"text":"You''ve probably replayed that moment as a failure."},{"start_s":16.4,"text":"What if you replayed it as a training opportunity instead?"},{"start_s":20.0,"text":"Bill Beswick puts it this way — you cannot achieve greatness without mistakes."},{"start_s":24.8,"text":"The question isn''t whether you make errors. The question is whether you''re big enough to accept them, learn from them, and refuse to let them define you."},{"start_s":33.2,"text":"That''s what we''re doing today. Retrospective reframing."},{"start_s":37.2,"text":"Not pretending the bad moment didn''t happen. Updating your brain''s response to it with the tools you now have."},{"start_s":44.0,"text":"Every time you do this, that memory loses a little more of its charge."},{"start_s":48.4,"text":"And the next time something similar happens in competition, your brain looks for the trained response — not the old panic pattern."},{"start_s":55.6,"text":"Think of a specific moment. One that still has some weight to it. That''s the one."},{"start_s":61.8,"text":"On your screen you''re going to walk through it."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Describe the moment — the situation, what happened, what your mind did, and how it affected your performance.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"At what exact point did the spiral begin? What was the first thought that started the chain?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"With the tools you have now — your reset word, your reset protocol, your focus anchor, your If-Then plan — what would you have done differently? Walk through it step by step.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_19/lesson_19_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"That moment just became a rep."},{"start_s":2.6,"text":"The next time something like that arrives in competition — your brain already has a response."},{"start_s":8.6,"text":"You''ve been there. And now you come out the other side."},{"start_s":13.0,"text":"After you finish — Day 19 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 20: Embracing the Suffer
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000020',
  'a0000000-0000-0000-0000-000000000001',
  'Embracing the Suffer',
  235,
  'standard',
  19,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_20/lesson_20_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 20."},{"start_s":1.0,"text":"I want to ask you a question that Bill Beswick asks every elite athlete he works with."},{"start_s":6.6,"text":"How much are you willing to suffer?"},{"start_s":9.4,"text":"Not tolerate. Suffer."},{"start_s":11.4,"text":"The discomfort of a hard training block. The exhaustion of competing when your body has nothing left."},{"start_s":16.8,"text":"The psychological pain of being behind, of being doubted, of fighting for something that isn''t guaranteed."},{"start_s":22.6,"text":"High achievement inherently involves discomfort. That''s not a side effect of greatness. It''s the price of admission."},{"start_s":29.4,"text":"Here''s what acceptance means in the context of sport."},{"start_s":32.6,"text":"It doesn''t mean you like the hard parts. It means you stop treating the hard parts as signals to stop."},{"start_s":38.6,"text":"You accept that they''re present — the fatigue, the doubt, the fear — and you compete alongside them instead of waiting for them to go away."},{"start_s":46.2,"text":"They won''t go away. The athletes who win championships aren''t the ones who stopped feeling the pressure."},{"start_s":52.2,"text":"They''re the ones who learned to keep moving through it."},{"start_s":55.4,"text":"Beswick asks his athletes to face this question directly. Not to inspire them. To prepare them."},{"start_s":61.4,"text":"Because when the suffering arrives — and it will — the athlete who has already said yes to it handles it completely differently than the one who''s surprised by it."},{"start_s":72.0,"text":"On your screen you''re going to answer his three core questions."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"What do you want? Not what you''re supposed to want — what do you actually want from your athletic career? Be honest and specific.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"How badly do you want it? What is the evidence in your daily behavior that you want it at that level? Not intentions — actual actions.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"How much will you suffer for it? What are you willing to go through — physically, mentally, emotionally — to get to where you''re trying to go?","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_20/lesson_20_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Those three answers are your commitment contract with yourself."},{"start_s":4.4,"text":"Not with your coaches. Not with your team. With yourself."},{"start_s":8.6,"text":"Go hit the journal."},{"start_s":11.2,"text":"After you finish — Day 20 is complete."}]},{"type":"journal_prompt","prompt":"Where is the gap between what you say you want and how you''re actually training for it? What does closing that gap require?"}]}'::jsonb
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

-- ============================================================
-- Day 21: The Fighter Mindset
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000021',
  'a0000000-0000-0000-0000-000000000001',
  'The Fighter Mindset',
  170,
  'standard',
  20,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_21/lesson_21_seg_01.mp3"],"total_audio_seconds":70.0,"timed_text":[{"start_s":0.0,"text":"Day 21."},{"start_s":1.0,"text":"When you face a challenge — a big competition, an adversity, a moment that tests you — your brain does something automatic."},{"start_s":8.2,"text":"It imagines the worst case. Embarrassment. Failure. Injury. Loss. The fear scenario."},{"start_s":13.6,"text":"That''s not weakness. That''s your nervous system doing exactly what it''s designed to do."},{"start_s":18.6,"text":"The threat response is ancient. It was built to keep you alive."},{"start_s":22.2,"text":"And it still fires the same way whether you''re facing a predator or stepping up to the starting line."},{"start_s":27.4,"text":"Bill Beswick identifies two types of athletes in those moments. The victim and the fighter."},{"start_s":32.8,"text":"The victim acknowledges the fear and becomes it. They make excuses. They shrink."},{"start_s":37.4,"text":"They find reasons why the situation is unfair or why they''re not ready. And they stay on the safe side of the line."},{"start_s":43.0,"text":"The fighter acknowledges the same fear — and steps over the line anyway."},{"start_s":47.4,"text":"Not because they''re not afraid. Because they''ve decided that the fear doesn''t get to make the call."},{"start_s":52.6,"text":"The difference between these two isn''t talent. It isn''t physical preparation."},{"start_s":56.8,"text":"It''s a decision made in the seconds before the whistle blows about who gets to be in charge — you or the fear."},{"start_s":63.4,"text":"You''ve been building the tools in here to make that decision automatically. Today we name it explicitly."},{"start_s":68.4,"text":"On your screen you''re going to identify your line — and declare which side you choose."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Describe the fear you feel before your most challenging competitive moments. Be specific — what does it say? What worst-case scenario does your brain go to?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Now name it for what it is — your brain trying to protect you. It''s not the truth. It''s a signal.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"The fighter steps over the line anyway. What does stepping over the line look like for you — specifically, in the moment that fear arrives?","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_21/lesson_21_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Victim or fighter. That decision happens in seconds."},{"start_s":4.0,"text":"You''ve been training for it for 21 days. Trust the reps."},{"start_s":8.6,"text":"After you finish — Day 21 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 22: Visualization — See the Outcome
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000022',
  'a0000000-0000-0000-0000-000000000001',
  'Visualization — See the Outcome',
  296,
  'standard',
  21,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_22/lesson_22_seg_01.mp3"],"total_audio_seconds":70.0,"timed_text":[{"start_s":0.0,"text":"Day 22."},{"start_s":1.0,"text":"Today we start visualization. And this is one of the highest-leverage tools in the entire program."},{"start_s":7.6,"text":"Research shows that mental imagery activates the same neural pathways as physical execution."},{"start_s":12.8,"text":"Your brain doesn''t cleanly distinguish between a vivid visualization and the real thing."},{"start_s":17.0,"text":"Every visualization rep is a real training rep."},{"start_s":19.8,"text":"I build custom visualization scripts for every athlete I coach one-on-one — built specifically around your sport, your position, your competitive scenarios."},{"start_s":28.4,"text":"We start with outcome visualization."},{"start_s":30.8,"text":"You need to be able to see yourself succeeding before you can train yourself to execute the process that gets you there."},{"start_s":37.6,"text":"The more sensory detail you build — the sights, the sounds, the physical sensations — the more powerful it becomes."},{"start_s":44.4,"text":"On your screen we start with one breath, then you''re going to close your eyes and build the scene."}]},{"type":"timed_exercise","duration_seconds":16,"interactive_model":"box_breathing","visual_cues":["One full cycle. Settle in.","Follow the circle."],"steps":[{"text":"Inhale","duration_seconds":4,"haptic":"heavy"},{"text":"Hold","duration_seconds":4,"haptic":"light"},{"text":"Exhale","duration_seconds":4,"haptic":"heavy"},{"text":"Hold","duration_seconds":4,"haptic":"light"}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Close your eyes. Place yourself in your next competition. Build every detail of the environment.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What do you hear? The crowd, your teammates, the sounds specific to your sport.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Feel your body. What does it feel like to be moving well? What does that sensation feel like?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"See the moment — the execution, the result. Watch yourself succeed. Hold it.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"How does it feel when it happens? Stay there.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_22/lesson_22_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Your brain just treated that as a real performance rep."},{"start_s":4.0,"text":"Do this before every competition. Build the image until it feels familiar."},{"start_s":9.4,"text":"Because when it''s familiar, it''s less threatening — and when it''s less threatening, you compete free."},{"start_s":16.2,"text":"Go hit the journal."},{"start_s":19.0,"text":"After you finish — Day 22 is complete."}]},{"type":"journal_prompt","prompt":"How vivid was the visualization? What detail made it feel most real — and what was hardest to hold?"}]}'::jsonb
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

-- ============================================================
-- Day 23: Your Visualization Board  (new block type: visualization_board)
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000023',
  'a0000000-0000-0000-0000-000000000001',
  'Your Visualization Board',
  220,
  'standard',
  22,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_23/lesson_23_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 23."},{"start_s":1.0,"text":"Commitment is about directing your behavior toward your values. Not when you feel like it. Every day."},{"start_s":7.4,"text":"One of the most powerful ways to stay anchored to your values is to make them visible."},{"start_s":12.0,"text":"To build a picture of the life and the athlete you''re committed to becoming — and put it somewhere you have to see every single day."},{"start_s":19.4,"text":"Research on visual goal representation shows that when the brain is repeatedly exposed to images of a desired outcome, it begins to prioritize the information and opportunities that align with it."},{"start_s":29.4,"text":"Your attention starts to organize around the image."},{"start_s":32.2,"text":"What you see consistently, you move toward."},{"start_s":34.8,"text":"But this only works if it''s real. Not generic inspiration."},{"start_s":38.6,"text":"Specific images and words that represent your athletic goals, your why from Day 17, your identity statement, the life you''re committing to building."},{"start_s":46.6,"text":"Use Canva, use images from the internet, use words — build something that, when you look at it, you feel the pull of it."},{"start_s":54.4,"text":"The version of yourself on the other side of the work."},{"start_s":57.4,"text":"On your screen you''ll find the visualization board tool. Take your time with it."}]},{"type":"visualization_board","ambient_audio":"ambient/ambient_music.mp3","prompt":"Build a picture of the athlete you''re committing to becoming. Your goals. Your why. Your future. Make it specific enough that looking at it every day means something.","pull_from_profile":["identity_statement","core_why"],"save_to_profile":true},{"type":"voiceover","audio_files":["lesson_23/lesson_23_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"That board lives on your home screen now."},{"start_s":3.2,"text":"Look at it every morning before you train."},{"start_s":5.8,"text":"Look at it the night before competition."},{"start_s":8.4,"text":"Look at it when the work gets hard and the results aren''t showing up yet."},{"start_s":14.0,"text":"That''s not decoration. That''s a commitment device."},{"start_s":18.6,"text":"After you finish — Day 23 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 24: Raise Your Bottom Line
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000024',
  'a0000000-0000-0000-0000-000000000001',
  'Raise Your Bottom Line',
  235,
  'standard',
  23,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_24/lesson_24_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 24."},{"start_s":1.0,"text":"Most athletes aim for perfection. I understand why. You want to be at your best."},{"start_s":6.4,"text":"But perfection as a standard is actually one of the most damaging things you can chase — because the gap between your best and your baseline becomes a source of constant shame."},{"start_s":15.4,"text":"Bill Beswick teaches something different. He calls it raising the bottom line."},{"start_s":20.0,"text":"Here''s what that means. Every athlete has a range. Their best days and their worst days."},{"start_s":25.4,"text":"The question isn''t how high your ceiling is. The question is: how high is your floor?"},{"start_s":30.8,"text":"If your worst competitive performance is operating at 60% of your capability — that''s your bottom line."},{"start_s":36.8,"text":"And what Beswick found is that the athletes who compound over time are the ones who commit to the fundamentals so consistently that their floor rises."},{"start_s":45.0,"text":"Not their ceiling. Their floor. Their worst days become 75%. Then 80%. Then 85%."},{"start_s":51.4,"text":"That compounding happens not through heroic efforts on game day."},{"start_s":55.4,"text":"It happens through the daily behaviors — the routine, the evidence log, the mental reps — that you build when nobody''s watching."},{"start_s":62.4,"text":"The commitment isn''t to be perfect. It''s to be reliable."},{"start_s":66.4,"text":"On your screen you''re going to look at your current floor — and commit to raising it."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Honestly — what does your worst competitive performance look like right now? Not your fear of what it could be. What does it actually look like on a bad day?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What are the specific daily behaviors that, if you did them consistently, would raise that floor? Not the big things — the small, repeatable ones.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Commit to one behavior from that list that you will do every single day for the rest of this program — not because you feel like it, but because that''s how the floor rises.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_24/lesson_24_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Commit to your worst day being good enough."},{"start_s":3.6,"text":"Because when your floor is solid, your ceiling takes care of itself."},{"start_s":8.6,"text":"Go hit the journal."},{"start_s":11.2,"text":"After you finish — Day 24 is complete."}]},{"type":"journal_prompt","prompt":"What would change about how you compete if you stopped chasing your best day and started committing to your most reliable day?"}]}'::jsonb
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

-- ============================================================
-- Day 25: The Mistake Protocol
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000025',
  'a0000000-0000-0000-0000-000000000001',
  'The Mistake Protocol',
  240,
  'standard',
  24,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_25/lesson_25_seg_01.mp3"],"total_audio_seconds":65.0,"timed_text":[{"start_s":0.0,"text":"Day 25."},{"start_s":1.0,"text":"What happens in the five seconds after a mistake determines more about your performance than the mistake itself."},{"start_s":7.6,"text":"Here''s the pattern. Athlete makes an error. Brain fires immediately — replays the mistake, catastrophizes the consequences."},{"start_s":14.0,"text":"Athlete carries that weight into the next play. Next play breaks down. Spiral."},{"start_s":18.6,"text":"The mistake didn''t cost them. The five seconds after did."},{"start_s":22.4,"text":"Your job in those five seconds is one thing: interruption."},{"start_s":26.0,"text":"You are not processing the mistake. You are not evaluating what went wrong."},{"start_s":30.6,"text":"You have one job — get back to the next play."},{"start_s":33.8,"text":"Three steps. Reset word — say it. Physical cue — run it. Focus anchor — return to it."},{"start_s":40.2,"text":"Five seconds. Back in the game."},{"start_s":42.8,"text":"Today you''re drilling that sequence three times back to back until it''s locked."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"A mistake just happened. 5 seconds. Step 1 — your reset word. Say it now.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Step 2 — your physical cue. Run it right now.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Step 3 — your focus anchor. Return to it. You''re here. Next play.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Again. Mistake. Reset word. Physical cue. Focus anchor.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"One more time. All three steps. Locked.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Describe what running that sequence felt like. Did it interrupt the spiral? What was hardest to execute?","min_entry_seconds":0}],"summary":{"display":"last","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_25/lesson_25_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Drill that protocol in practice this week. Make an intentional error and run it."},{"start_s":6.6,"text":"Make it automatic before competition demands it."},{"start_s":10.4,"text":"After you finish — Day 25 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 26: Reframe — What You Would Do Differently
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000026',
  'a0000000-0000-0000-0000-000000000001',
  'Reframe — What You Would Do Differently',
  260,
  'standard',
  25,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_26/lesson_26_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 26."},{"start_s":1.0,"text":"We''ve done a reframe before. Today we go deeper."},{"start_s":4.8,"text":"You''ve added tools since then. Your reset word. Your If-Then plan. Your self-talk replacements. Your mistake protocol. The fighter mindset. Your focus anchor is trained."},{"start_s":14.0,"text":"I want you to go back to a different moment — a competition that didn''t go the way you wanted, where your mind got in the way, one you''ve carried as a failure."},{"start_s":22.0,"text":"We''re going to replay it. Not to relive the pain. To rewrite the response."},{"start_s":26.8,"text":"Retrospective reframing is a specific skill."},{"start_s":29.6,"text":"You''re not pretending the bad moment didn''t happen."},{"start_s":32.2,"text":"You''re showing your nervous system that you now have a trained answer to the moment that used to have none."},{"start_s":37.8,"text":"Every time you do this, that memory loses its charge."},{"start_s":41.0,"text":"And the next time something similar arrives, your brain looks for the trained response — not the old pattern."},{"start_s":47.4,"text":"Think of a moment that still stings. That''s the one."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Describe the moment — the situation, what happened, what your mind did, and how it affected your performance.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"At what exact point did the spiral begin? What was the trigger thought?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Replay it with your full toolkit. From that exact moment — walk through what you would have done. Every step. Reset word, physical cue, focus anchor, self-talk replacement. Be specific.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Read your reframed response back. This is your trained answer to that moment now.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_26/lesson_26_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"That memory just became a rep."},{"start_s":2.8,"text":"The next time something like it arrives — you''ve already been there with a plan."},{"start_s":8.4,"text":"Go hit the journal."},{"start_s":11.0,"text":"After you finish — Day 26 is complete."}]},{"type":"journal_prompt","prompt":"How did it feel to give your brain a trained response for that moment? Did the weight of that memory change at all?"}]}'::jsonb
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

-- ============================================================
-- Day 27: What's Next?
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000027',
  'a0000000-0000-0000-0000-000000000001',
  'What''s Next?',
  170,
  'standard',
  26,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_27/lesson_27_seg_01.mp3"],"total_audio_seconds":70.0,"timed_text":[{"start_s":0.0,"text":"Day 27."},{"start_s":1.0,"text":"Bill Beswick ends every program he runs with a question he wants athletes to carry for the rest of their career."},{"start_s":7.4,"text":"What''s next?"},{"start_s":9.2,"text":"Not what did I achieve. What''s next."},{"start_s":12.0,"text":"Here''s why this matters. One of the biggest performance killers in sport is complacency after success."},{"start_s":18.0,"text":"You achieve something — you make the team, you get the starting spot, you hit a personal best — and without realizing it, your standards quietly drop."},{"start_s":26.2,"text":"Because part of your brain thinks the job is done."},{"start_s":29.2,"text":"The What''s next mentality prevents that. It builds the habit of continuous growth."},{"start_s":34.2,"text":"Of setting new limits the moment you reach the old ones. Of understanding that achievement is not a destination — it''s a direction."},{"start_s":41.4,"text":"The athletes who sustain elite performance over years and seasons are not the ones who were satisfied with what they built."},{"start_s":48.0,"text":"They were the ones who used each achievement as a launching pad for the next standard."},{"start_s":53.6,"text":"You''re three days from completing this program."},{"start_s":56.6,"text":"And the most important thing I can leave you with is this: finishing is not the goal. The next chapter is."},{"start_s":63.4,"text":"On your screen you''re going to answer the question."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"What have you built over the last 27 days that you didn''t have when you started?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What is the next standard you''re committing to? Not a wish — a specific, behavioral commitment that starts the day after this program ends.","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What''s next? Write it as a declaration. ''After this program, I commit to...''","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_27/lesson_27_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"What''s next."},{"start_s":1.8,"text":"Keep asking that question. Every achievement, every season, every milestone."},{"start_s":7.0,"text":"The answer to that question is where the growth lives."},{"start_s":11.0,"text":"After you finish — Day 27 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 28: Identity Under Pressure
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000028',
  'a0000000-0000-0000-0000-000000000001',
  'Identity Under Pressure',
  196,
  'standard',
  27,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_28/lesson_28_seg_01.mp3"],"total_audio_seconds":70.0,"timed_text":[{"start_s":0.0,"text":"Day 28."},{"start_s":1.0,"text":"Who are you when it gets hard?"},{"start_s":3.4,"text":"Not who you are on your best day. Not who you want to be."},{"start_s":6.8,"text":"Who are you when you''re behind in the fourth quarter, when you''ve made two mistakes back to back, when the biggest competition of your season is on the line and everything in your body is asking you to quit."},{"start_s":17.2,"text":"Think back to where you were when this journey started."},{"start_s":20.6,"text":"There was probably a version of you that didn''t have an answer for that question."},{"start_s":25.2,"text":"That defaulted to the situation. That got swallowed by the moment."},{"start_s":29.0,"text":"You''ve been building the answer for 28 days."},{"start_s":32.2,"text":"The mental training doesn''t change you in the comfortable moments."},{"start_s":36.0,"text":"It reveals you in the difficult ones."},{"start_s":38.2,"text":"And every rep you''ve put in has been preparing you for exactly that moment — the one that used to break you."},{"start_s":44.4,"text":"Today I want you to write your competition identity."},{"start_s":47.4,"text":"Not a general statement. The version of you that shows up when the game is on the line and everything is against you."},{"start_s":54.8,"text":"On your screen — one breath, then write it."}]},{"type":"timed_exercise","duration_seconds":16,"interactive_model":"box_breathing","visual_cues":["One full cycle. Settle in.","Follow the circle."],"steps":[{"text":"Inhale","duration_seconds":4,"haptic":"heavy"},{"text":"Hold","duration_seconds":4,"haptic":"light"},{"text":"Exhale","duration_seconds":4,"haptic":"heavy"},{"text":"Hold","duration_seconds":4,"haptic":"light"}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Write your competition identity statement — specifically for your hardest moment. Who are you when the game is on the line, you''re behind, and everything hurts? Present tense. ''I am an athlete who...''","min_entry_seconds":0}],"summary":{"display":"last","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_28/lesson_28_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"Read that before every competition from here forward."},{"start_s":4.0,"text":"Not as a wish. As a reminder of a decision you''ve already made."},{"start_s":9.0,"text":"Go hit the journal."},{"start_s":11.6,"text":"After you finish — Day 28 is complete."}]},{"type":"journal_prompt","prompt":"When was the last time you actually lived out that identity in competition? What made it possible?"}]}'::jsonb
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

-- ============================================================
-- Day 29: Reframe — Turning Adversity Into Fuel
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000029',
  'a0000000-0000-0000-0000-000000000001',
  'Reframe — Turning Adversity Into Fuel',
  200,
  'standard',
  28,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_29/lesson_29_seg_01.mp3"],"total_audio_seconds":75.0,"timed_text":[{"start_s":0.0,"text":"Day 29."},{"start_s":1.0,"text":"One last reframe. And this one goes the broadest."},{"start_s":4.8,"text":"The first two reframe exercises were about specific moments."},{"start_s":8.0,"text":"Today I want you to think bigger."},{"start_s":10.0,"text":"A period in your athletic career — a season, a stretch of months, maybe longer — where it felt like everything was working against you."},{"start_s":17.8,"text":"Injuries. A coaching change. Losing your position. A performance slump you couldn''t climb out of."},{"start_s":24.0,"text":"Most athletes carry that period as evidence against themselves."},{"start_s":27.2,"text":"That''s when I found out I wasn''t as good as I thought. That''s when things started going wrong."},{"start_s":32.8,"text":"Here''s what Beswick found working with athletes who had been through exactly those periods."},{"start_s":37.6,"text":"The ones who came out the other side and competed at a higher level than before — they didn''t avoid the adversity. They extracted from it."},{"start_s":45.2,"text":"The hard period didn''t break them. It built the part of them that''s unbreakable."},{"start_s":50.4,"text":"Because you cannot achieve greatness without going through the difficult parts."},{"start_s":55.0,"text":"The suffering isn''t a detour. It''s the training."},{"start_s":58.4,"text":"Think about your hardest stretch. Not to relive it. To extract what it actually built."}]},{"type":"prompt_cards","ambient_audio":"ambient/ambient_music.mp3","cards":[{"intro_hold_seconds":0,"prompt":"Describe the hardest stretch of your athletic career. What was happening? What made it difficult?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What did that period demand of you mentally that nothing else had before?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"What did you prove about yourself by getting through it — even if it didn''t feel that way at the time?","min_entry_seconds":0},{"intro_hold_seconds":0,"prompt":"Write one sentence: what that period built in you that you now compete with.","min_entry_seconds":0}],"summary":{"display":"all","header":"","hold_seconds":0}},{"type":"voiceover","audio_files":["lesson_29/lesson_29_seg_02.mp3"],"total_audio_seconds":25.0,"timed_text":[{"start_s":0.0,"text":"That adversity wasn''t evidence against you."},{"start_s":3.6,"text":"It was the training. And it''s in your evidence log now."},{"start_s":8.0,"text":"Not history — ammunition."},{"start_s":10.4,"text":"After you finish — Day 29 is complete."}]}]}'::jsonb
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

-- ============================================================
-- Day 30: The Evidence  (new block type: program_completion)
-- ============================================================
insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000030',
  'a0000000-0000-0000-0000-000000000001',
  'The Evidence',
  310,
  'standard',
  29,
  true,
  '{"blocks":[{"type":"voiceover","audio_files":["lesson_30/lesson_30_seg_01.mp3"],"total_audio_seconds":85.0,"timed_text":[{"start_s":0.0,"text":"Day 30."},{"start_s":1.2,"text":"You made it."},{"start_s":2.8,"text":"I don''t want to gloss over that."},{"start_s":4.6,"text":"Most people quit somewhere around Day 8 or Day 15 — right when the novelty wears off and it starts feeling like work."},{"start_s":11.6,"text":"You kept showing up. Every single day. That is not a small thing."},{"start_s":16.4,"text":"Think about where you were when you started this. What you didn''t have yet."},{"start_s":20.8,"text":"No reset word. No reset protocol. No If-Then plan. No visualization practice. No evidence log."},{"start_s":26.8,"text":"No pre-competition routine. No traffic light system. No language for what was happening in your head when the pressure hit. No connection to your why."},{"start_s":34.8,"text":"You have all of that now."},{"start_s":37.0,"text":"Not because someone gave it to you. Because you built it — rep by rep, day by day, lesson by lesson."},{"start_s":43.6,"text":"Beswick ends every program he runs by asking his athletes to ask themselves one question."},{"start_s":49.0,"text":"Not how much did I improve. Not was it worth it."},{"start_s":52.6,"text":"What''s next?"},{"start_s":54.6,"text":"That question is yours now. Take it into every season, every competition, every time you feel yourself starting to plateau."},{"start_s":62.0,"text":"The athlete who keeps asking that question never stops growing."},{"start_s":66.4,"text":"Before you hit the journal, I want you to do one thing."},{"start_s":69.6,"text":"Open your visualization board. Look at the athlete you committed to becoming."},{"start_s":74.6,"text":"Then read your evidence log. See what you''ve actually done."}]},{"type":"program_completion","ambient_audio":"ambient/ambient_music.mp3","cards":[{"source":"profile.visualization_board","caption":"Open your visualization board. The athlete you committed to becoming on Day 23. Take your time."},{"source":"profile.evidence_log","caption":"Now your evidence log. Read it from the beginning. Not to compare — to see."},{"source":"static","text":"The distance between that board and where you stand right now? That''s the work. And you''ve already started closing it."},{"source":"static","text":"What''s next?"}]},{"type":"voiceover","audio_files":["lesson_30/lesson_30_seg_02.mp3"],"total_audio_seconds":45.0,"timed_text":[{"start_s":0.0,"text":"You don''t need a score to know what changed."},{"start_s":3.6,"text":"You know it in how you showed up to practice this week."},{"start_s":7.4,"text":"How you handled the last competition."},{"start_s":9.8,"text":"How quickly you recovered after the last mistake."},{"start_s":13.0,"text":"How differently you talk to yourself now than you did 30 days ago."},{"start_s":17.2,"text":"That''s the evidence."},{"start_s":19.4,"text":"Keep the log. Run the routine. Use the tools."},{"start_s":23.2,"text":"Build on the why you wrote on Day 17."},{"start_s":26.6,"text":"And when competition gets hard — and it will — remember that you''ve already been to the difficult places in here, and you came out with a plan every single time."},{"start_s":37.4,"text":"The program is complete. The training isn''t."},{"start_s":41.4,"text":"Go compete like it."}]},{"type":"journal_prompt","prompt":"What is different about the way you think about competing now compared to where you started? What does the next chapter look like — and what''s your first move?"}]}'::jsonb
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

-- ============================================================
-- lesson_categories
-- ============================================================
delete from public.lesson_categories
where lesson_id in (
  'd0000000-0000-0000-0000-000000000015',
  'd0000000-0000-0000-0000-000000000016',
  'd0000000-0000-0000-0000-000000000017',
  'd0000000-0000-0000-0000-000000000018',
  'd0000000-0000-0000-0000-000000000019',
  'd0000000-0000-0000-0000-000000000020',
  'd0000000-0000-0000-0000-000000000021',
  'd0000000-0000-0000-0000-000000000022',
  'd0000000-0000-0000-0000-000000000023',
  'd0000000-0000-0000-0000-000000000024',
  'd0000000-0000-0000-0000-000000000025',
  'd0000000-0000-0000-0000-000000000026',
  'd0000000-0000-0000-0000-000000000027',
  'd0000000-0000-0000-0000-000000000028',
  'd0000000-0000-0000-0000-000000000029',
  'd0000000-0000-0000-0000-000000000030'
);

insert into public.lesson_categories (lesson_id, category)
values
  ('d0000000-0000-0000-0000-000000000015', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000016', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000017', 'commitment'),
  ('d0000000-0000-0000-0000-000000000018', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000018', 'commitment'),
  ('d0000000-0000-0000-0000-000000000019', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000019', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000020', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000021', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000022', 'commitment'),
  ('d0000000-0000-0000-0000-000000000023', 'commitment'),
  ('d0000000-0000-0000-0000-000000000024', 'commitment'),
  ('d0000000-0000-0000-0000-000000000025', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000025', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000026', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000026', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000027', 'commitment'),
  ('d0000000-0000-0000-0000-000000000028', 'commitment'),
  ('d0000000-0000-0000-0000-000000000029', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000030', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000030', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000030', 'commitment');

-- ============================================================
-- program_schedule
-- ============================================================
update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000015', updated_at = now()
where program_version = 'v1' and day_number = 15;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000016', updated_at = now()
where program_version = 'v1' and day_number = 16;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000017', updated_at = now()
where program_version = 'v1' and day_number = 17;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000018', updated_at = now()
where program_version = 'v1' and day_number = 18;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000019', updated_at = now()
where program_version = 'v1' and day_number = 19;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000020', updated_at = now()
where program_version = 'v1' and day_number = 20;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000021', updated_at = now()
where program_version = 'v1' and day_number = 21;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000022', updated_at = now()
where program_version = 'v1' and day_number = 22;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000023', updated_at = now()
where program_version = 'v1' and day_number = 23;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000024', updated_at = now()
where program_version = 'v1' and day_number = 24;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000025', updated_at = now()
where program_version = 'v1' and day_number = 25;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000026', updated_at = now()
where program_version = 'v1' and day_number = 26;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000027', updated_at = now()
where program_version = 'v1' and day_number = 27;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000028', updated_at = now()
where program_version = 'v1' and day_number = 28;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000029', updated_at = now()
where program_version = 'v1' and day_number = 29;

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000030', updated_at = now()
where program_version = 'v1' and day_number = 30;

commit;
