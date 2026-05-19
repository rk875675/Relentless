-- Fix two decay bugs:
-- 1. rkumar875675@gmail.com has last_decay_applied_local_date = '2099-01-01'
--    from the App Store screenshot boost, which permanently freezes decay.
-- 2. Any user_progress rows with scores > 0 but last_decay_applied_local_date = null
--    (created by initialize_mac_scores before it set the column) never decay.
-- Both are fixed by setting last_decay_applied_local_date to today.

begin;

-- Unfreeze the test user (2099 → today)
update public.user_progress
set last_decay_applied_local_date = CURRENT_DATE
where last_decay_applied_local_date > CURRENT_DATE;

-- Backfill any null rows that have non-zero scores (so decay starts tomorrow)
update public.user_progress
set last_decay_applied_local_date = CURRENT_DATE
where last_decay_applied_local_date is null
  and (mindfulness_score > 0 or acceptance_score > 0 or commitment_score > 0);

commit;
