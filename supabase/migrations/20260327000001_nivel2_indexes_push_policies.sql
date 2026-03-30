-- =============================================================================
-- NIVEL 2 – Índices de rendimiento y políticas push
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Índice en perfiles.expo_push_token (búsqueda por token para envío de push)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_perfiles_expo_push_token
  ON public.perfiles(expo_push_token)
  WHERE expo_push_token IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Índice en buyer_push_outbox para el cron job (procesar pendientes rápido)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_buyer_push_outbox_pending_created
  ON public.buyer_push_outbox(procesado, creado_en)
  WHERE procesado = FALSE;

-- -----------------------------------------------------------------------------
-- 3. Índice en logistics_salas para lookup por participantes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_logistics_salas_requester
  ON public.logistics_salas(requester_id);
CREATE INDEX IF NOT EXISTS idx_logistics_salas_transportista
  ON public.logistics_salas(transportista_id);

-- -----------------------------------------------------------------------------
-- 4. Índice en freight_requests por estado+requester para dashboard
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_freight_requests_requester_estado
  ON public.freight_requests(requester_id, estado);
CREATE INDEX IF NOT EXISTS idx_freight_requests_transportista_estado
  ON public.freight_requests(assigned_transportista_id, estado)
  WHERE assigned_transportista_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. buyer_push_outbox: agregar política INSERT para triggers SECURITY DEFINER
--    y CEO para administración manual
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "buyer_push_outbox_ceo_all" ON public.buyer_push_outbox;
CREATE POLICY "buyer_push_outbox_ceo_all" ON public.buyer_push_outbox FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());
