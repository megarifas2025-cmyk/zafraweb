-- =============================================================================
-- UNICORNIO — Delta: enrutamiento comercial de requerimientos_compra
-- =============================================================================
-- Añade categoría de destino para dirigir la demanda a Agrotienda, Productor o Empresa.
-- Supabase → SQL Editor → Run (una vez). Idempotente.
-- =============================================================================

ALTER TABLE public.requerimientos_compra
  ADD COLUMN IF NOT EXISTS categoria_destino TEXT;

COMMENT ON COLUMN public.requerimientos_compra.categoria_destino IS
  'Enrutamiento: Insumos y Maquinaria (agrotienda), Cosecha a Granel (productor), Volumen Procesado / Silos (empresa).';

CREATE INDEX IF NOT EXISTS idx_req_compra_categoria_destino
  ON public.requerimientos_compra(categoria_destino)
  WHERE categoria_destino IS NOT NULL;
