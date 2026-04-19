-- Remove phase_labels from Day 5 box breathing block.
--
-- User feedback: keep phase label as simple INHALE / HOLD / EXHALE / HOLD,
-- not verbose coach text. Verbose labels cause layout shifts on-screen and
-- don't match the minimal format used by library box breathing sessions.
-- The phase_labels field is kept in the Zod schema for future use but will
-- not be used in current lesson data.

begin;

update public.lessons
set content_blocks = jsonb_set(
  content_blocks,
  '{blocks,1}',
  (content_blocks -> 'blocks' -> 1) - 'phase_labels'
)
where id = 'd0000000-0000-0000-0000-000000000005'
  and content_blocks -> 'blocks' -> 1 -> 'phase_labels' is not null;

commit;
