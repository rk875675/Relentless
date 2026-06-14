-- ============================================================================
-- 20260610010000_seed_demo_program_recommendation.sql
-- DEMO-ONLY seed for the Home "More programs you might like" section.
--
-- production_ready = false -> the /programs endpoint never returns this row to
-- real users; only is_dev accounts see it. It is purely visual (no lessons,
-- and recommendation rows are not tappable), so nothing in production changes.
-- Delete these two rows once real coach packs are loaded.
-- ============================================================================

begin;

insert into public.coaches (id, coach_key, name, sport)
values (
  'a0000000-0000-0000-0000-0000000000d2',
  'demo-amy-smith',
  'Amy Smith',
  'T&F'
)
on conflict (id) do nothing;

insert into public.programs
  (id, coach_id, program_key, title, sport, level, published, production_ready)
values (
  'b0000000-0000-0000-0000-0000000000d2',
  'a0000000-0000-0000-0000-0000000000d2',
  'demo-elite-runner',
  'Becoming an elite runner',
  'T&F',
  'All',
  true,   -- servable (so dev accounts can see the rail)
  false   -- NEVER visible to real users
)
on conflict (id) do nothing;

commit;
