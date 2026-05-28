-- PRE-MIGRATION for 20260527000000_user_lesson_completions_unique_day.sql.
-- Removes duplicate (user_id, lesson_id, completion_local_date) rows from
-- public.user_lesson_completions so the upcoming unique index can be created.
--
-- Safe-by-design:
--   * No live row is deleted unless an exact copy of it has just been written
--     to public.user_lesson_completions_dedupe_archive (so the operation is
--     fully reversible — see "Reversal" note at the bottom of this file).
--   * For each duplicate group, the OLDEST row by (completed_at ASC, id ASC)
--     is KEPT in the live table. All other rows in the group are archived
--     then deleted from the live table.
--   * Acquires EXCLUSIVE on the live table for the duration of the txn so no
--     new duplicate row can land between the dedupe scan and the live DELETE.
--     EXCLUSIVE permits concurrent SELECTs; INSERTs from /lessons/complete
--     wait until commit (a few ms on a small table).
--   * Idempotent: re-running is a no-op once duplicates are gone (the archive
--     INSERT uses ON CONFLICT (id) DO NOTHING; the live DELETE only touches
--     rows already present in the archive).
--
-- Tunable: the choice "keep oldest" is the historically conservative one —
-- it preserves the very first completion row a user ever recorded for that
-- (lesson, date) tuple, which is what every downstream feature (streak,
-- program_day advance, MAC daily-count, "last_wod_completion_local_date")
-- has been observing as the canonical row. Switching to "keep newest" would
-- change which `id` is the source-of-truth row and is NOT recommended.

begin;

-- ---------------------------------------------------------------------------
-- 1. Archive table.
-- Columns mirror the live table. user_id FK uses ON DELETE CASCADE so that
-- DELETE /account still removes every user-scoped row (matches the contract
-- documented in supabase/functions/account/index.ts). RLS enabled with no
-- policies = service-role only, matching the live table.
-- ---------------------------------------------------------------------------
create table if not exists public.user_lesson_completions_dedupe_archive (
  id                    uuid        not null primary key,
  user_id               uuid        not null
    references public.profiles (id) on delete cascade,
  lesson_id             uuid        not null
    references public.lessons (id),
  completed_at          timestamptz not null,
  completion_local_date date        not null,
  archived_at           timestamptz not null default now(),
  archive_reason        text        not null default
    'pre-unique-index dedupe; kept oldest (completed_at, id) per (user_id, lesson_id, completion_local_date)'
);

alter table public.user_lesson_completions_dedupe_archive
  enable row level security;

comment on table public.user_lesson_completions_dedupe_archive is
  'Forensic copy of duplicate user_lesson_completions rows removed before the (user_id, lesson_id, completion_local_date) unique index was enforced. See migration 20260526230000.';

-- ---------------------------------------------------------------------------
-- 2. Block concurrent writes to the live table so no new duplicate can
--    appear between the scan and the DELETE.
-- ---------------------------------------------------------------------------
lock table public.user_lesson_completions in exclusive mode;

-- ---------------------------------------------------------------------------
-- 3. Archive every "extra" row (oldest stays in live, the rest get archived).
--    on conflict (id) do nothing makes re-runs idempotent and protects against
--    a row already being present in the archive from a prior partial run.
-- ---------------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by user_id, lesson_id, completion_local_date
           order by completed_at asc, id asc
         ) as rn
  from public.user_lesson_completions
)
insert into public.user_lesson_completions_dedupe_archive
  (id, user_id, lesson_id, completed_at, completion_local_date)
select ulc.id, ulc.user_id, ulc.lesson_id, ulc.completed_at, ulc.completion_local_date
from public.user_lesson_completions ulc
join ranked r on r.id = ulc.id
where r.rn > 1
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Delete only rows that are now safely present in the archive.
--    This guarantees we never delete a row we did not archive.
-- ---------------------------------------------------------------------------
delete from public.user_lesson_completions ulc
where ulc.id in (
  select id from public.user_lesson_completions_dedupe_archive
);

-- ---------------------------------------------------------------------------
-- 5. Assertion: no duplicate groups remain. If anything else slipped through
--    (e.g. a new row inserted under the EXCLUSIVE lock by a superuser session
--    that bypasses the lock — not possible in our setup, but belt-and-braces)
--    the migration aborts and the txn rolls back.
-- ---------------------------------------------------------------------------
do $$
declare v_remaining int;
begin
  select count(*) into v_remaining
  from (
    select 1
    from public.user_lesson_completions
    group by user_id, lesson_id, completion_local_date
    having count(*) > 1
  ) g;

  if v_remaining > 0 then
    raise exception
      'dedupe pre-migration: % duplicate group(s) still present after archive+delete; aborting (transaction will roll back).',
      v_remaining;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Report what we did.
-- ---------------------------------------------------------------------------
do $$
declare
  v_archived_total bigint;
  v_archived_now   bigint;
  v_groups         bigint;
begin
  select count(*) into v_archived_total
  from public.user_lesson_completions_dedupe_archive;

  select count(*) into v_archived_now
  from public.user_lesson_completions_dedupe_archive
  where archived_at >= now() - interval '1 minute';

  select count(*) into v_groups
  from (
    select 1
    from public.user_lesson_completions_dedupe_archive
    group by user_id, lesson_id, completion_local_date
  ) g;

  raise notice 'dedupe pre-migration done: archive holds % row(s) covering % group(s); this run added % row(s); live table is now duplicate-free.',
    v_archived_total, v_groups, v_archived_now;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Reversal (ONLY if the unique-index migration has NOT yet been applied, or
-- has been dropped; with the unique index in place a restore will conflict
-- on (user_id, lesson_id, completion_local_date) and fail):
--
--   begin;
--   insert into public.user_lesson_completions
--     (id, user_id, lesson_id, completed_at, completion_local_date)
--   select id, user_id, lesson_id, completed_at, completion_local_date
--   from public.user_lesson_completions_dedupe_archive
--   on conflict (id) do nothing;
--   -- optional, once restoration is confirmed:
--   --   drop table public.user_lesson_completions_dedupe_archive;
--   commit;
-- ---------------------------------------------------------------------------
