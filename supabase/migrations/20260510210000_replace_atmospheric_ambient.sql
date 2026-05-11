-- Remove leberch-ambient-atmospheric-509533 from all library lessons.
-- Replaces the 3 lessons that used it with tracks that maintain section-spread rules.
--
--  m03  Milk Breath      → paulyudin-ambient-ambient-music-482398  (neutral, "return to zero")
--  a01  Worry Drop       → atlasaudio-ambient-cinematic-510518     (cinematic, dramatic release)
--  c02  Your Foundation  → grand_project-deep-meditation-192828    (deep, introspective)

begin;

-- ── M-03  Milk Breath  ────────────────────────────────────────────────────
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/paulyudin-ambient-ambient-music-482398.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/paulyudin-ambient-ambient-music-482398.mp3"'
)
where id = 'e1000000-0000-0000-0000-000000000005';

-- ── A-01  Worry Drop  ─────────────────────────────────────────────────────
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/atlasaudio-ambient-cinematic-510518.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/atlasaudio-ambient-cinematic-510518.mp3"'
)
where id = 'e2000000-0000-0000-0000-000000000001';

-- ── C-02  Your Foundation  ────────────────────────────────────────────────
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/grand_project-deep-meditation-192828.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/grand_project-deep-meditation-192828.mp3"'
)
where id = 'e3000000-0000-0000-0000-000000000003';

commit;
