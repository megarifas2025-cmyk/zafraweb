-- ================================================================
-- EMPRESA – vistas registered_farms / active_harvests, flota propia,
-- lectura de cosechas búnker, RPC alta empleado por cédula
-- Ejecutar en Supabase SQL Editor (tras bunker + freight).
--
-- Para “un solo copiar-pegar”: usa SUPABASE-MODULO-EMPRESA-COMPLETO.sql
-- (mismo contenido pensado para Run único).
-- ================================================================

-- Vistas (RLS heredada de tablas base con seguridad invocador por defecto en PG14+)
CREATE OR REPLACE VIEW public.registered_farms AS
SELECT * FROM public.fincas;

CREATE OR REPLACE VIEW public.active_harvests AS
SELECT *
FROM public.cosechas
WHERE estado IS DISTINCT FROM 'cancelada' AND estado IS DISTINCT FROM 'vendida';

-- Empresa: ver cosechas de productores vinculados (cartera)
DROP POLICY IF EXISTS "cosecha_bunker_company_read" ON public.cosechas;
CREATE POLICY "cosecha_bunker_company_read" ON public.cosechas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.company_farmers cf ON cf.company_id = c.id AND cf.activo = TRUE
      WHERE c.perfil_id = auth.uid() AND cf.producer_id = cosechas.agricultor_id
    )
  );

-- Flota propia (placas / tipo)
CREATE TABLE IF NOT EXISTS public.company_fleet_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  placa       TEXT NOT NULL,
  tipo_camion TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, placa)
);
CREATE INDEX IF NOT EXISTS idx_company_fleet_company ON public.company_fleet_units(company_id);

ALTER TABLE public.company_fleet_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_fleet_super" ON public.company_fleet_units;
DROP POLICY IF EXISTS "company_fleet_rw" ON public.company_fleet_units;
CREATE POLICY "company_fleet_super" ON public.company_fleet_units FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "company_fleet_rw" ON public.company_fleet_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_fleet_units.company_id AND c.perfil_id = auth.uid()
    )
  );

-- Zona opcional al vincular perito
ALTER TABLE public.company_employees
  ADD COLUMN IF NOT EXISTS zona_asignada TEXT;

-- RPC: búsqueda por cédula sin filtrar toda la tabla perfiles desde el cliente
CREATE OR REPLACE FUNCTION public.company_find_collaborator_by_doc(p_doc text)
RETURNS TABLE (perfil_id uuid, nombre text, rol text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.perfil_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solo cuentas empresa pueden buscar colaboradores';
  END IF;
  RETURN QUERY
  SELECT p.id::uuid, p.nombre::text, p.rol::text
  FROM public.perfiles p
  WHERE p.doc_numero IS NOT NULL
    AND trim(p.doc_numero) = trim(p_doc)
    AND p.kyc_estado = 'verified'
    AND p.rol = 'perito'
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.company_find_collaborator_by_doc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_find_collaborator_by_doc(text) TO authenticated;

-- Empresa puede ver nombre de transportistas ligados a sus solicitudes (listado afiliados)
DROP POLICY IF EXISTS "perfil_transportista_por_solicitud_empresa" ON public.perfiles;
CREATE POLICY "perfil_transportista_por_solicitud_empresa" ON public.perfiles FOR SELECT
  USING (
    perfiles.rol = 'transporter'
    AND EXISTS (
      SELECT 1 FROM public.freight_requests fr
      WHERE fr.requester_id = auth.uid()
        AND (
          fr.assigned_transportista_id = perfiles.id
          OR EXISTS (
            SELECT 1 FROM public.freight_request_applications fa
            WHERE fa.freight_request_id = fr.id AND fa.transportista_id = perfiles.id
          )
        )
    )
  );

-- Confirmación: freight_requests INSERT ya incluye rol company en CHECK y política freight_req_insert_generadores.
-- logistics_salas / logistics_mensajes ya usan requester_id = auth.uid() (perfil empresa).
