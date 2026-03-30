-- =============================================================================
-- UNICORNIO — ACTUALIZACIÓN ÚNICA: módulo requerimientos_compra (demandas)
-- =============================================================================
-- Supabase → SQL Editor → pegar todo este archivo → Run (una vez por proyecto).
--
-- LISTA DE CAMBIOS (en orden de ejecución):
--
--   1. Columna categoria_destino (TEXT) en requerimientos_compra + índice parcial.
--      Sirve para enrutar la demanda: Insumos y Maquinaria / Cosecha a Granel /
--      Volumen Procesado / Silos.
--
--   2. Política RLS "req_compra_select_mercado" (SELECT): lectura para perfiles
--      verificados con rol independent_producer, buyer, company o agrotienda.
--      (Sustituye la política anterior que solo incluía productor + comprador.)
--
-- PRERREQUISITO: debe existir la tabla public.requerimientos_compra (p. ej. ya
-- aplicaste delta-nacional-comercial o el bundle base del proyecto).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS; DROP POLICY IF EXISTS + CREATE.
-- =============================================================================


-- ========== 1) Columna e índice categoria_destino ==========

ALTER TABLE public.requerimientos_compra
  ADD COLUMN IF NOT EXISTS categoria_destino TEXT;

COMMENT ON COLUMN public.requerimientos_compra.categoria_destino IS
  'Enrutamiento: Insumos y Maquinaria (agrotienda), Cosecha a Granel (productor), Volumen Procesado / Silos (empresa).';

CREATE INDEX IF NOT EXISTS idx_req_compra_categoria_destino
  ON public.requerimientos_compra(categoria_destino)
  WHERE categoria_destino IS NOT NULL;


-- ========== 2) RLS: SELECT mercado (empresa + agrotienda incluidos) ==========

DROP POLICY IF EXISTS "req_compra_select_mercado" ON public.requerimientos_compra;

CREATE POLICY "req_compra_select_mercado" ON public.requerimientos_compra FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND p.rol IN (
          'independent_producer'::rol_usuario,
          'buyer'::rol_usuario,
          'company'::rol_usuario,
          'agrotienda'::rol_usuario
        )
    )
  );

-- =============================================================================
-- Fin. Opcional: backfill manual de categoria_destino en filas antiguas, si aplica.
-- =============================================================================
