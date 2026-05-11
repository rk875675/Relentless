-- ============================================================
-- Library lessons: tap_through_text 3-line paragraph limit
--
-- Rewrites the paragraphs array in the first (tap_through_text)
-- block so no single paragraph exceeds ~3 lines on screen.
-- Long paragraphs are split into shorter, rephrased sentences.
-- Only touches the paragraphs array; ambient_audio, exercise
-- blocks, and all other fields are preserved.
--
-- Affects: all 14 library lessons (M-01..M-05, A-01..A-06, C-01..C-03)
-- Does NOT touch any WOD / program lesson.
-- ============================================================

begin;

-- M-01: Box Breathing
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Navy SEALs use this before combat. Surgeons use it before operations.",
    "Now you''re going to use it before battle.",
    "The structure is simple: four seconds in, four hold, four out, four hold.",
    "Breathe in through your nose, out through your mouth.",
    "This doesn''t just calm you down — it anchors your mind.",
    "When your thoughts want to spiral, this gives them something precise to lock onto.",
    "If your mind drifts, that''s fine. Acknowledge the thought, let it go, and return to your breath.",
    "Close your eyes if you''d like. The exercise begins now."
  ]'::jsonb
) where id = 'e1000000-0000-0000-0000-000000000001';

-- M-02: Coffee Breath
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Most athletes wait to feel ready. You don''t have that luxury right now.",
    "Coffee Breath is controlled hyperventilating — one second in, one second out.",
    "It switches on your sympathetic nervous system.",
    "That''s the same switch your body uses when it needs to perform.",
    "This isn''t meditation. This is ignition.",
    "When the exercise starts, breathe fast and keep pace with the circle.",
    "Don''t overthink it. Just move air. The energy will follow."
  ]'::jsonb
) where id = 'e1000000-0000-0000-0000-000000000003';

-- M-03: Milk Breath
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Not every moment calls for intensity, and not every moment calls for calm.",
    "Sometimes all you need is to find level.",
    "Milk Breath is equal breathing — the same count in as out. No force in either direction.",
    "Four seconds in through the nose. Four seconds out through the mouth.",
    "The goal isn''t to feel anything. The goal is to return to zero.",
    "Use this between events, between reps, or any time you''ve been pulled off your baseline.",
    "Start now. Let the circle guide you."
  ]'::jsonb
) where id = 'e1000000-0000-0000-0000-000000000005';

-- M-04: Whiskey Breath
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Your body doesn''t automatically know when it''s time to stop. You have to tell it.",
    "The long exhale is the key. It activates your parasympathetic nervous system.",
    "That''s the system responsible for rest and recovery.",
    "Four seconds in through the nose. Eight seconds out through the mouth.",
    "The exhale is the signal. The longer it is, the more your body believes it''s safe to shut down.",
    "Use this when you''re winding down — after a hard session or before bed.",
    "Any time you need to shift out of compete mode, this is the tool.",
    "Get comfortable. Close your eyes. Let the circle lead you out."
  ]'::jsonb
) where id = 'e1000000-0000-0000-0000-000000000007';

-- M-05: Body Scan
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Your body is always sending you signals. Most of the time, you''re not listening.",
    "Right now, tension is sitting somewhere in your body.",
    "Your jaw, your shoulders, your hands — and you might not even know it.",
    "A body scan moves your attention slowly through your body from head to feet.",
    "You''re not trying to fix anything. You''re just noticing. Then releasing.",
    "This is one of the most practiced techniques in elite sports psychology. Simple doesn''t mean easy.",
    "Sit or lie down if you can. Close your eyes. Begin when you''re ready."
  ]'::jsonb
) where id = 'e1000000-0000-0000-0000-000000000009';

-- A-01: Worry Drop
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Your brain can''t distinguish a real threat from an imagined one.",
    "Every worry gets treated the same — urgent, unresolved, consuming.",
    "The goal of this exercise isn''t to fix your worries. It''s to sort them.",
    "Write down everything on your mind right now — every fear, doubt, and what-if.",
    "Each one goes down as a separate entry.",
    "Then you''re going to let go of anything you can''t control today. Not forever. Just for now.",
    "What''s left is your actual job. And you''re going to figure out exactly what to do about it.",
    "Start by getting it all out. Don''t filter. Don''t judge. Just write."
  ]'::jsonb
) where id = 'e2000000-0000-0000-0000-000000000001';

-- A-02: Control Check
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Spending energy on things you can''t control is the fastest way to lose your edge.",
    "Perceived control is one of the strongest predictors of performance under pressure.",
    "This exercise forces you to get specific. Exactly what is and isn''t in your hands.",
    "You''re going to fill two columns. What I control. What I don''t.",
    "The uncontrollable side gets acknowledged, and then closed.",
    "This isn''t about ignoring it — it''s a deliberate decision to stop spending energy there.",
    "The controllable side becomes your entire focus from this point forward.",
    "Be honest. Vague answers won''t help you."
  ]'::jsonb
) where id = 'e2000000-0000-0000-0000-000000000003';

