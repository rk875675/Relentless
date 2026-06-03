-- ============================================================================
-- 20260602000000_coaches_coach_key_unique_nonpartial.sql
-- Fix for the Loader's coaches upsert (ON CONFLICT (coach_key)).
--
-- 20260530120000 created a PARTIAL unique index on coaches(coach_key)
-- (`where coach_key is not null`). Postgres cannot use a partial index for
-- ON CONFLICT inference, so PostgREST upserts keyed on coach_key fail with
-- HTTP 400. Replace it with a full (non-partial) unique index. Postgres still
-- allows multiple NULL coach_key values under a standard unique index, so this
-- is safe for any coach rows without a key.
-- ============================================================================

begin;

drop index if exists public.coaches_coach_key_key;

create unique index if not exists coaches_coach_key_key
  on public.coaches (coach_key);

commit;
