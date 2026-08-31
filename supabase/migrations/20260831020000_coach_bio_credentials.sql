-- ============================================================================
-- 20260831020000_coach_bio_credentials.sql
-- Integrate coach credentials into the short bio (bio field), removing them
-- from the separate name-line display. long_bio (coaches' own words) unchanged.
--
-- bio      = "Credentials. Curated 1–2 line intro." (we write this)
-- long_bio = unchanged — what the coach wrote themselves
-- ============================================================================

begin;

-- Grant Chiasson (M.S., CMPC)
update public.coaches set
  bio = 'M.S., CMPC. Former D1 QB turned Mental Performance Coach. Certified by Brian Cain & Ben Newman.'
where coach_key = 'grant-chiasson';

-- Iaia Colella (MSc Cognitive & Clinical Neuroscience — the most relevant credential)
update public.coaches set
  bio = 'MSc Cognitive & Clinical Neuroscience. Neuroscience-based mental performance coach helping athletes close the gap between how they train and how they compete.'
where coach_key = 'iaia-colella';

-- James Goodall (L2 Athletics Coach, Mindset Performance Coach)
update public.coaches set
  bio = 'L2 Athletics Coach & Mindset Performance Coach. Former junior middle-distance runner now competing at Masters level.'
where coach_key = 'james-goodall';

-- Brock McCormack (M.S., CMPC)
update public.coaches set
  bio = 'M.S., CMPC. Certified Mental Performance Consultant and founder of Mack Mental Performance.'
where coach_key = 'brock-mccormack';

commit;
