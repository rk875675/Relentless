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
        'x-cron-secret', 'ddeb9638e40e8f4f0053565102b0f7bdf5a5410481ebc0c4d9f9eb05c43600f3'
      ),
      body   := '{}'::jsonb
    );
  $$
);
