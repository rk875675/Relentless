-- ============================================================
-- Fix A/C library lesson content_blocks — match by title
-- since the actual UUIDs in the DB may differ from the
-- deterministic registry UUIDs.
-- ============================================================

begin;

-- A-01: Worry Drop
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "Your brain doesn''t know the difference between a real threat and a perceived one. It treats every worry the same — urgent, unresolved, consuming.",
        "The goal of this exercise isn''t to fix your worries. It''s to sort them.",
        "You''re going to write down everything on your mind right now. Every fear, every doubt, every what-if — as separate entries.",
        "Then you''re going to let go of anything you can''t control today. Not forever. Just for now.",
        "What''s left is your actual job. And you''re going to figure out exactly what to do about it.",
        "Start by getting it all out. Don''t filter. Don''t judge. Just write."
      ]
    },
    {
      "type": "bubble_sort",
      "ambient_audio": "ambient/ambient_music.mp3",
      "entry_instruction": "Write down everything on your mind. One worry at a time.",
      "entry_done_label": "I''m done",
      "discard_instruction": "Tap any bubble that is outside your control right now.",
      "can_restore": true,
      "action_prompt": "What is the one next step you can take on this?"
    }
  ]
}'::jsonb
where title = 'Worry Drop' and lesson_type = 'library';

-- A-02: Control Check
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "One of the fastest ways to lose your mental edge is spending energy on things you cannot change. Research consistently shows that perceived control is one of the strongest predictors of performance under pressure.",
        "This exercise forces you to get specific. Exactly what is and isn''t in your hands.",
        "You''re going to fill two columns. What I control. What I don''t.",
        "The uncontrollable side gets acknowledged, and then closed. You''re not ignoring it. You''re making a deliberate decision to stop spending energy there.",
        "The controllable side becomes your entire focus from this point forward.",
        "Be honest. Vague answers won''t help you."
      ]
    },
    {
      "type": "two_column_sort",
      "ambient_audio": "ambient/ambient_music.mp3",
      "columns": [
        { "id": "control", "label": "What I Control" },
        { "id": "no_control", "label": "What I Don''t" }
      ],
      "min_per_column": 1,
      "min_entry_seconds": 20,
      "intro_hold_seconds": 3,
      "close_column_id": "no_control",
      "action_prompt": "What is your next action on this?"
    }
  ]
}'::jsonb
where title = 'Control Check' and lesson_type = 'library';

-- A-03: Name It, Face It
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "Suppressing an emotion doesn''t make it weaker. It makes it louder.",
        "Psychologist Matthew Lieberman at UCLA found that simply labeling an emotion reduces activity in the amygdala — the brain''s threat center — almost immediately.",
        "Right now, you''re going to name exactly what you''re feeling. Not what you wish you were feeling.",
        "Then you''re going to find it in your body. Where does it live?",
        "Then you''re going to answer one question honestly.",
        "That''s the whole exercise. It''s short because it doesn''t need to be long."
      ]
    },
    {
      "type": "prompt_cards",
      "ambient_audio": "ambient/ambient_music.mp3",
      "cards": [
        {
          "intro_hold_seconds": 3,
          "prompt": "When you go into competition, what emotions do you feel? Get precise as to what, when, and where you feel these emotions.",
          "min_entry_seconds": 20
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "Where do they show up in your body? Do your legs feel detached as you walk out of the tunnel? Do you feel like you are watching through windows in your eyes rather than being in control?",
          "min_entry_seconds": 20
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "What can you do to overcome this, and still compete?",
          "min_entry_seconds": 20
        }
      ],
      "summary": {
        "display": "last",
        "header": "",
        "hold_seconds": 10
      }
    },
    {
      "type": "journal_prompt",
      "prompt": "After seeing your answer, does it still hold? What would it actually look like to do that in the moment?"
    }
  ]
}'::jsonb
where title = 'Name It, Face It' and lesson_type = 'library';

