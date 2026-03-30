-- =============================================================================
-- EMERGENCIA 42P17: políticas cross_reading_profiles + EXISTS sobre tablas cuyo
-- RLS vuelve a consultar public.perfiles → recursión infinita.
--
-- Causa principal: freight_requests (p.ej. freight_req_select_transporter_abierta
-- hace EXISTS (SELECT … FROM public.perfiles …)). Al evaluar EXISTS dentro de una
-- política SOBRE perfiles, Postgres re-evalúa RLS de perfiles → bucle.
-- Lo mismo aplica a companies (company_crud_propio usa EXISTS sobre perfiles),
-- field_inspections (field_insp_super), etc.
--
-- Solución: comprobaciones de existencia en funciones STABLE SECURITY DEFINER con
-- SET row_security = off (sin leer perfiles bajo RLS). Las políticas solo llaman
-- funciones + auth.jwt() / auth.uid().
-- =============================================================================

DROP POLICY IF EXISTS "perfiles_select_jwt_zafra_ceo" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_jwt_freight_context" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_chat_counterpart" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_bunker_company" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_transporter_company_link" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_field_inspection_counterpart" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select_transportista_freight_request" ON public.perfiles;

-- Mercado ciego (sin RLS anidado sobre cosechas)
CREATE OR REPLACE FUNCTION public.rls_perfiles_has_cosecha_publicada(p_agricultor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cosechas c
    WHERE c.agricultor_id = p_agricultor
      AND c.estado = 'publicada'
  );
$$;

-- Fletes: lectura de freight_requests sin aplicar RLS (evita perfiles ↔ freight_requests)
CREATE OR REPLACE FUNCTION public.rls_perfiles_freight_context_visible(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = p_target
        AND fr.estado IN ('abierta', 'con_postulaciones')
    )
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'transporter'
  )
  OR EXISTS (
    SELECT 1
    FROM public.freight_requests fr
    WHERE fr.requester_id = p_target
      AND fr.assigned_transportista_id = auth.uid()
  );
$$;

-- Chat: salas_chat no referencia perfiles en su RLS; se mantiene sin DEFINER por coste bajo,
-- pero unificamos con DEFINER por consistencia y por si cambia RLS de salas_chat.
CREATE OR REPLACE FUNCTION public.rls_perfiles_chat_counterpart_visible(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salas_chat sc
    WHERE (sc.comprador_id = auth.uid() OR sc.agricultor_id = auth.uid())
      AND (sc.comprador_id = p_target OR sc.agricultor_id = p_target)
  );
$$;

-- Empresa búnker: companies / ce / cf sin RLS (evita companies → perfiles)
CREATE OR REPLACE FUNCTION public.rls_perfiles_bunker_company_visible(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.perfil_id = auth.uid()
      AND (
        EXISTS (
          SELECT 1
          FROM public.company_employees ce
          WHERE ce.company_id = c.id
            AND ce.perfil_id = p_target
            AND ce.activo = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM public.company_farmers cf
          WHERE cf.company_id = c.id
            AND cf.producer_id = p_target
            AND cf.activo = TRUE
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_perfiles_transporter_company_link_visible(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.transporter_company_links tcl
    INNER JOIN public.companies co ON co.id = tcl.company_id
    WHERE tcl.transporter_id = p_target
      AND co.perfil_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_perfiles_field_inspection_visible(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.field_inspections fi
    WHERE (
      (fi.perito_id = auth.uid() AND p_target = fi.productor_id)
      OR (fi.productor_id = auth.uid() AND p_target = fi.perito_id)
      OR (
        (p_target = fi.perito_id OR p_target = fi.productor_id)
        AND EXISTS (
          SELECT 1
          FROM public.companies c
          WHERE c.id = fi.empresa_id
            AND c.perfil_id = auth.uid()
        )
      )
    )
  );
$$;

-- Requester viendo transportista: comprobar rol del target con perfiles sin RLS
CREATE OR REPLACE FUNCTION public.rls_perfiles_requester_sees_transportista(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = p_target
      AND p.rol = 'transporter'::public.rol_usuario
  )
  AND EXISTS (
    SELECT 1
    FROM public.freight_requests fr
    WHERE fr.requester_id = auth.uid()
      AND (
        fr.assigned_transportista_id = p_target
        OR EXISTS (
          SELECT 1
          FROM public.freight_request_applications fa
          WHERE fa.freight_request_id = fr.id
            AND fa.transportista_id = p_target
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.rls_perfiles_has_cosecha_publicada(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_perfiles_freight_context_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_perfiles_chat_counterpart_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_perfiles_bunker_company_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_perfiles_transporter_company_link_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_perfiles_field_inspection_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_perfiles_requester_sees_transportista(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rls_perfiles_has_cosecha_publicada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_perfiles_freight_context_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_perfiles_chat_counterpart_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_perfiles_bunker_company_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_perfiles_transporter_company_link_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_perfiles_field_inspection_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_perfiles_requester_sees_transportista(uuid) TO authenticated;

CREATE POLICY "perfiles_select_jwt_zafra_ceo" ON public.perfiles FOR SELECT
  USING (COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'zafra_ceo');

CREATE POLICY "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles FOR SELECT
  USING (
    public.rls_perfiles_has_cosecha_publicada(perfiles.id)
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') IN (
      'independent_producer',
      'buyer',
      'company',
      'agrotienda'
    )
  );

CREATE POLICY "perfiles_select_jwt_freight_context" ON public.perfiles FOR SELECT
  USING (public.rls_perfiles_freight_context_visible(perfiles.id));

CREATE POLICY "perfiles_select_chat_counterpart" ON public.perfiles FOR SELECT
  USING (public.rls_perfiles_chat_counterpart_visible(perfiles.id));

CREATE POLICY "perfiles_select_bunker_company" ON public.perfiles FOR SELECT
  USING (public.rls_perfiles_bunker_company_visible(perfiles.id));

CREATE POLICY "perfiles_select_transporter_company_link" ON public.perfiles FOR SELECT
  USING (public.rls_perfiles_transporter_company_link_visible(perfiles.id));

CREATE POLICY "perfiles_select_field_inspection_counterpart" ON public.perfiles FOR SELECT
  USING (public.rls_perfiles_field_inspection_visible(perfiles.id));

CREATE POLICY "perfiles_select_transportista_freight_request" ON public.perfiles FOR SELECT
  USING (public.rls_perfiles_requester_sees_transportista(perfiles.id));
