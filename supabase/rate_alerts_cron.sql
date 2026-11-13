-- appBank: schedule the rate-alert Edge Function. Run in Supabase > SQL Editor
-- AFTER deploying the function and setting its secrets.
--
-- 1) Enable the extensions (Database > Extensions): pg_cron and pg_net.
-- 2) Replace COLE_AQUI_O_CRON_SECRET with the same value given to
--    `supabase secrets set CRON_SECRET=...`. It is stored in Supabase Vault,
--    not in the job text. Do not commit the real value.

select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'rate_alert_cron_secret');

-- Every 30 min, Mon-Fri, 12:00-20:30 UTC = 9:00-17:30 in Brasília.
-- The function also checks market hours itself.
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
