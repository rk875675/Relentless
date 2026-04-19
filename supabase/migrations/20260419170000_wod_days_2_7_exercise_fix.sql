-- Fix WOD Days 2–7 exercises to match
-- `content/CONTENT_DELIVERY_GUIDE.md` + the approved deliverable
-- (`Relentless_Days2to7_Final_Deliverable.md`).
--
-- Scope: exercise blocks only. Voiceover blocks (audio_files,
-- total_audio_seconds, timed_text) are preserved byte-for-byte from
-- 20260414000002_fix_days2to7_timings.sql. Journal prompts are unchanged.
--
-- UX rule (see .cursor/rules/relentless-guardrails.mdc): exercise content
-- steps are tap-to-advance. The deliverable's "submit locked for 30s",
-- "auto-advance after timer", and "minimum dwell" notes are intentionally
-- not implemented. Breathing rhythm timers (box_breathing) remain timed.
--
-- Adds three new block types (multi_select, examples_with_entry,
-- anchor_entry) and three optional box_breathing fields (rep_count,
-- phase_labels, mid_overlay) — mirrored in
-- supabase/functions/_shared/content_blocks.ts and mobile/app/lesson/[id].tsx.
--
-- Recomputed durations use the user-paced formula from
-- 20260419150000_user_paced_lesson_durations.sql, extended for new types:
--   prompt_cards            = cards.length * 25
--   multi_select            = 25
--   examples_with_entry     = 45
--   anchor_entry            = 45
--   timed_exercise (text)   = steps.length * 5
--   timed_exercise (other)  = duration_seconds (box_breathing rounds up to 16)
--   voiceover               = total_audio_seconds
--   journal_prompt          = 60

begin;

-- ============================================================
-- Day 2  (seg01=116s, seg02=24s)
-- Exercise rewrite: typed prompt card + multi-select distraction profile.
-- ============================================================
update public.lessons
set duration_seconds = 250,
    content_blocks = '{
  "blocks": [
    {
      "type": "voiceover",
      "audio_files": ["lesson_02/lesson_02_seg_01.mp3"],
      "total_audio_seconds": 116.0,
      "timed_text": [
        { "start_s": 0.0,   "text": "Day 2." },
        { "start_s": 3.0,   "text": "Today I want to show you the exact science." },
        { "start_s": 15.0,  "text": "Daniel Kahneman won the Nobel Prize in 2002." },
        { "start_s": 27.0,  "text": "The brain runs on two systems." },
        { "start_s": 31.0,  "text": "System 1 is fast. Automatic. Instinctive." },
        { "start_s": 55.0,  "text": "System 2 is slow. Deliberate. Analytical." },
        { "start_s": 75.0,  "text": "Choking is what happens when System 2 tries to take control of something System 1 already owns." },
        { "start_s": 88.0,  "text": "The fix isn''t to think less. It''s to train your mind to step back." },
        { "start_s": 103.0, "text": "Right now I want you to find your version of that moment." }
      ]
    },
    {
      "type": "prompt_cards",
      "ambient_audio": "ambient/ambient_music.mp3",
      "cards": [
        {
          "intro_hold_seconds": 0,
          "prompt": "Describe a moment in competition or training where your mind worked against you. Where were you? What was happening? What did your brain start doing instead of competing? Be detailed.",
          "min_entry_seconds": 0
        }
      ],
      "summary": {
        "display": "last",
        "header": "",
        "hold_seconds": 0
      }
    },
    {
      "type": "multi_select",
      "ambient_audio": "ambient/ambient_music.mp3",
      "prompt": "What was your brain doing? Tap all that apply.",
      "options": [
        "Thinking about the outcome",
        "Watching my competition",
        "Tracking time, score, or distance",
        "Replaying a mistake mid-performance",
        "Thinking about how my body feels",
        "Worrying about what others think",
        "Thinking about what comes next"
      ],
      "confirm_label": "Confirm",
      "min_select": 0
    },
    {
      "type": "voiceover",
      "audio_files": ["lesson_02/lesson_02_seg_02.mp3"],
      "total_audio_seconds": 24.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "What you just logged — that''s your distraction profile." },
        { "start_s": 7.0,  "text": "Every drill from here is training you to catch that pattern before it catches you." },
        { "start_s": 15.0, "text": "Go hit the journal. One question." },
        { "start_s": 20.0, "text": "After you finish — Day 2 is complete." }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "Looking at what you selected — which distraction shows up most consistently for you? Does it get worse at specific moments in competition?"
    }
  ]
}'::jsonb
where id = 'd0000000-0000-0000-0000-000000000002';

