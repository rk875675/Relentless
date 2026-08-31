-- ============================================================================
-- 20260831030000_coach_bio_restore_and_approve_videos.sql
--
-- 1. Restore curated short bios (bio field) after sync overwrote them.
--    Full credentials are now integrated per product direction.
--    long_bio = coaches' own words — unchanged by this migration.
--
-- 2. Set intro_video_path (uploaded by 04_sync_coach_profiles.py) and
--    approve both coaches' videos so the app serves them.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────
-- Short bios (curated by Relentless team — we write these)
-- ────────────────────────────────────────────────

update public.coaches set
  bio = 'M.S., CMPC. Former D1 QB turned Mental Performance Coach. Certified by Brian Cain & Ben Newman.'
where coach_key = 'grant-chiasson';

-- Full credential string: "BSc Psychology Science; MSc Cognitive & Clinical Neuroscience;
--   Specialisation in Agonistic Trance, Sport Coaching & NLP"
update public.coaches set
  bio = 'BSc Psychology Science | MSc Cognitive & Clinical Neuroscience | NLP & Sport Coaching Specialist. Neuroscience-based mental performance coach helping athletes close the gap between how they train and how they compete.'
where coach_key = 'iaia-colella';

-- Full credential string: "L2 Athletics Coach, Mindset Performance Coach"
update public.coaches set
  bio = 'L2 Athletics Coach & Mindset Performance Coach. Former junior middle-distance runner now competing at Masters level.'
where coach_key = 'james-goodall';

-- Full credential string: "M.S., CMPC"
update public.coaches set
  bio = 'M.S., CMPC. Certified Mental Performance Consultant and founder of Mack Mental Performance.'
where coach_key = 'brock-mccormack';

-- ────────────────────────────────────────────────
-- Approve intro videos (uploaded by 04_sync_coach_profiles.py)
-- ────────────────────────────────────────────────

update public.coaches set
  intro_video_path     = 'coach/iaia-colella_intro.mp4',
  intro_video_approved = true
where coach_key = 'iaia-colella';

update public.coaches set
  intro_video_path     = 'coach/james-goodall_intro.mov',
  intro_video_approved = true
where coach_key = 'james-goodall';

commit;