-- A-04: The Honest Line
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "Pretending you feel ready when you don''t costs more energy than just admitting it. Your brain knows the truth. Fighting it is the drain.",
        "Cognitive acceptance research shows that athletes who acknowledge their actual situation — rather than suppressing or reframing it — perform more consistently under pressure.",
        "Even the most positive athletes can crash and burn. When positivity has no direction, it becomes suppression. And suppressed fears eventually surface.",
        "This exercise isn''t about feeling better. It''s about being clear.",
        "You''re going to write exactly where you are right now. No spin. No positivity for the sake of it.",
        "Then you''re going to answer one question that matters more than any pep talk. Be honest. The only person reading this is you."
      ]
    },
    {
      "type": "prompt_cards",
      "ambient_audio": "ambient/ambient_music.mp3",
      "cards": [
        {
          "intro_hold_seconds": 3,
          "prompt": "What is actually true about your situation right now? What are you actually feeling toward it? Don''t filter your thoughts.",
          "min_entry_seconds": 30
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "How can you reframe your mindset to be prepared for what actually could happen?",
          "min_entry_seconds": 30
        }
      ],
      "summary": {
        "display": "last",
        "header": "",
        "hold_seconds": 10
      }
    },
    {
      "type": "journal_prompt",
      "prompt": "What does following through on that reframe actually look like in practice tomorrow?"
    }
  ]
}'::jsonb
where title = 'The Honest Line' and lesson_type = 'library';

-- A-05: The Coach''s Perspective
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "You are almost always harder on yourself than you would ever be on someone you care about.",
        "Psychologist Ethan Kross at the University of Michigan found that advising yourself from a third-person perspective — as if you were coaching someone else — dramatically reduces emotional intensity and improves decision-making under stress.",
        "Distance is the tool. You''re going to use it right now.",
        "Think about an athlete coming to you with everything you''re currently carrying — the doubt, the fear, the pressure.",
        "What would you actually tell them? Not what sounds good. What would genuinely help?",
        "Write like you mean it. That athlete needs you right now."
      ]
    },
    {
      "type": "prompt_cards",
      "ambient_audio": "ambient/ambient_music.mp3",
      "cards": [
        {
          "intro_hold_seconds": 3,
          "prompt": "Describe your current situation as if you were an athlete walking into your own office. What are you dealing with?",
          "min_entry_seconds": 30
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "What would you tell that athlete right now?",
          "min_entry_seconds": 20
        }
      ],
      "summary": {
        "display": "last",
        "header": "Now read that back — this is what you need to tell yourself.",
        "hold_seconds": 15
      }
    },
    {
      "type": "journal_prompt",
      "prompt": "Is there anything in that advice you''re not currently giving yourself? What''s stopping you?"
    }
  ]
}'::jsonb
where title = 'The Coach''s Perspective' and lesson_type = 'library';

-- A-06: Emotional Replay
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "You can''t regulate what you can''t see. Most athletes lose the mental battle not because they''re weak — but because they never learned to read what was happening inside them in real time.",
        "Research in emotional awareness training shows that athletes who can precisely identify and describe their emotional states have significantly better regulation under pressure.",
        "This exercise takes you back to a specific moment when an emotion worked against you.",
        "You''re not going back to fix it. You''re going back to map it — so next time, you recognize it early enough to do something about it.",
        "Think of one moment. A race, a practice, a workout where your head got in the way.",
        "Walk us through it. Be specific."
      ]
    },
    {
      "type": "prompt_cards",
      "ambient_audio": "ambient/ambient_music.mp3",
      "cards": [
        {
          "intro_hold_seconds": 3,
          "prompt": "What was the moment? Describe the situation specifically. Where were you? What was at stake?",
          "min_entry_seconds": 30
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "What did the emotion feel like physically? Where was it in your body?",
          "min_entry_seconds": 30
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "What thought came with it?",
          "min_entry_seconds": 20
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "What did you do next — and what do you wish you''d done instead?",
          "min_entry_seconds": 20
        }
      ],
      "summary": {
        "display": "all",
        "header": "This is what it looks like. Now you know.",
        "hold_seconds": 15
      }
    },
    {
      "type": "journal_prompt",
      "prompt": "If that moment happened again tomorrow, what would you do differently now that you can see it clearly?"
    }
  ]
}'::jsonb
where title = 'Emotional Replay' and lesson_type = 'library';

