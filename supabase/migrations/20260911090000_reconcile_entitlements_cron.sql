-- Schedules a cron job every 6 hours to reconcile stale entitlement rows.
--
-- The primary sync path (Apple ASSN webhooks + client restore) is event-driven.
-- If a webhook is missed and the user never opens the app, their row can stay
-- `active` long after their subscription lapses. This cron queries Apple for
-- every source='apple' active/trial row whose expires_at is already past (or
-- null from a billing-retry state) and flips lapsed ones to `expired`.
--
-- HUMAN INPUT NEEDED ─────────────────────────────────────────────────────────
-- pg_cron executes plain SQL and has no access to Supabase secrets. The
-- x-cron-secret value must be inlined before pushing this migration.
--
-- Before running this migration:
--   1. Retrieve the value of TRIAL_REMINDER_CRON_SECRET (already set in your
--      Supabase project secrets from the trial-reminders cron setup).
--   2. Replace REPLACE_WITH_TRIAL_REMINDER_CRON_SECRET below with that value.
--   3. Push this migration:
--        npx supabase db push
--
-- DO NOT commit the filled-in secret to git. Leave the placeholder here.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_cron and pg_net are already enabled by the trial-reminder-emails migration.

select cron.schedule(
  'reconcile-entitlements',
  '0 */6 * * *',
  $$
    select net.http_post(
      url     := 'https://tnetahaviblrrjixzvbd.supabase.co/functions/v1/reconcile-entitlements',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', 'REPLACE_WITH_TRIAL_REMINDER_CRON_SECRET'
      ),
      body    := '{"dryRun": false}'::jsonb
    );
  $$
);
