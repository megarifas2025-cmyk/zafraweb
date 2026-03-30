-- =============================================================================
-- GENERADO — NO EDITAR A MANO
-- Origen: database/delta-nacional-comercial.sql, database/delta-arrival-events.sql, database/delta-freight-requester-nombre-rls.sql, database/delta-agricultural-inputs-precio.sql
-- Regenerar: npm run supabase:gen-deltas-bundle
-- =============================================================================


-- ========== database/delta-nacional-comercial.sql ==========

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

-- ========== database/delta-arrival-events.sql ==========

-- =============================================================================
-- Opcional: cola “Llegué” sincronizada (Radar GPS) — arrival_events
-- =============================================================================
-- Ejecutar si quieres persistir llegadas en Supabase además de AsyncStorage local.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.arrival_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  lugar_label text,
  rol text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arrival_events_perfil ON public.arrival_events(perfil_id, creado_en DESC);

ALTER TABLE public.arrival_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arrival_events_insert_own" ON public.arrival_events;
CREATE POLICY "arrival_events_insert_own" ON public.arrival_events FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);

DROP POLICY IF EXISTS "arrival_events_select_own" ON public.arrival_events;
CREATE POLICY "arrival_events_select_own" ON public.arrival_events FOR SELECT
  USING (auth.uid() = perfil_id);

-- ========== database/delta-freight-requester-nombre-rls.sql ==========

-- =============================================================================
-- Delta: nombre del solicitante en pizarra (embed perfiles(nombre) en freight_requests)
-- =============================================================================
-- Problema: el SELECT en cliente hace .select('*, perfiles(nombre)'). RLS en
-- public.perfiles solo permitía leer filas propias o todas las verified (según
-- política base); los solicitantes con KYC pendiente no exponían nombre al join.
--
-- Solución: permitir SELECT al perfil del requester cuando un transportista
-- verificado puede ver la solicitud en pizarra, o cuando eres el transportista
-- asignado (coordinación).
--
-- Idempotente. Supabase → SQL Editor → Run (una vez).
-- No requiere recursión en políticas de perfiles: la comprobación de rol usa
-- función SECURITY DEFINER (mismo patrón que is_zafra_ceo).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_verified_transporter()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'transporter'::rol_usuario
      AND p.kyc_estado = 'verified'
  );
$$;

COMMENT ON FUNCTION public.is_verified_transporter() IS
  'Evita recursión RLS: transportista verificado para políticas que referencian perfiles.';

REVOKE ALL ON FUNCTION public.is_verified_transporter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_transporter() TO authenticated;

DROP POLICY IF EXISTS "perfil_select_freight_requester_nombre" ON public.perfiles;

CREATE POLICY "perfil_select_freight_requester_nombre" ON public.perfiles FOR SELECT
  USING (
    -- Pizarra: solicitud abierta y el lector es transportista verificado
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.estado IN ('abierta', 'con_postulaciones')
        AND public.is_verified_transporter()
    )
    OR
    -- Coordinación: asignado a este flete
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.assigned_transportista_id = auth.uid()
    )
  );

-- ========== database/delta-agricultural-inputs-precio.sql ==========

-- Precio de referencia opcional en catálogo agrotienda (acordar / USD según negocio).
ALTER TABLE public.agricultural_inputs ADD COLUMN IF NOT EXISTS precio NUMERIC(14,2);

COMMENT ON COLUMN public.agricultural_inputs.precio IS 'Referencia opcional; no sustituye acuerdo fuera de la app.';

-- ========== database/delta-freight-fleet-unit-link.sql ==========
-- Flete ↔ flota propia (fleet_unit_id + triggers). Copia idéntica del archivo homónimo.

ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS fleet_unit_id UUID REFERENCES public.company_fleet_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_freight_requests_fleet_unit
  ON public.freight_requests(fleet_unit_id)
  WHERE fleet_unit_id IS NOT NULL;

COMMENT ON COLUMN public.freight_requests.fleet_unit_id IS 'Unidad de company_fleet_units asignada (flota interna empresa).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'freight_request_estado'
      AND e.enumlabel = 'completada'
  ) THEN
    ALTER TYPE freight_request_estado ADD VALUE 'completada';
  END IF;
END $$;

ALTER TABLE public.company_fleet_units
  ADD COLUMN IF NOT EXISTS estado_logistico TEXT NOT NULL DEFAULT 'disponible';

CREATE OR REPLACE FUNCTION public.fn_freight_sync_fleet_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new TEXT;
BEGIN
  v_new := COALESCE(NEW.estado::text, '');

  IF TG_OP = 'UPDATE' AND OLD.fleet_unit_id IS NOT NULL THEN
    IF OLD.fleet_unit_id IS DISTINCT FROM NEW.fleet_unit_id OR v_new IN ('completada', 'cancelada') THEN
      UPDATE public.company_fleet_units
      SET estado_logistico = 'disponible'
      WHERE id = OLD.fleet_unit_id;
    END IF;
  END IF;

  IF NEW.fleet_unit_id IS NOT NULL THEN
    IF v_new IN ('completada', 'cancelada') THEN
      UPDATE public.company_fleet_units
      SET estado_logistico = 'disponible'
      WHERE id = NEW.fleet_unit_id;
    ELSE
      UPDATE public.company_fleet_units
      SET estado_logistico = 'en_ruta'
      WHERE id = NEW.fleet_unit_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_freight_sync_fleet_unit ON public.freight_requests;
CREATE TRIGGER tr_freight_sync_fleet_unit
  AFTER INSERT OR UPDATE OF estado, fleet_unit_id ON public.freight_requests
  FOR EACH ROW
  EXECUTE PROCEDURE public.fn_freight_sync_fleet_unit();

CREATE OR REPLACE FUNCTION public.fn_freight_sync_fleet_unit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.fleet_unit_id IS NOT NULL THEN
    UPDATE public.company_fleet_units
    SET estado_logistico = 'disponible'
    WHERE id = OLD.fleet_unit_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_freight_sync_fleet_unit_delete ON public.freight_requests;
CREATE TRIGGER tr_freight_sync_fleet_unit_delete
  AFTER DELETE ON public.freight_requests
  FOR EACH ROW
  EXECUTE PROCEDURE public.fn_freight_sync_fleet_unit_delete();

COMMENT ON FUNCTION public.fn_freight_sync_fleet_unit() IS
  'Pone en_ruta la unidad al crear/activar un flete con fleet_unit_id; disponible al completar/cancelar o borrar.';

-- ========== database/delta-perfiles-disponibilidad-flete.sql ==========

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS disponibilidad_flete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.perfiles.disponibilidad_flete IS 'Transportista: visible como disponible para nuevas cargas (UI toggle).';
