-- ============================================================================
-- 20260831010000_populate_coach_profiles.sql
-- Populate bio (curated 1–2 liner) and long_bio (coach's own words) for all
-- non-Grant coaches so their lesson-ready cards look the same as Grant's.
--
-- bio      = concise intro WE write; shown directly on the card
-- long_bio = coaches' own description; revealed via "About me" toggle
--
-- Sources:
--   Iaia / James: portal bio text moved to long_bio; new curated bio written
--   Brock: same pattern (coachform_id not set so not portal-synced)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Iaia Colella
-- ---------------------------------------------------------------------------
update public.coaches set
  bio      = 'Neuroscience-based mental performance coach. Helping athletes close the gap between how they train and how they compete.',
  long_bio = 'I work with athletes to close the gap between how they train and how they compete. That gap is always mental — and it''s trainable.

My approach is neuroscience-based: no motivation speeches, no generic mindset advice. Just science-backed tools that rewire how your brain responds under pressure.

I''ve coached 50+ athletes across track & field, golf, swimming, and more, with measurable results in confidence, focus, and competition performance.'
where coach_key = 'iaia-colella';

-- ---------------------------------------------------------------------------
-- James Goodall
-- ---------------------------------------------------------------------------
update public.coaches set
  bio      = 'Former junior middle-distance runner turned Running & Mental Performance Coach.',
  long_bio = 'Former Junior Middle Distance Runner and current Masters runner competing from 800 m to marathons.

I''m a Level 2 Athletics Coach and Mindset Performance Coach. I combine the experience of a lifelong runner with evidence-based mental performance tools — helping athletes at every level build the mindset to compete at their best when it matters most.'
where coach_key = 'james-goodall';

-- ---------------------------------------------------------------------------
-- Brock McCormack
-- ---------------------------------------------------------------------------
update public.coaches set
  bio      = 'Certified Mental Performance Consultant (CMPC) and founder of Mack Mental Performance.',
  long_bio = 'Certified Mental Performance Consultant and founder of Mack Mental Performance.

A former collegiate baseball player with a master''s degree in Sport Psychology, Brock helps athletes build confidence, focus, and resilience under pressure.

Whether you''re battling nerves before a big event or trying to stay locked in through adversity, the mental game is trainable — and Brock''s here to show you how.'
where coach_key = 'brock-mccormack';

commit;
