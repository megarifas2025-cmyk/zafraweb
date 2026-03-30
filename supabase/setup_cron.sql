SELECT cron.schedule(
  'process-buyer-push-outbox',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://bbqixckupisbjbjpzkdb.supabase.co/functions/v1/process-buyer-push-outbox',
    headers := '{"x-cron-secret": "8b52e23cf9ff75477d569958470abe4c03b0e97cdfe6791b4ed4bf4825457a62"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id$$
);
