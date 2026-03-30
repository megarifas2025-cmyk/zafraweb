-- =============================================================================
-- UNICORNIO — RLS: lectura de requerimientos_compra para empresa y agrotienda
-- =============================================================================
-- Las demandas enrutadas por categoria_destino deben ser visibles a los perfiles
-- que pueden responder (productor, comprador, empresa B2B, agrotienda).
-- Ejecutar en Supabase SQL Editor después de delta-requerimientos-categoria-destino.sql
-- =============================================================================

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
