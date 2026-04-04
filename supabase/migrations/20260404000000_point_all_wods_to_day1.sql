-- Point all program days (2-30) to the Day 1 real lesson until individual
-- day content is delivered. This ensures every WOD uses the block-based
-- lesson player with full voiceover + exercise + journal flow.
--
-- Day 1 lesson: d0000000-0000-0000-0000-000000000001 ("What MAC Training Actually Is")
-- Previous: days 2-30 pointed to placeholder 5s flat lessons (c0000000-...).

update public.program_schedule
set lesson_id = 'd0000000-0000-0000-0000-000000000001',
    updated_at = now()
where program_version = 'v1'
  and day_number > 1;
