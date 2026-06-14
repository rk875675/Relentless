-- ============================================================================
-- 20260611000000_coaches_coachform_id.sql
-- Additive only — nothing the shipped app reads is changed or removed.
--
-- coaches.coachform_id: the stable coach id from the Coach Form (portal)
-- project. Packs derive coach_key from the coach's display name, so a portal
-- rename used to fork the coach into a second row. Keying the link on the
-- portal's immutable id lets the loader converge onto the existing row after
-- a rename, and lets scripts/04_sync_coach_profiles.py push portal profile
-- edits to the app without a pack reload.
--
-- NULL = coach not managed by the portal (e.g. Grant, demo seeds).
-- ============================================================================

begin;

alter table public.coaches add column if not exists coachform_id uuid;

create unique index if not exists coaches_coachform_id_key
  on public.coaches (coachform_id)
  where coachform_id is not null;

commit;
