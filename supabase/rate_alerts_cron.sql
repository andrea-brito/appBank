-- appBank: schedule the rate-alert Edge Function. Run in Supabase > SQL Editor
-- AFTER deploying the function and setting its secrets. Safe to run again.
--
-- Replace COLE_AQUI_O_CRON_SECRET with the same value as the function secret
-- CRON_SECRET. It is stored in Supabase Vault, not in the job text. Do not
-- commit the real value.

-- Extensions (same as turning them on in Database > Extensions).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Secret used by the job (replaced if it already exists).
delete from vault.secrets where name = 'rate_alert_cron_secret';
select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'rate_alert_cron_secret');

-- Every 30 min, Mon-Fri, 12:00-20:30 UTC = 9:00-17:30 in Brasília.
-- The function also checks market hours itself.
select cron.unschedule(jobid) from cron.job where jobname = 'rate-alert';
select cron.schedule(
  'rate-alert',
  '*/30 12-20 * * 1-5',
  $$
  select net.http_post(
    url := 'https://sfbhqmkueejfguivltil.supabase.co/functions/v1/rate-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rate_alert_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Check:   select * from cron.job;  select * from cron.job_run_details order by start_time desc limit 5;
-- Stop:    select cron.unschedule('rate-alert');
