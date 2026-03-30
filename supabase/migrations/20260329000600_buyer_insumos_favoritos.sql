-- ================================================================
-- Wishlist de insumos: compradores guardan productos favoritos
-- ================================================================

CREATE TABLE IF NOT EXISTS public.buyer_insumos_favoritos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  insumo_id  UUID NOT NULL REFERENCES public.agricultural_inputs(id) ON DELETE CASCADE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT buyer_insumos_favoritos_unique UNIQUE (buyer_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_buyer_insumos_fav_buyer
  ON public.buyer_insumos_favoritos (buyer_id, creado_en DESC);

ALTER TABLE public.buyer_insumos_favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumos_fav_own" ON public.buyer_insumos_favoritos;
CREATE POLICY "insumos_fav_own" ON public.buyer_insumos_favoritos FOR ALL
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "insumos_fav_ceo_all" ON public.buyer_insumos_favoritos;
CREATE POLICY "insumos_fav_ceo_all" ON public.buyer_insumos_favoritos FOR ALL
  USING (public.is_zafra_ceo());
