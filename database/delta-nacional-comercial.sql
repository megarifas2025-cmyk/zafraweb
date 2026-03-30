-- =============================================================================
-- UNICORNIO — Delta: visibilidad nacional + flujo comercial
-- =============================================================================
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS). No elimina tablas ni datos.
--
-- Incluye:
--   • cosechas: columna ubicacion_estado (estado sigue siendo cosecha_estado;
--     en el repo ya existen borrador/publicada/vendida junto con negociando/cancelada)
--   • requerimientos_compra (demanda del comprador)
--   • lotes_financiados (vínculo empresa → productor/finca para monitoreo)
--   • RLS agricultural_inputs: SELECT nacional para independent_producer y buyer
--
-- Supabase → SQL Editor → Run (una vez).
-- =============================================================================

-- ---- cosechas: filtro por estado (texto) a nivel país ----
ALTER TABLE public.cosechas ADD COLUMN IF NOT EXISTS ubicacion_estado TEXT;

UPDATE public.cosechas
SET ubicacion_estado = NULLIF(trim(estado_ve), '')
WHERE ubicacion_estado IS NULL
  AND estado_ve IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cosechas_ubicacion_estado
  ON public.cosechas(ubicacion_estado)
  WHERE ubicacion_estado IS NOT NULL;

COMMENT ON COLUMN public.cosechas.ubicacion_estado IS
  'Estado Venezuela (texto) para filtros nacionales; puede alinearse con estado_ve.';

-- ---- requerimientos_compra ----
CREATE TABLE IF NOT EXISTS public.requerimientos_compra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id      UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  rubro             TEXT NOT NULL,
  cantidad          NUMERIC(14,2) NOT NULL CHECK (cantidad > 0),
  precio_estimado   NUMERIC(14,2),
  ubicacion_estado  TEXT NOT NULL,
  fecha_limite      DATE NOT NULL,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_compra_comprador ON public.requerimientos_compra(comprador_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_req_compra_ubicacion ON public.requerimientos_compra(ubicacion_estado, fecha_limite);

ALTER TABLE public.requerimientos_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "req_compra_zafra_ceo" ON public.requerimientos_compra;
DROP POLICY IF EXISTS "req_compra_buyer_own" ON public.requerimientos_compra;
DROP POLICY IF EXISTS "req_compra_select_mercado" ON public.requerimientos_compra;

CREATE POLICY "req_compra_zafra_ceo" ON public.requerimientos_compra FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "req_compra_buyer_own" ON public.requerimientos_compra FOR ALL
  USING (
    comprador_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'buyer'::rol_usuario)
  )
  WITH CHECK (
    comprador_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'buyer'::rol_usuario)
  );

CREATE POLICY "req_compra_select_mercado" ON public.requerimientos_compra FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND p.rol IN ('independent_producer'::rol_usuario, 'buyer'::rol_usuario)
    )
  );

-- ---- lotes_financiados (solo empresa vinculada al company_id) ----
CREATE TABLE IF NOT EXISTS public.lotes_financiados (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  productor_id  UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  finca_id      UUID NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, productor_id, finca_id)
);

CREATE INDEX IF NOT EXISTS idx_lotes_fin_company ON public.lotes_financiados(company_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_lotes_fin_productor ON public.lotes_financiados(productor_id);

ALTER TABLE public.lotes_financiados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lotes_fin_zafra_ceo" ON public.lotes_financiados;
DROP POLICY IF EXISTS "lotes_fin_company_rw" ON public.lotes_financiados;
DROP POLICY IF EXISTS "lotes_fin_productor_select" ON public.lotes_financiados;

CREATE POLICY "lotes_fin_zafra_ceo" ON public.lotes_financiados FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "lotes_fin_company_rw" ON public.lotes_financiados FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.perfil_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.perfil_id = auth.uid()
    )
  );

CREATE POLICY "lotes_fin_productor_select" ON public.lotes_financiados FOR SELECT
  USING (productor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fn_lotes_financiados_validar_finca()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fincas f
    WHERE f.id = NEW.finca_id AND f.propietario_id = NEW.productor_id
  ) THEN
    RAISE EXCEPTION 'lotes_financiados: finca_id debe pertenecer a productor_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotes_financiados_validar_finca ON public.lotes_financiados;
CREATE TRIGGER trg_lotes_financiados_validar_finca
  BEFORE INSERT OR UPDATE OF finca_id, productor_id ON public.lotes_financiados
  FOR EACH ROW EXECUTE FUNCTION public.fn_lotes_financiados_validar_finca();

-- ---- agricultural_inputs: lectura nacional productor + comprador ----
DROP POLICY IF EXISTS "agri_inputs_select_nacional_producer_buyer" ON public.agricultural_inputs;

CREATE POLICY "agri_inputs_select_nacional_producer_buyer" ON public.agricultural_inputs FOR SELECT
  USING (
    disponibilidad = TRUE
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND p.rol IN ('independent_producer'::rol_usuario, 'buyer'::rol_usuario)
    )
  );