-- ============================================================
-- Day 3  (seg01=51s, seg02=26s)
-- Exercise unchanged (already verbatim per deliverable). Recompute duration:
-- text-step timed_exercise contributes steps.length * 5s under the
-- user-paced formula (3 * 5 = 15).
-- Save-to-profile for the three baseline scores is deferred — no
-- backend schema for athlete profile baselines exists. Tracked separately.
-- ============================================================
update public.lessons
set duration_seconds = 152,
    content_blocks = '{
  "blocks": [
    {
      "type": "voiceover",
      "audio_files": ["lesson_03/lesson_03_seg_01.mp3"],
      "total_audio_seconds": 51.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Day 3." },
        { "start_s": 2.0,  "text": "Before we go any further — we need a starting point." },
        { "start_s": 7.0,  "text": "Think of this like measuring your vertical before a training block." },
        { "start_s": 16.0, "text": "One for each pillar — Mindfulness, Acceptance, Commitment." },
        { "start_s": 25.0, "text": "Score yourself honestly from 1 to 10." },
        { "start_s": 32.0, "text": "1 means it''s a major problem. 10 means you''ve got it locked in." },
        { "start_s": 40.0, "text": "You''ll have 30 seconds per question. Read it, sit with it, and be honest." }
      ]
    },
    {
      "type": "timed_exercise",
      "duration_seconds": 90,
      "steps": [
        { "text": "Mindfulness — During competition, how often does your mind drift to outcomes, mistakes, or what people think — instead of staying on the task in front of you? 1 = constantly, 10 = never.", "duration_seconds": 30 },
        { "text": "Acceptance — How much do nerves, fear, or self-doubt affect your performance — even when you know physically you''re ready? 1 = they control me, 10 = I use them.", "duration_seconds": 30 },
        { "text": "Commitment — How consistent are your mental habits right now — visualization, reflection, intentional prep? 1 = nonexistent, 10 = locked in daily.", "duration_seconds": 30 }
      ]
    },
    {
      "type": "voiceover",
      "audio_files": ["lesson_03/lesson_03_seg_02.mp3"],
      "total_audio_seconds": 26.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Those three numbers are your baseline." },
        { "start_s": 5.0,  "text": "On Day 30, you''re going to answer those exact same questions again." },
        { "start_s": 14.0, "text": "Hit the journal. Write your scores down and add one sentence explaining each one." },
        { "start_s": 21.0, "text": "After you finish — Day 3 is complete." }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "Write your three baseline scores — M, A, C — and one sentence explaining each one."
    }
  ]
}'::jsonb
where id = 'd0000000-0000-0000-0000-000000000003';

-- ============================================================
-- Day 4  (seg01=83s, seg02=17s)
-- Exercise rewrite: examples list above a single text input ("Now write
-- 2–3 of your own. Present tense. Be specific.") with verbatim examples.
-- ============================================================
update public.lessons
set duration_seconds = 205,
    content_blocks = '{
  "blocks": [
    {
      "type": "voiceover",
      "audio_files": ["lesson_04/lesson_04_seg_01.mp3"],
      "total_audio_seconds": 83.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Day 4." },
        { "start_s": 3.0,  "text": "You''ve got your baseline. You know where you''re starting." },
        { "start_s": 10.0, "text": "Who are you as a competitor?" },
        { "start_s": 18.0, "text": "Not what you want to achieve. Not what your stats say." },
        { "start_s": 25.0, "text": "Athletes who compete from identity outperform athletes who compete from outcome." },
        { "start_s": 40.0, "text": "The difference between ''I want to win'' and ''I am the kind of athlete who doesn''t quit.''" },
        { "start_s": 55.0, "text": "Today you''re going to write your identity. Present tense. Specific. Behavioral." },
        { "start_s": 68.0, "text": "On your screen you''re going to see a few examples. Then write two or three of your own." }
      ]
    },
    {
      "type": "examples_with_entry",
      "ambient_audio": "ambient/ambient_music.mp3",
      "examples_header": "",
      "examples": [
        "I am an athlete who shows up the same — whether I''m winning or losing.",
        "I am an athlete who competes through discomfort.",
        "I am an athlete who focuses on the next play, not the last one."
      ],
      "input_prompt": "Now write 2–3 of your own. Present tense. Be specific.",
      "submit_label": "Save"
    },
    {
      "type": "voiceover",
      "audio_files": ["lesson_04/lesson_04_seg_02.mp3"],
      "total_audio_seconds": 17.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Read what you just wrote." },
        { "start_s": 3.0,  "text": "That''s not a goal. That''s a decision." },
        { "start_s": 7.0,  "text": "Every time you open this app from here on — that''s who''s showing up." },
        { "start_s": 12.0, "text": "Go hit the journal. One question." }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "Which identity statement felt most powerful? Which one felt hardest to believe?"
    }
  ]
}'::jsonb
where id = 'd0000000-0000-0000-0000-000000000004';

