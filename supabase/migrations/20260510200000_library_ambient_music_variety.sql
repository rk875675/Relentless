-- Assign varied ambient tracks to all 14 library lessons.
-- All tracks that repeat are placed in different MAC sections (M → A → C).
-- Uses jsonb_set to surgically update only the ambient_audio path on
-- blocks[0] (tap_through_text) and blocks[1] (exercise block) per lesson.

begin;

-- ── M-01  Box Breathing  ──────────────────────────────────────────────────
-- Track: leberch-meditative-ambient-509385 (meditative, focused, present)
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/leberch-meditative-ambient-509385.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/leberch-meditative-ambient-509385.mp3"'
)
where id = 'e1000000-0000-0000-0000-000000000001';

-- ── M-02  Coffee Breath  ──────────────────────────────────────────────────
-- Track: grand_project-deep-meditation-192828 (deep, introspective, slow)
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
where id = 'e1000000-0000-0000-0000-000000000003';

-- ── M-03  Milk Breath  ────────────────────────────────────────────────────
-- Track: leberch-ambient-atmospheric-509533 (spacious, open, reflective)
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/leberch-ambient-atmospheric-509533.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/leberch-ambient-atmospheric-509533.mp3"'
)
where id = 'e1000000-0000-0000-0000-000000000005';

-- ── M-04  Whiskey Breath  ─────────────────────────────────────────────────
-- Track: ambient_music (default — kept as-is)

-- ── M-05  Body Scan  ──────────────────────────────────────────────────────
-- Track: paulyudin-ambient-ambient-music-482398 (versatile, neutral)
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
where id = 'e1000000-0000-0000-0000-000000000009';

-- ── A-01  Worry Drop  ─────────────────────────────────────────────────────
-- Track: leberch-ambient-atmospheric-509533 (atmospheric — things drifting away)
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/leberch-ambient-atmospheric-509533.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/leberch-ambient-atmospheric-509533.mp3"'
)
where id = 'e2000000-0000-0000-0000-000000000001';

-- ── A-02  Control Check  ──────────────────────────────────────────────────
-- Track: grand_project-deep-meditation-192828 (deep, introspective reflection)
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
where id = 'e2000000-0000-0000-0000-000000000003';

-- ── A-03  Name It, Face It  ───────────────────────────────────────────────
-- Track: ambient_music (default — kept as-is)

-- ── A-04  The Honest Line  ────────────────────────────────────────────────
-- Track: leberch-meditative-ambient-509385 (meditative focus for honest reflection)
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/leberch-meditative-ambient-509385.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/leberch-meditative-ambient-509385.mp3"'
)
where id = 'e2000000-0000-0000-0000-000000000007';

-- ── A-05  The Coach's Perspective  ───────────────────────────────────────
-- Track: atlasaudio-ambient-cinematic-510518 (cinematic — narrative perspective shift)
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
where id = 'e2000000-0000-0000-0000-000000000009';

-- ── A-06  Emotional Replay  ───────────────────────────────────────────────
-- Track: paulyudin-ambient-ambient-music-482398 (neutral, unobtrusive for memory work)
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
where id = 'e2000000-0000-0000-0000-000000000011';

-- ── C-01  Future Self  ────────────────────────────────────────────────────
-- Track: atlasaudio-ambient-cinematic-510518 (cinematic — visionary, forward-looking)
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
where id = 'e3000000-0000-0000-0000-000000000001';

-- ── C-02  Your Foundation  ────────────────────────────────────────────────
-- Track: leberch-ambient-atmospheric-509533 (atmospheric — grounded, expansive)
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/leberch-ambient-atmospheric-509533.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/leberch-ambient-atmospheric-509533.mp3"'
)
where id = 'e3000000-0000-0000-0000-000000000003';

-- ── C-03  One Minute Ignition  ────────────────────────────────────────────
-- Track: leberch-meditative-ambient-509385 (meditative — focused intention before action)
update public.lessons
set content_blocks = jsonb_set(
  jsonb_set(
    content_blocks,
    '{blocks,0,ambient_audio}',
    '"ambient/leberch-meditative-ambient-509385.mp3"'
  ),
  '{blocks,1,ambient_audio}',
  '"ambient/leberch-meditative-ambient-509385.mp3"'
)
where id = 'e3000000-0000-0000-0000-000000000005';

commit;
