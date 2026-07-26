-- Iaia Colella — "THE 8 MENTAL DIMENSIONS OF PERFORMANCE", Lesson 1
-- ("What Is Brain Training?").
--
-- Replace the single multi-question journal_prompt with three prompt_cards
-- (question face -> typed answer -> next), matching the "Flash Cards + Text
-- Entry" pattern used elsewhere. Question copy is transcribed verbatim from the
-- original journal_prompt; the coach's intro sentence is kept on card 1 and the
-- closing reassurance is preserved in summary.header, so no authored copy is
-- lost. prompt_cards answers still save to the journal on completion (the
-- player pushes each card's prompt+answer into the same journal body as the old
-- journal_prompt), so journaling behavior is unchanged.
--
-- Surgical swap of block index 1 only: the voiceover at index 0 is untouched.
-- Guarded on the current block type so re-running is a no-op once converted.

begin;

update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,1}',
      '{
        "type": "prompt_cards",
        "cards": [
          {
            "intro_hold_seconds": 0,
            "min_entry_seconds": 0,
            "prompt": "Before you begin this programme, take a moment to reflect on where you are right now.\n\nWhat is the biggest mental challenge you face in your sport right now?"
          },
          {
            "intro_hold_seconds": 0,
            "min_entry_seconds": 0,
            "prompt": "What would you like to feel differently before or during competition?"
          },
          {
            "intro_hold_seconds": 0,
            "min_entry_seconds": 0,
            "prompt": "What does your best performance look like, and how often does it actually happen?"
          }
        ],
        "summary": {
          "display": "all",
          "header": "There are no right or wrong answers. This is your starting point \u2014 come back to it when you finish the programme.",
          "hold_seconds": 0
        }
      }'::jsonb
    ),
    updated_at = now()
where id = 'ce11c707-0e2b-5c13-a745-34faede29482'
  and content_blocks #>> '{blocks,1,type}' = 'journal_prompt';

commit;
