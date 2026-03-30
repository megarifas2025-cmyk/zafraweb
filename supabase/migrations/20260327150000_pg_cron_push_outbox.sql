-- =============================================================================
-- Cron en Postgres: invoca la Edge Function process-buyer-push-outbox cada 2 min
-- para vaciar buyer_push_outbox (push fuera de la app).
--
-- Requiere (ejecutar antes con scripts/supabase-push-outbox-full-setup.cjs o SQL):
--   SELECT vault.create_secret('TU_MISMO_SECRETO_QUE_EDGE', 'buyer_push_outbox_secret');
-- El header Authorization debe coincidir con el secret BUYER_PUSH_OUTBOX_SECRET de la función.
--
-- URL del proyecto: si cambias de proyecto Supabase, ajusta el host o vuelve a correr el script.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-buyer-push-outbox-cron') THEN
    PERFORM cron.unschedule('process-buyer-push-outbox-cron');
  END IF;
END
$$;

SELECT cron.schedule(
  'process-buyer-push-outbox-cron',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bbqixckupisbjbjpzkdb.supabase.co/functions/v1/process-buyer-push-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || coalesce(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'buyer_push_outbox_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
