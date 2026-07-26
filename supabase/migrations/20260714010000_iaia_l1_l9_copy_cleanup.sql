-- Iaia Colella — "THE 8 MENTAL DIMENSIONS OF PERFORMANCE" copy cleanup.
--
-- L1 (What Is Brain Training?): prompt_cards card 1 — drop the "Before you begin
--   this programme..." intro sentence so the first card shows only the question.
-- L9 (Visualisation): closing journal_prompt — change the ending "write to me"
--   to "write below" (targeted replace; rest of the copy is left untouched).
--
-- Both edits are surgical (single JSON path) and guarded so re-running is a no-op.

begin;

-- L1 card 1: keep only the question.
update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,1,cards,0,prompt}',
      '"What is the biggest mental challenge you face in your sport right now?"'::jsonb
    ),
    updated_at = now()
where id = 'ce11c707-0e2b-5c13-a745-34faede29482'
  and content_blocks #>> '{blocks,1,cards,0,prompt}' like 'Before you begin this programme%';

-- L9 closing journal_prompt: "write to me" -> "write below".
update public.lessons
set content_blocks = jsonb_set(
      content_blocks,
      '{blocks,2,prompt}',
      to_jsonb(replace(content_blocks #>> '{blocks,2,prompt}', 'write to me', 'write below'))
    ),
    updated_at = now()
where id = 'e3a85963-c64b-5621-999f-cd2763234cc3'
  and content_blocks #>> '{blocks,2,type}' = 'journal_prompt'
  and content_blocks #>> '{blocks,2,prompt}' like '%write to me%';

commit;
