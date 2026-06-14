-- ============================================================================
-- 20260610000000_lesson_description_coach_display.sql
-- Additive only — nothing the shipped app reads is changed or removed.
--
-- 1. lessons.description — optional per-lesson blurb shown on the lesson
--    start screen ("Box breathing is used by ..."). NULL = the app hides the
--    description block, so existing lessons render exactly as before until
--    coach-approved copy is loaded.
-- 2. Grant's coach row — display fields the new "About your coach" card and
--    WOD card read via the lessons API:
--      name:         'Coach Grant' -> 'Grant Chiasson' (matches approved UI)
--      external_url: backfilled with the existing referral URL already
--                    hardcoded in the app (mobile/lib/grant-attribution.ts),
--                    so the "Book a call" CTA has a destination.
--    bio is NOT touched here — current value is placeholder copy and needs
--    coach-approved text before the next app release.
-- ============================================================================

begin;

alter table public.lessons add column if not exists description text;

update public.coaches
   set name         = 'Grant Chiasson',
       external_url = coalesce(external_url, 'https://grantchiasson.com/home')
 where id = 'a0000000-0000-0000-0000-000000000001';

commit;
