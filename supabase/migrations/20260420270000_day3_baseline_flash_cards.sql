-- WOD Day 3: replace timed_exercise with flash_cards (same verbatim prompts; app collects 1–10 per card).

begin;

update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,1}',
      $fb${
        "type": "flash_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
          {
            "front": "Mindfulness — During competition, how often does your mind drift to outcomes, mistakes, or what people think — instead of staying on the task in front of you? 1 = constantly, 10 = never.",
            "back": "Mindfulness — During competition, how often does your mind drift to outcomes, mistakes, or what people think — instead of staying on the task in front of you? 1 = constantly, 10 = never."
          },
          {
            "front": "Acceptance — How much do nerves, fear, or self-doubt affect your performance — even when you know physically you're ready? 1 = they control me, 10 = I use them.",
            "back": "Acceptance — How much do nerves, fear, or self-doubt affect your performance — even when you know physically you're ready? 1 = they control me, 10 = I use them."
          },
          {
            "front": "Commitment — How consistent are your mental habits right now — visualization, reflection, intentional prep? 1 = nonexistent, 10 = locked in daily.",
            "back": "Commitment — How consistent are your mental habits right now — visualization, reflection, intentional prep? 1 = nonexistent, 10 = locked in daily."
          }
        ]
      }$fb$::jsonb
    ),
    updated_at = now()
where id = 'd0000000-0000-0000-0000-000000000003';

commit;