-- A-03: Name It, Face It
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Suppressing an emotion doesn''t make it weaker. It makes it louder.",
    "Simply naming an emotion reduces activity in the amygdala — your brain''s threat center.",
    "Psychologist Matthew Lieberman at UCLA showed this happens almost immediately.",
    "Right now, you''re going to name exactly what you''re feeling. Not what you wish you were feeling.",
    "Then you''re going to find it in your body. Where does it live?",
    "Then you''re going to answer one question honestly.",
    "That''s the whole exercise. It''s short because it doesn''t need to be long."
  ]'::jsonb
) where id = 'e2000000-0000-0000-0000-000000000005';

-- A-04: The Honest Line
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Pretending you''re ready when you''re not costs more energy than just admitting the truth.",
    "Your brain already knows. Fighting it is the drain.",
    "Athletes who face their actual situation honestly perform more consistently under pressure.",
    "Suppressing or reframing reality doesn''t help — it just delays the reckoning.",
    "Even the most positive athletes can crash and burn when positivity has no direction.",
    "Positivity without honesty becomes suppression — and suppressed fears always surface.",
    "This exercise isn''t about feeling better. It''s about being clear.",
    "You''re going to write exactly where you are right now. No spin. No positivity for the sake of it.",
    "Then you''re going to answer one question that matters more than any pep talk.",
    "Be honest. The only person reading this is you."
  ]'::jsonb
) where id = 'e2000000-0000-0000-0000-000000000007';

-- A-05: The Coach's Perspective
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "You are almost always harder on yourself than you would ever be on someone you care about.",
    "Coaching yourself like you''d coach an athlete dramatically reduces emotional intensity.",
    "Psychologist Ethan Kross at Michigan proved this also sharpens decision-making under stress.",
    "Distance is the tool. You''re going to use it right now.",
    "Picture an athlete walking into your office.",
    "They''re carrying everything you''re currently carrying — the doubt, the fear, the pressure.",
    "What would you actually tell them? Not what sounds good. What would genuinely help?",
    "Write like you mean it. That athlete needs you right now."
  ]'::jsonb
) where id = 'e2000000-0000-0000-0000-000000000009';

-- A-06: Emotional Replay
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "You can''t regulate what you can''t see.",
    "Most athletes lose the mental game not because they''re weak — but because they can''t read themselves.",
    "Precisely identifying your emotional state gives you better regulation when it counts.",
    "Athletes with strong emotional awareness consistently outperform those without it.",
    "This exercise takes you back to a specific moment when an emotion worked against you.",
    "This isn''t about fixing the past. It''s about mapping what happened.",
    "The goal is to recognize it early enough next time to change the outcome.",
    "Think of one moment. A race, a practice, a workout where your head got in the way.",
    "Walk us through it. Be specific."
  ]'::jsonb
) where id = 'e2000000-0000-0000-0000-000000000011';

-- C-01: Future Self
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "The past does not equal the future. Something not working yet doesn''t mean it won''t.",
    "You don''t make decisions based on who you were. You make them based on who you''re becoming.",
    "Most athletes set goals. The best athletes build an identity.",
    "Knowing who you''ll be when you get there is different from just wanting results.",
    "You''re going to describe your future self in detail.",
    "Pick a time frame — 3 months, 6 months, a year. You decide how far out to look.",
    "One rule: describe what you want, not what you don''t want.",
    "Your brain thinks in images. Make sure you''re building the right one.",
    "Be specific — vague answers produce vague results.",
    "The more real this person feels, the more your decisions will start pointing toward them.",
    "Start building."
  ]'::jsonb
) where id = 'e3000000-0000-0000-0000-000000000001';

-- C-02: Your Foundation
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "Every athlete hits a point where the grind stops feeling worth it.",
    "The results stop coming. The body stops cooperating. The drive you had goes quiet.",
    "This is the moment that separates the ones who make it from the ones who don''t.",
    "Not talent. Not training. The ability to return to why you started.",
    "You''re going to build a list of everything that fuels you.",
    "Why you love this. What keeps you coming back. What you''d miss if it were gone.",
    "This isn''t a motivation exercise. It''s a foundation.",
    "Something to return to on any day, in any season, when nothing else makes sense.",
    "There are no wrong answers. Write what''s actually true for you — not what sounds good.",
    "Build your list. Take your time."
  ]'::jsonb
) where id = 'e3000000-0000-0000-0000-000000000003';

-- C-03: One Minute Ignition
update public.lessons set content_blocks = jsonb_set(
  content_blocks, '{blocks,0,paragraphs}',
  '[
    "You''re not going to wait until you feel motivated. That''s not how this works.",
    "Behavioral psychology is clear: action comes before motivation, not after.",
    "You don''t feel ready and then start. You start, and then you feel ready.",
    "The hardest part is always the first minute. Not the workout. Not the session. The first minute.",
    "You''re going to pick one thing right now and do it for 60 seconds. That''s the whole job.",
    "It doesn''t matter if you finish it. It doesn''t matter if it''s big. What matters is that you start.",
    "Pick something. Hit go. The rest will follow."
  ]'::jsonb
) where id = 'e3000000-0000-0000-0000-000000000005';

commit;
