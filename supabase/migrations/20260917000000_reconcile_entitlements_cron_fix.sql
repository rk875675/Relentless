-- Fixes the reconcile-entitlements cron job.
--
-- The original migration (20260911090000) was pushed with its placeholder
-- x-cron-secret still in place, so the job has been calling the edge function
-- every 6 hours and getting a 401 back. Evidence: zero PostHog
-- `subscription_state_synced` events with notification_type='reconcile' since
-- the function was deployed, and a manual dry run on 2026-09-16 still found
-- candidates a working cron would have already refreshed.
--
-- This migration re-schedules the job, copying the real secret from the
-- working `trial-reminder-emails` cron job (same TRIAL_REMINDER_CRON_SECRET
-- the function checks). The secret is read inside the database at migration
-- time — it never appears in this file or in git.

do $$
declare
  existing_command text;
  cron_secret text;
begin
  select command into existing_command
  from cron.job
  where jobname = 'trial-reminder-emails'
  limit 1;

  if existing_command is null then
    raise exception 'trial-reminder-emails cron job not found; cannot copy x-cron-secret';
  end if;

  cron_secret := (regexp_match(existing_command, '''x-cron-secret'',\s*''([^'']+)'''))[1];

  if cron_secret is null or cron_secret like 'REPLACE_WITH%' then
    raise exception 'trial-reminder-emails cron job does not contain a usable x-cron-secret';
  end if;

  -- Replace the broken job (scheduled with the placeholder secret).
  if exists (select 1 from cron.job where jobname = 'reconcile-entitlements') then
    perform cron.unschedule('reconcile-entitlements');
  end if;

  perform cron.schedule(
    'reconcile-entitlements',
    '0 */6 * * *',
    format(
      $job$
        select net.http_post(
          url     := 'https://tnetahaviblrrjixzvbd.supabase.co/functions/v1/reconcile-entitlements',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'x-cron-secret', %L
          ),
          body    := '{"dryRun": false}'::jsonb
        );
      $job$,
      cron_secret
    )
  );

  if not exists (select 1 from cron.job where jobname = 'reconcile-entitlements') then
    raise exception 'reconcile-entitlements cron job was not created';
  end if;
end $$;
