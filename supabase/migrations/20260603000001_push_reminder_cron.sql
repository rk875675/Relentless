-- Migration: push_reminder_cron
--
-- Schedules an hourly cron job that calls the push-reminders Edge Function.
--
-- HUMAN INPUT NEEDED ─────────────────────────────────────────────────────────
-- pg_cron executes plain SQL and has no access to Deno / Edge Function
-- environment secrets. The x-cron-secret value must be inlined into the SQL
-- at schedule time.
--
-- Before running this migration:
--   1. Generate a strong random secret, e.g.:
--        openssl rand -hex 32
--   2. Set it as a Supabase Edge Function secret named PUSH_REMINDER_CRON_SECRET:
--        supabase secrets set PUSH_REMINDER_CRON_SECRET=<your-value>
--   3. Replace the placeholder REPLACE_WITH_PUSH_REMINDER_CRON_SECRET below
--      with that same value.
--   4. Push this migration:
--        npx supabase db push
--
-- DO NOT commit the filled-in secret to git.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron   with schema pg_catalog;
create extension if not exists pg_net    with schema extensions;

grant usage on schema net to postgres;

select cron.schedule(
  'push-reminder-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url     := 'https://tnetahaviblrrjixzvbd.supabase.co/functions/v1/push-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', 'REPLACE_WITH_PUSH_REMINDER_CRON_SECRET'
      ),
      body    := '{}'::jsonb
    );
  $$
);
