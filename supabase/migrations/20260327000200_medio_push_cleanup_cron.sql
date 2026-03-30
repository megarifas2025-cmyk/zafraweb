-- =============================================================================
-- MEDIO – pg_cron: limpieza automática de buyer_push_outbox procesado
-- =============================================================================

-- Limpia registros procesados con más de 7 días (evita crecimiento ilimitado)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-push-outbox-cron') THEN
    PERFORM cron.unschedule('cleanup-push-outbox-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-push-outbox-cron',
  '0 3 * * *',   -- cada día a las 3 AM
  $$
    DELETE FROM public.buyer_push_outbox
    WHERE procesado = TRUE
      AND creado_en < NOW() - INTERVAL '7 days';
  $$
);
