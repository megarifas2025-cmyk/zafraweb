-- =============================================================================
-- FASE 3 — Lecturas cruzadas en public.perfiles (sin 42P17)
-- =============================================================================
-- Idempotente: DROP IF EXISTS antes de cada CREATE.
-- Estrategia elegida: OPCIÓN A (JWT + políticas RLS SELECT adicionales).
-- - auth.jwt() -> 'user_metadata' ->> 'rol' evita SELECT a perfiles para saber el rol.
-- - EXISTS / joins solo sobre tablas vecinas (cosechas, salas_chat, freight_requests,
--   companies, field_inspections, transporter_company_links) — nunca subconsulta
--   FROM perfiles dentro de una política sobre perfiles.
-- Opción B (RPC SECURITY DEFINER): reservada para vistas agregadas o reglas muy
-- complejas; duplicaría lógica si ya cubrimos con políticas.
-- Opción C (VIEW): en PG la vista hereda RLS de la tabla base; no sustituye políticas
--    bien diseñadas salvo patrones avanzados (security_barrier / invoker).
--
-- Convive con las políticas "nuclear" (solo fila propia en I/U/D) añadiendo SELECT
-- permisivos adicionales (OR entre políticas permisivas).
-- =============================================================================

DROP POLICY IF EXISTS "perfiles_select_jwt_zafra_ceo" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_jwt_freight_context" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_chat_counterpart" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_bunker_company" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_transporter_company_link" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_field_inspection_counterpart" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_transportista_freight_request" ON public.perfiles;

-- Zafra CEO: leer todos los perfiles (metadata JWT, sin tocar tabla perfiles)
CREATE POLICY "perfiles_select_jwt_zafra_ceo" ON public.perfiles FOR SELECT
  USING (COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'zafra_ceo');

-- Mercado ciego: ver datos de agricultor con cosecha publicada (viewer: roles de mercado)
CREATE POLICY "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cosechas c
      WHERE c.agricultor_id = perfiles.id
        AND c.estado = 'publicada'
    )
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') IN (
      'independent_producer',
      'buyer',
      'company',
      'agrotienda'
    )
  );

-- Fletes: nombre del solicitante o transportista asignado / postulado
CREATE POLICY "perfiles_select_jwt_freight_context" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.estado IN ('abierta', 'con_postulaciones')
        AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'transporter'
    )
    OR EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.assigned_transportista_id = auth.uid()
    )
  );

-- Chat: contraparte en salas donde participo
CREATE POLICY "perfiles_select_chat_counterpart" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.salas_chat sc
      WHERE (sc.comprador_id = auth.uid() OR sc.agricultor_id = auth.uid())
        AND (sc.comprador_id = perfiles.id OR sc.agricultor_id = perfiles.id)
    )
  );

-- Empresa: empleados y agricultores vinculados (solo companies + ce/cf, sin leer perfiles)
CREATE POLICY "perfiles_select_bunker_company" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.perfil_id = auth.uid()
        AND (
          EXISTS (
            SELECT 1
            FROM public.company_employees ce
            WHERE ce.company_id = c.id
              AND ce.perfil_id = perfiles.id
              AND ce.activo = TRUE
          )
          OR EXISTS (
            SELECT 1
            FROM public.company_farmers cf
            WHERE cf.company_id = c.id
              AND cf.producer_id = perfiles.id
              AND cf.activo = TRUE
          )
        )
    )
  );

-- Enlace empresa–transportista
CREATE POLICY "perfiles_select_transporter_company_link" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.transporter_company_links tcl
      JOIN public.companies co ON co.id = tcl.company_id
      WHERE tcl.transporter_id = perfiles.id
        AND co.perfil_id = auth.uid()
    )
  );

-- Inspecciones de campo: perito, productor o empresa de la inspección
CREATE POLICY "perfiles_select_field_inspection_counterpart" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.field_inspections fi
      WHERE (
        (fi.perito_id = auth.uid() AND perfiles.id = fi.productor_id)
        OR (fi.productor_id = auth.uid() AND perfiles.id = fi.perito_id)
        OR (
          (perfiles.id = fi.perito_id OR perfiles.id = fi.productor_id)
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = fi.empresa_id
              AND c.perfil_id = auth.uid()
          )
        )
      )
    )
  );

-- Transportista: solicitudes donde soy requester y el perfil es el transportista asignado
CREATE POLICY "perfiles_select_transportista_freight_request" ON public.perfiles FOR SELECT
  USING (
    perfiles.rol = 'transporter'
    AND EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = auth.uid()
        AND (
          fr.assigned_transportista_id = perfiles.id
          OR EXISTS (
            SELECT 1
            FROM public.freight_request_applications fa
            WHERE fa.freight_request_id = fr.id
              AND fa.transportista_id = perfiles.id
          )
        )
    )
  );