-- ============================================================
-- Day 5  (seg01=78s, seg02=16s)
-- Box-breathing exercise extended with verbatim deliverable spec:
--   - rep_count: 5  (5 full 4-4-4-4 cycles = 80s)
--   - phase_labels: verbatim per-phase coach text from deliverable Steps 1–4
--   - mid_overlay: after rep 3, "Mind drifted? Good. Bring it back." (5s)
-- ============================================================
update public.lessons
set duration_seconds = 234,
    content_blocks = '{
  "blocks": [
    {
      "type": "voiceover",
      "audio_files": ["lesson_05/lesson_05_seg_01.mp3"],
      "total_audio_seconds": 78.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Day 5. First physical tool." },
        { "start_s": 4.0,  "text": "It''s called box breathing. Four sides. Four seconds each." },
        { "start_s": 12.0, "text": "When you''re in a high-pressure moment, your body runs hot." },
        { "start_s": 22.0, "text": "Your brain shifts into threat mode. None of that is useful for execution." },
        { "start_s": 30.0, "text": "Box breathing is a reset switch." },
        { "start_s": 35.0, "text": "When you control the breath, you directly activate the part of your nervous system that says calm down." },
        { "start_s": 50.0, "text": "On your screen you''re going to see a circle. Follow it." },
        { "start_s": 65.0, "text": "If your mind drifts — bring it back. That is not failure. That is the drill." }
      ]
    },
    {
      "type": "timed_exercise",
      "duration_seconds": 80,
      "ambient_audio": "ambient/ambient_music.mp3",
      "interactive_model": "box_breathing",
      "rep_count": 5,
      "phase_labels": {
        "inhale": "Inhale through your nose. 4 seconds.",
        "hold_in": "Hold. 4 seconds.",
        "exhale": "Exhale through your mouth. 4 seconds.",
        "hold_out": "Hold. 4 seconds."
      },
      "mid_overlay": {
        "after_rep": 3,
        "text": "Mind drifted? Good. Bring it back.",
        "duration_seconds": 5
      },
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
      "audio_files": ["lesson_05/lesson_05_seg_02.mp3"],
      "total_audio_seconds": 16.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "That''s box breathing." },
        { "start_s": 3.0,  "text": "Do that before your next practice. Before your next competition." },
        { "start_s": 9.0,  "text": "The reps compound." },
        { "start_s": 12.0, "text": "Go hit the journal." }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "Where did your mind go during the breathing? What thought kept pulling you away from the breath?"
    }
  ]
}'::jsonb
where id = 'd0000000-0000-0000-0000-000000000005';