-- C-01: Future Self
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "The past does not equal the future. Just because something hasn''t worked yet doesn''t mean it won''t. You don''t make decisions based on who you were. You make them based on who you''re becoming.",
        "Most athletes set goals. The best athletes build an identity. There''s a difference between \"I want to run faster\" and knowing exactly who you are when you get there.",
        "You''re going to describe your future self in detail. Pick a time frame — 3 months, 6 months, a year. You choose how far out you want to look.",
        "One rule: describe what you want, not what you don''t want. Your brain thinks in images. Build the image you actually want.",
        "Be specific. Vague answers produce vague results. The more real this person feels, the more your decisions will start pointing toward them.",
        "Start building."
      ]
    },
    {
      "type": "prompt_cards",
      "ambient_audio": "ambient/ambient_music.mp3",
      "cards": [
        {
          "intro_hold_seconds": 3,
          "prompt": "What does your future self look like physically? How do they carry themselves? How do they show up?",
          "min_entry_seconds": 30
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "How do they train? What does their work ethic look like on the days they don''t feel like it?",
          "min_entry_seconds": 30
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "How do they talk to themselves? To others? How do they handle pressure?",
          "min_entry_seconds": 20
        },
        {
          "intro_hold_seconds": 3,
          "prompt": "What do they consistently do that you''re not doing yet?",
          "min_entry_seconds": 20
        }
      ],
      "summary": {
        "display": "all",
        "header": "This is who you''re becoming.",
        "hold_seconds": 15,
        "save_to_profile": true
      }
    },
    {
      "type": "journal_prompt",
      "prompt": "What''s the single biggest gap between where you are now and the person you just described? What''s one thing you can do today to start closing it?"
    }
  ]
}'::jsonb
where title = 'Future Self' and lesson_type = 'library';

-- C-02: Your Foundation
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "Every athlete hits a point where the grind stops feeling worth it. The times aren''t coming. The body isn''t cooperating. The motivation that used to come easy has gone quiet.",
        "This is the moment that separates the ones who make it from the ones who don''t. Not talent. Not training. The ability to return to why you started.",
        "You''re going to build a list of everything that fuels you. Why you love this. What keeps you coming back. What you''d miss if it were gone tomorrow.",
        "This isn''t a motivation exercise. It''s a foundation. Something you can return to on any day, in any season, when everything else stops making sense.",
        "There are no wrong answers. Write what''s actually true for you — not what sounds good.",
        "Build your list. Take your time."
      ]
    },
    {
      "type": "list_builder",
      "ambient_audio": "ambient/ambient_music.mp3",
      "prompts": [
        "Why do you love your sport?",
        "What do you love about it?",
        "What would you miss?",
        "Who got you into it?",
        "What are you willing to struggle for?"
      ],
      "min_entries": 5,
      "min_entry_seconds": 10,
      "summary_header": "This is your foundation.",
      "summary_hold_seconds": 15,
      "save_to_profile": true
    }
  ]
}'::jsonb
where title = 'Your Foundation' and lesson_type = 'library';

-- C-03: One Minute Ignition
update public.lessons set content_blocks = '{
  "blocks": [
    {
      "type": "tap_through_text",
      "ambient_audio": "ambient/ambient_music.mp3",
      "paragraphs": [
        "You''re not going to wait until you feel motivated. That''s not how this works.",
        "Research in behavioral psychology shows that action precedes motivation — not the other way around. You don''t feel ready and then start. You start, and then you feel ready.",
        "The hardest part is always the first minute. Not the workout. Not the session. The first minute.",
        "You''re going to pick one thing right now and do it for 60 seconds. That''s the whole job.",
        "It doesn''t matter if you finish it. It doesn''t matter if it''s big. What matters is that you start.",
        "Pick something. Hit go. The rest will follow."
      ]
    },
    {
      "type": "countdown_timer",
      "ambient_audio": "ambient/ambient_music.mp3",
      "duration_seconds": 60,
      "task_list": [
        "60 seconds of stretching",
        "A set of pushups",
        "A set of core work",
        "Drink a full glass of water",
        "Do your dishes",
        "Read one page of that book next to you",
        "Write down three things you need to do today",
        "Make your bed",
        "Text someone you''ve been meaning to reach out to",
        "Set your stuff out for your next practice"
      ],
      "completion_message": "You started. That''s the hardest part.",
      "completion_hold_seconds": 3
    },
    {
      "type": "journal_prompt",
      "prompt": "What did you start?"
    }
  ]
}'::jsonb
where title = 'One Minute Ignition' and lesson_type = 'library';

commit;
