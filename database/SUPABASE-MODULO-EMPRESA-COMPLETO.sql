-- =============================================================================
-- UNICORNIO AGRO — MÓDULO EMPRESA (UN SOLO RUN EN SUPABASE SQL EDITOR)
-- =============================================================================
-- Dónde: Supabase → SQL → New query → pegar TODO → Run
--
-- ANTES tienes que tener ya creadas (si no, fallará este script):
--   • public.fincas, public.cosechas, public.companies, public.company_farmers,
--     public.company_employees, public.perfiles, public.freight_requests,
--     public.freight_request_applications
--   Recomendado en tu repo: migrate-bunker-module.sql + migrate-freight-requests-board.sql
--   (y el schema base / otros migrates que ya uses).
--
-- QUÉ HACE ESTE ARCHIVO:
--   • Vistas registered_farms y active_harvests (la app de empresa las consulta)
--   • Política RLS para que la empresa vea cosechas de su cartera (productores vinculados)
--   • Tabla company_fleet_units + RLS (flota propia)
--   • Columna zona_asignada en company_employees (opcional en formulario)
--   • Función RPC company_find_collaborator_by_doc (búsqueda por cédula / doc_numero)
--   • Política para que la empresa vea datos de transportistas ligados a sus fletes
--
-- Tras RUN: si algo no aparece en la API, en Supabase a veces ayuda recargar el esquema
-- (Project Settings → API) o esperar unos segundos.
-- =============================================================================

-- Vistas (RLS de fincas / cosechas sigue aplicándose sobre las filas base)
CREATE OR REPLACE VIEW public.registered_farms AS
SELECT * FROM public.fincas;

CREATE OR REPLACE VIEW public.active_harvests AS
SELECT *
FROM public.cosechas
WHERE estado IS DISTINCT FROM 'cancelada' AND estado IS DISTINCT FROM 'vendida';

-- Cartera: empresa lee cosechas de agricultores en company_farmers
DROP POLICY IF EXISTS "cosecha_bunker_company_read" ON public.cosechas;
CREATE POLICY "cosecha_bunker_company_read" ON public.cosechas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.company_farmers cf ON cf.company_id = c.id AND cf.activo = TRUE
      WHERE c.perfil_id = auth.uid() AND cf.producer_id = cosechas.agricultor_id
    )
  );

-- Flota propia
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

-- Zona al vincular perito (el formulario puede enviar zona_asignada; si no migraste, igual no rompe)
ALTER TABLE public.company_employees
  ADD COLUMN IF NOT EXISTS zona_asignada TEXT;

-- RPC: buscar perito verificado por doc_numero (solo si auth es empresa)
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

-- Listado de transportistas afiliados (nombres) para pantalla empresa
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

-- =============================================================================
-- Comprobación manual (opcional): descomenta y Run en otra pestaña
-- =============================================================================
-- SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('registered_farms','active_harvests');
-- SELECT proname FROM pg_proc WHERE proname = 'company_find_collaborator_by_doc';