-- ============================================================
-- Day 6  (seg01=60s, seg02=249s, seg03=25s)
-- Box-breathing intro left as-is (single-cycle, silence only — already
-- matches deliverable Step 1). The deliverable provides one combined
-- step text rather than per-phase labels, so phase_labels is NOT added
-- here (avoids paraphrasing per the verbatim guardrail).
-- Recomputed total: 60 + 16 + 249 + 25 + 60 = 410.
-- ============================================================
update public.lessons
set duration_seconds = 410,
    content_blocks = '{
  "blocks": [
    {
      "type": "voiceover",
      "audio_files": ["lesson_06/lesson_06_seg_01.mp3"],
      "total_audio_seconds": 60.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Day 6." },
        { "start_s": 2.0,  "text": "Anxiety shows up in your body before it shows up in your thoughts." },
        { "start_s": 8.0,  "text": "Tight jaw. Raised shoulders. Clenched fists. Shallow breathing." },
        { "start_s": 18.0, "text": "You''ve felt all of it before a big competition." },
        { "start_s": 24.0, "text": "Today we fix that." },
        { "start_s": 28.0, "text": "We''re going to scan your body from head to toe." },
        { "start_s": 36.0, "text": "This teaches you to read your own nervous system in real time." },
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
      "audio_files": ["lesson_06/lesson_06_seg_02.mp3"],
      "total_audio_seconds": 249.0,
      "timed_text": [
        { "start_s": 0.0,   "text": "Good. Close your eyes." },
        { "start_s": 8.0,   "text": "We''re moving from the top of your head down to your feet." },
        { "start_s": 25.0,  "text": "Top of your head. Your forehead. Your eyes." },
        { "start_s": 45.0,  "text": "Is there tension here? Breathe in — and release it on the exhale." },
        { "start_s": 65.0,  "text": "Your jaw. Your neck. Your throat." },
        { "start_s": 85.0,  "text": "Athletes carry a lot here. Breathe in — let it soften." },
        { "start_s": 105.0, "text": "Your shoulders. Your upper back." },
        { "start_s": 120.0, "text": "Are they raised right now? Drop them. One slow breath in — and release." },
        { "start_s": 140.0, "text": "Your chest. Your lungs. Let the breath go all the way down." },
        { "start_s": 155.0, "text": "Your arms. Your hands. Your fingers. Unclench." },
        { "start_s": 170.0, "text": "Your core. Your stomach. This is where nerves live." },
        { "start_s": 190.0, "text": "Breathe into it. Let it expand." },
        { "start_s": 205.0, "text": "Your hips. Your legs. Your feet. All the way to the floor." },
        { "start_s": 225.0, "text": "Now — whole body. One full breath in." },
        { "start_s": 240.0, "text": "Feel everything you just released. And exhale. Let it all go." }
      ]
    },
    {
      "type": "voiceover",
      "audio_files": ["lesson_06/lesson_06_seg_03.mp3"],
      "total_audio_seconds": 25.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Open your eyes." },
        { "start_s": 3.0,  "text": "You just learned how to read your nervous system and reset it in under two minutes." },
        { "start_s": 10.0, "text": "Aware athletes don''t get blindsided by their own bodies." },
        { "start_s": 17.0, "text": "Go hit the journal." }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "Where did your body hold the most tension? Does that same spot show up when you compete?"
    }
  ]
}'::jsonb
where id = 'd0000000-0000-0000-0000-000000000006';

-- ============================================================
-- Day 7  (seg01=71s, seg02=24s)
-- Phase 1 (16s box breath) preserved. Phases 2 + 3 of the deliverable
-- (typed anchor entry + large-display hold) are now a single anchor_entry
-- block with verbatim entry/hold prompts.
-- ============================================================
update public.lessons
set duration_seconds = 216,
    content_blocks = '{
  "blocks": [
    {
      "type": "voiceover",
      "audio_files": ["lesson_07/lesson_07_seg_01.mp3"],
      "total_audio_seconds": 71.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "Day 7." },
        { "start_s": 2.0,  "text": "You''ve done your first week. Breathing. Body scan. Awareness." },
        { "start_s": 8.0,  "text": "Today we build the tool that ties all of it together." },
        { "start_s": 14.0, "text": "It''s called a focus anchor." },
        { "start_s": 18.0, "text": "A word, a short phrase, or a physical sensation that your mind comes back to when it starts to drift." },
        { "start_s": 30.0, "text": "Today you choose yours on purpose." },
        { "start_s": 35.0, "text": "It should be short — one or two words max. Process-focused, not outcome-focused." },
        { "start_s": 48.0, "text": "Examples: next play, breathe, process, here, trust." },
        { "start_s": 55.0, "text": "Before we start — take one box breath to settle in." }
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
      "type": "anchor_entry",
      "ambient_audio": "ambient/ambient_music.mp3",
      "entry_prompt": "What is your focus anchor? One or two words. Choose something that brings you into the present moment.",
      "save_label": "Save",
      "hold_prompt": "Hold your anchor. When your mind drifts — and it will — bring it back. That''s the rep.",
      "continue_label": "Continue"
    },
    {
      "type": "voiceover",
      "audio_files": ["lesson_07/lesson_07_seg_02.mp3"],
      "total_audio_seconds": 24.0,
      "timed_text": [
        { "start_s": 0.0,  "text": "That word you just saved — that''s your reset tool." },
        { "start_s": 5.0,  "text": "In competition, when things get loud in your head, that''s what you come back to." },
        { "start_s": 12.0, "text": "We''re going to use it throughout the rest of this program." },
        { "start_s": 17.0, "text": "Go hit the journal. That''s your first week of Relentless." }
      ]
    },
    {
      "type": "journal_prompt",
      "prompt": "What anchor did you choose and why? When in competition do you think you''ll need it most?"
    }
  ]
}'::jsonb
where id = 'd0000000-0000-0000-0000-000000000007';

commit;
