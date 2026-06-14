-- Schedules an hourly cron job that calls the trial-reminders Edge Function.
--
-- HUMAN INPUT NEEDED ─────────────────────────────────────────────────────────
-- pg_cron executes plain SQL and has no access to Deno / Edge Function
-- environment secrets. The x-cron-secret value must be inlined into the SQL
-- at schedule time.
--
-- Before running this migration:
--   1. Generate a strong random secret, e.g.:
--        openssl rand -hex 32
--   2. Set it as a Supabase Edge Function secret named TRIAL_REMINDER_CRON_SECRET:
--        supabase secrets set TRIAL_REMINDER_CRON_SECRET=<your-value>
--   3. Replace the placeholder REPLACE_WITH_TRIAL_REMINDER_CRON_SECRET below
--      with that same value (in the live DB only).
--   4. Push this migration:
--        npx supabase db push
--
-- DO NOT commit the filled-in secret to git.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron and pg_net for scheduled HTTP calls to edge functions.
create extension if not exists pg_cron   with schema pg_catalog;
create extension if not exists pg_net    with schema extensions;

-- Grant usage so cron jobs can call pg_net from the postgres role.
grant usage on schema net to postgres;

-- Schedule trial-reminder emails every hour on the hour.
select cron.schedule(
  'trial-reminder-emails',
  '0 * * * *',
  $$
    select net.http_post(
      url    := 'https://tnetahaviblrrjixzvbd.supabase.co/functions/v1/trial-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', 'REPLACE_WITH_TRIAL_REMINDER_CRON_SECRET'
      ),
      body   := '{}'::jsonb
    );
  $$
);
