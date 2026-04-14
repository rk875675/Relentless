-- Migration: insert WOD Days 2-7 real lesson content and update program_schedule.
-- Each lesson uses content_blocks JSONB with voiceover, timed_exercise, and
-- journal_prompt blocks.  Days 5-7 include box_breathing interactive model.
--
-- Replaces the placeholder pointer from 20260404000000_point_all_wods_to_day1.sql
-- for days 2-7 only; days 8-30 continue pointing to Day 1 until their content
-- is delivered.

begin;

-- ============================================================
-- Day 2: The Science of Choking (And How to Stop It)  [M]
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'The Science of Choking (And How to Stop It)',
  306,
  'standard',
  1,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_02/lesson_02_seg_01.mp3"
        ],
        "total_audio_seconds": 116.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Day 2." },
          { "start_s": 3.0, "text": "Today I want to show you the exact science." },
          { "start_s": 10.0, "text": "Daniel Kahneman won the Nobel Prize in 2002." },
          { "start_s": 20.0, "text": "The brain runs on two systems." },
          { "start_s": 28.0, "text": "System 1 is fast. Automatic. Instinctive." },
          { "start_s": 42.0, "text": "System 2 is slow. Deliberate. Analytical." },
          { "start_s": 60.0, "text": "Choking is what happens when System 2 tries to take control of something System 1 already owns." },
          { "start_s": 80.0, "text": "The fix isn''t to think less. It''s to train your mind to step back." },
          { "start_s": 95.0, "text": "Right now I want you to find your version of that moment." }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 105,
        "ambient_audio": "ambient/ambient_music.mp3",
        "steps": [
          {
            "text": "Describe a moment where your mind worked against you. Where were you? What was happening? What did your brain start doing instead of competing?",
            "duration_seconds": 60
          },
          {
            "text": "What was your brain doing? Thinking about the outcome? Watching your competition? Replaying a mistake? Worrying about what others think? Identify the pattern.",
            "duration_seconds": 45
          }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_02/lesson_02_seg_02.mp3"
        ],
        "total_audio_seconds": 25.0,
        "timed_text": [
          { "start_s": 0.0, "text": "What you just logged — that''s your distraction profile." },
          { "start_s": 8.0, "text": "Every drill from here is training you to catch that pattern before it catches you." },
          { "start_s": 18.0, "text": "Go hit the journal. One question." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Looking at what you selected — which distraction shows up most consistently for you? Does it get worse at specific moments in competition?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('d0000000-0000-0000-0000-000000000002', 'mindfulness');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000002',
    updated_at = now()
where program_version = 'v1'
  and day_number = 2;

-- ============================================================
-- Day 3: Your Baseline — Mental Gut Check  [M, A, C]
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Your Baseline — Mental Gut Check',
  227,
  'standard',
  2,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_03/lesson_03_seg_01.mp3"
        ],
        "total_audio_seconds": 51.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Day 3." },
          { "start_s": 3.0, "text": "Before we go any further — we need a starting point." },
          { "start_s": 10.0, "text": "Think of this like measuring your vertical before a training block." },
          { "start_s": 20.0, "text": "Score yourself honestly from 1 to 10." },
          { "start_s": 30.0, "text": "1 means it''s a major problem. 10 means you''ve got it locked in." },
          { "start_s": 40.0, "text": "You''ll have 30 seconds per question. Read it, sit with it, and be honest." }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 90,
        "steps": [
          {
            "text": "Mindfulness — During competition, how often does your mind drift to outcomes, mistakes, or what people think — instead of staying on the task in front of you? 1 = constantly, 10 = never.",
            "duration_seconds": 30
          },
          {
            "text": "Acceptance — How much do nerves, fear, or self-doubt affect your performance — even when you know physically you''re ready? 1 = they control me, 10 = I use them.",
            "duration_seconds": 30
          },
          {
            "text": "Commitment — How consistent are your mental habits right now — visualization, reflection, intentional prep? 1 = nonexistent, 10 = locked in daily.",
            "duration_seconds": 30
          }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_03/lesson_03_seg_02.mp3"
        ],
        "total_audio_seconds": 26.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Those three numbers are your baseline." },
          { "start_s": 6.0, "text": "On Day 30, you''re going to answer those exact same questions again." },
          { "start_s": 15.0, "text": "Hit the journal. Write your scores down and add one sentence explaining each one." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Write your three baseline scores — M, A, C — and one sentence explaining each one."
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values
  ('d0000000-0000-0000-0000-000000000003', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000003', 'acceptance'),
  ('d0000000-0000-0000-0000-000000000003', 'commitment');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000003',
    updated_at = now()
where program_version = 'v1'
  and day_number = 3;

-- ============================================================
-- Day 4: Identity Statement  [M, C]
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'Identity Statement',
  251,
  'standard',
  3,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_04/lesson_04_seg_01.mp3"
        ],
        "total_audio_seconds": 83.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Day 4." },
          { "start_s": 3.0, "text": "You''ve got your baseline. You know where you''re starting." },
          { "start_s": 10.0, "text": "Who are you as a competitor?" },
          { "start_s": 18.0, "text": "Not what you want to achieve. Not what your stats say." },
          { "start_s": 25.0, "text": "Athletes who compete from a clear sense of who they are outperform athletes who compete from outcome." },
          { "start_s": 40.0, "text": "The difference between ''I want to win'' and ''I am the kind of athlete who doesn''t quit.''" },
          { "start_s": 55.0, "text": "Today you''re going to write your identity. Present tense. Specific. Behavioral." },
          { "start_s": 68.0, "text": "On your screen you''re going to see a few examples. Then write two or three of your own." }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 90,
        "ambient_audio": "ambient/ambient_music.mp3",
        "steps": [
          {
            "text": "I am an athlete who shows up the same — whether I''m winning or losing.",
            "duration_seconds": 15
          },
          {
            "text": "I am an athlete who competes through discomfort.",
            "duration_seconds": 15
          },
          {
            "text": "I am an athlete who focuses on the next play, not the last one.",
            "duration_seconds": 15
          },
          {
            "text": "Now write 2–3 of your own. Present tense. Be specific. Who are you when you step onto the field?",
            "duration_seconds": 45
          }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_04/lesson_04_seg_02.mp3"
        ],
        "total_audio_seconds": 18.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Read what you just wrote." },
          { "start_s": 4.0, "text": "That''s not a goal. That''s a decision." },
          { "start_s": 8.0, "text": "Every time you open this app from here on — that''s who''s showing up." },
          { "start_s": 14.0, "text": "Go hit the journal. One question." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Which identity statement felt most powerful? Which one felt hardest to believe?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values
  ('d0000000-0000-0000-0000-000000000004', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000004', 'commitment');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000004',
    updated_at = now()
where program_version = 'v1'
  and day_number = 4;

-- ============================================================
-- Day 5: Box Breathing — Level 1  [M, A]
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'Box Breathing — Level 1',
  234,
  'standard',
  4,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_05/lesson_05_seg_01.mp3"
        ],
        "total_audio_seconds": 78.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Day 5. First physical tool." },
          { "start_s": 5.0, "text": "It''s called box breathing. Four sides. Four seconds each." },
          { "start_s": 15.0, "text": "When you''re in a high-pressure moment, your body runs hot." },
          { "start_s": 25.0, "text": "Box breathing is a reset switch." },
          { "start_s": 35.0, "text": "When you control the breath, you directly activate the part of your nervous system that says calm down." },
          { "start_s": 50.0, "text": "On your screen you''re going to see a circle. Follow it." },
          { "start_s": 60.0, "text": "If your mind drifts — bring it back. That is not failure. That is the drill." }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 80,
        "ambient_audio": "ambient/ambient_music.mp3",
        "interactive_model": "box_breathing",
        "visual_cues": [
          "Follow the circle. In through your nose.",
          "Stay with the rhythm. Don''t rush.",
          "Nice and steady. Four seconds each.",
          "Let everything else go.",
          "Mind drifted? Good. Bring it back.",
          "You''re building a skill. Stay present.",
          "Last two reps. Stay locked in.",
          "Almost there. Finish strong."
        ],
        "steps": [
          { "text": "Inhale", "duration_seconds": 4, "haptic": "heavy" },
          { "text": "Hold", "duration_seconds": 4, "haptic": "light" },
          { "text": "Exhale", "duration_seconds": 4, "haptic": "heavy" },
          { "text": "Hold", "duration_seconds": 4, "haptic": "light" }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_05/lesson_05_seg_02.mp3"
        ],
        "total_audio_seconds": 16.0,
        "timed_text": [
          { "start_s": 0.0, "text": "That''s box breathing." },
          { "start_s": 4.0, "text": "Do that before your next practice. Before your next competition." },
          { "start_s": 10.0, "text": "The reps compound." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Where did your mind go during the breathing? What thought kept pulling you away from the breath?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values
  ('d0000000-0000-0000-0000-000000000005', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000005', 'acceptance');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000005',
    updated_at = now()
where program_version = 'v1'
  and day_number = 5;

-- ============================================================
-- Day 6: Body Scan — Level 1  [M, A]
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'Body Scan — Level 1',
  412,
  'standard',
  5,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_06/lesson_06_seg_01.mp3"
        ],
        "total_audio_seconds": 60.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Day 6." },
          { "start_s": 3.0, "text": "Anxiety shows up in your body before it shows up in your thoughts." },
          { "start_s": 12.0, "text": "Tight jaw. Raised shoulders. Clenched fists. Shallow breathing." },
          { "start_s": 22.0, "text": "Today we fix that." },
          { "start_s": 26.0, "text": "We''re going to scan your body from head to toe." },
          { "start_s": 34.0, "text": "This teaches you to read your own nervous system in real time." },
          { "start_s": 45.0, "text": "Before we start — take one box breath with me." }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 16,
        "interactive_model": "box_breathing",
        "visual_cues": [
          "One full breath. Settle in.",
          "Follow the circle."
        ],
        "steps": [
          { "text": "Inhale", "duration_seconds": 4, "haptic": "heavy" },
          { "text": "Hold", "duration_seconds": 4, "haptic": "light" },
          { "text": "Exhale", "duration_seconds": 4, "haptic": "heavy" },
          { "text": "Hold", "duration_seconds": 4, "haptic": "light" }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_06/lesson_06_seg_02.mp3"
        ],
        "total_audio_seconds": 250.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Good. Close your eyes." },
          { "start_s": 5.0, "text": "We''re moving from the top of your head down to your feet." },
          { "start_s": 15.0, "text": "Top of your head. Your forehead. Your eyes." },
          { "start_s": 30.0, "text": "Is there tension here? Breathe in — and release it on the exhale." },
          { "start_s": 55.0, "text": "Your jaw. Your neck. Your throat." },
          { "start_s": 70.0, "text": "Athletes carry a lot here. Breathe in — let it soften." },
          { "start_s": 95.0, "text": "Your shoulders. Your upper back." },
          { "start_s": 110.0, "text": "Are they raised right now? Drop them. One slow breath in — and release." },
          { "start_s": 130.0, "text": "Your chest. Your lungs." },
          { "start_s": 140.0, "text": "Let the breath go all the way down." },
          { "start_s": 155.0, "text": "Your arms. Your hands. Your fingers. Unclench." },
          { "start_s": 170.0, "text": "Your core. Your stomach. This is where nerves live." },
          { "start_s": 185.0, "text": "Breathe into it. Let it expand." },
          { "start_s": 200.0, "text": "Your hips. Your legs. Your feet. All the way to the floor." },
          { "start_s": 220.0, "text": "Now — whole body. One full breath in." },
          { "start_s": 235.0, "text": "Feel everything you just released. And exhale. Let it all go." }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_06/lesson_06_seg_03.mp3"
        ],
        "total_audio_seconds": 26.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Open your eyes." },
          { "start_s": 4.0, "text": "You just learned how to read your nervous system and reset it in under two minutes." },
          { "start_s": 14.0, "text": "Aware athletes don''t get blindsided by their own bodies." },
          { "start_s": 20.0, "text": "Go hit the journal." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "Where did your body hold the most tension? Does that same spot show up when you compete?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values
  ('d0000000-0000-0000-0000-000000000006', 'mindfulness'),
  ('d0000000-0000-0000-0000-000000000006', 'acceptance');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000006',
    updated_at = now()
where program_version = 'v1'
  and day_number = 6;

-- ============================================================
-- Day 7: Focus Anchor — Find Yours  [M]
-- ============================================================

insert into public.lessons (
  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,
  content_blocks
)
values (
  'd0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'Focus Anchor — Find Yours',
  261,
  'standard',
  6,
  true,
  '{
    "blocks": [
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_07/lesson_07_seg_01.mp3"
        ],
        "total_audio_seconds": 71.0,
        "timed_text": [
          { "start_s": 0.0, "text": "Day 7." },
          { "start_s": 3.0, "text": "You''ve done your first week. Breathing. Body scan. Awareness." },
          { "start_s": 12.0, "text": "Today we build the tool that ties all of it together." },
          { "start_s": 20.0, "text": "It''s called a focus anchor." },
          { "start_s": 25.0, "text": "A word, a short phrase, or a physical sensation that your mind comes back to when it starts to drift." },
          { "start_s": 38.0, "text": "It should be short — one or two words max. Process-focused, not outcome-focused." },
          { "start_s": 50.0, "text": "Examples: next play, breathe, process, here, trust." },
          { "start_s": 58.0, "text": "Before we start — take one box breath to settle in." }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 16,
        "interactive_model": "box_breathing",
        "visual_cues": [
          "One box breath. Settle in.",
          "Follow the circle."
        ],
        "steps": [
          { "text": "Inhale", "duration_seconds": 4, "haptic": "heavy" },
          { "text": "Hold", "duration_seconds": 4, "haptic": "light" },
          { "text": "Exhale", "duration_seconds": 4, "haptic": "heavy" },
          { "text": "Hold", "duration_seconds": 4, "haptic": "light" }
        ]
      },
      {
        "type": "timed_exercise",
        "duration_seconds": 89,
        "ambient_audio": "ambient/ambient_music.mp3",
        "steps": [
          {
            "text": "What is your focus anchor? One or two words. Choose something that brings you into the present moment.",
            "duration_seconds": 30
          },
          {
            "text": "Hold your anchor. When your mind drifts — and it will — bring it back. That''s the rep.",
            "duration_seconds": 59
          }
        ]
      },
      {
        "type": "voiceover",
        "audio_files": [
          "lesson_07/lesson_07_seg_02.mp3"
        ],
        "total_audio_seconds": 25.0,
        "timed_text": [
          { "start_s": 0.0, "text": "That word you just saved — that''s your reset tool." },
          { "start_s": 7.0, "text": "In competition, when things get loud in your head, that''s what you come back to." },
          { "start_s": 15.0, "text": "We''re going to use it throughout the rest of this program." },
          { "start_s": 20.0, "text": "Go hit the journal. Day 7 is complete. That''s your first week of Relentless." }
        ]
      },
      {
        "type": "journal_prompt",
        "prompt": "What anchor did you choose and why? When in competition do you think you''ll need it most?"
      }
    ]
  }'::jsonb
);

insert into public.lesson_categories (lesson_id, category)
values ('d0000000-0000-0000-0000-000000000007', 'mindfulness');

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000007',
    updated_at = now()
where program_version = 'v1'
  and day_number = 7;

commit;
