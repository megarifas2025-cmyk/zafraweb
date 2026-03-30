-- =============================================================================
-- NIVEL 1 – Fixes de seguridad y RLS
-- 1. Reemplazar políticas que usan user_metadata por is_zafra_ceo() / perfiles
-- 2. Habilitar RLS + políticas en field_inspection_counters y ticker_items
-- 3. Agregar políticas a viajes, viaje_docs, vehiculo_docs (RLS activo sin policies)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1A. perfiles: perfiles_select_jwt_zafra_ceo → usar is_zafra_ceo()
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "perfiles_select_jwt_zafra_ceo" ON public.perfiles;
CREATE POLICY "perfiles_select_jwt_zafra_ceo" ON public.perfiles FOR SELECT
  USING (public.is_zafra_ceo());

-- -----------------------------------------------------------------------------
-- 1B. perfiles: perfiles_select_jwt_marketplace_cosecha
--     Reemplazar JWT claim por perfiles lookup (anti-stale-token)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles;
CREATE POLICY "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles FOR SELECT
  USING (
    public.rls_perfiles_has_cosecha_publicada(id)
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN (
          'independent_producer'::rol_usuario,
          'buyer'::rol_usuario,
          'company'::rol_usuario,
          'agrotienda'::rol_usuario
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 1C. cosechas: cosecha_ver_marketplace → usar perfiles lookup
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cosecha_ver_marketplace" ON public.cosechas;
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN (
          'independent_producer'::rol_usuario,
          'buyer'::rol_usuario,
          'company'::rol_usuario,
          'agrotienda'::rol_usuario,
          'perito'::rol_usuario
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 1D. cosechas: cosecha_edit_lab_company_perito → usar perfiles lookup
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cosecha_edit_lab_company_perito" ON public.cosechas;
CREATE POLICY "cosecha_edit_lab_company_perito" ON public.cosechas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'company'::rol_usuario
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.perfiles p
        WHERE p.id = auth.uid() AND p.rol = 'perito'::rol_usuario
      )
      AND EXISTS (
        SELECT 1 FROM public.peritos pe
        WHERE pe.perfil_id = auth.uid() AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 2A. field_inspection_counters: habilitar RLS
--     Esta tabla es interna del trigger fn_field_inspection_numero_control
--     (SECURITY DEFINER). Los usuarios normales no deben tener acceso directo.
--     Solo zafra_ceo puede consultarla para auditoría.
-- -----------------------------------------------------------------------------
ALTER TABLE public.field_inspection_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fic_ceo_all" ON public.field_inspection_counters;
CREATE POLICY "fic_ceo_all" ON public.field_inspection_counters FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

-- Acceso de lectura para la empresa dueña del contador
DROP POLICY IF EXISTS "fic_empresa_select" ON public.field_inspection_counters;
CREATE POLICY "fic_empresa_select" ON public.field_inspection_counters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = empresa_id AND c.perfil_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 2B. ticker_items: habilitar RLS
--     Lectura pública (cualquier usuario autenticado puede ver items activos).
--     Escritura solo zafra_ceo o funciones SECURITY DEFINER.
-- -----------------------------------------------------------------------------
ALTER TABLE public.ticker_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticker_select_activos" ON public.ticker_items;
CREATE POLICY "ticker_select_activos" ON public.ticker_items FOR SELECT
  USING (activo = TRUE AND (expira_en IS NULL OR expira_en > NOW()));

DROP POLICY IF EXISTS "ticker_ceo_all" ON public.ticker_items;
CREATE POLICY "ticker_ceo_all" ON public.ticker_items FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

-- -----------------------------------------------------------------------------
-- 3A. viajes: RLS ya habilitado pero SIN políticas (tabla completamente bloqueada)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "viajes_crud_transportista" ON public.viajes;
CREATE POLICY "viajes_crud_transportista" ON public.viajes FOR ALL
  USING (auth.uid() = transportista_id)
  WITH CHECK (auth.uid() = transportista_id);

DROP POLICY IF EXISTS "viajes_select_freight_requester" ON public.viajes;
CREATE POLICY "viajes_select_freight_requester" ON public.viajes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.freight_requests fr
      WHERE fr.requester_id = auth.uid()
        AND fr.assigned_transportista_id = viajes.transportista_id
        AND fr.estado IN ('asignada', 'completada')
    )
  );

DROP POLICY IF EXISTS "viajes_ceo_all" ON public.viajes;
CREATE POLICY "viajes_ceo_all" ON public.viajes FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

-- -----------------------------------------------------------------------------
-- 3B. viaje_docs: RLS ya habilitado pero SIN políticas
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "viaje_docs_crud_transportista" ON public.viaje_docs;
CREATE POLICY "viaje_docs_crud_transportista" ON public.viaje_docs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.viajes v
      WHERE v.id = viaje_docs.viaje_id AND v.transportista_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.viajes v
      WHERE v.id = viaje_docs.viaje_id AND v.transportista_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "viaje_docs_select_freight_requester" ON public.viaje_docs;
CREATE POLICY "viaje_docs_select_freight_requester" ON public.viaje_docs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.viajes v
      JOIN public.freight_requests fr
        ON fr.assigned_transportista_id = v.transportista_id
        AND fr.requester_id = auth.uid()
        AND fr.estado IN ('asignada', 'completada')
      WHERE v.id = viaje_docs.viaje_id
    )
  );

DROP POLICY IF EXISTS "viaje_docs_ceo_all" ON public.viaje_docs;
CREATE POLICY "viaje_docs_ceo_all" ON public.viaje_docs FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

-- -----------------------------------------------------------------------------
-- 3C. vehiculo_docs: RLS ya habilitado pero SIN políticas
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "vehiculo_docs_crud_propietario" ON public.vehiculo_docs;
CREATE POLICY "vehiculo_docs_crud_propietario" ON public.vehiculo_docs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vehiculos v
      WHERE v.id = vehiculo_docs.vehiculo_id AND v.propietario_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehiculos v
      WHERE v.id = vehiculo_docs.vehiculo_id AND v.propietario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vehiculo_docs_select_verified" ON public.vehiculo_docs;
CREATE POLICY "vehiculo_docs_select_verified" ON public.vehiculo_docs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.kyc_estado = 'verified'
    )
  );

DROP POLICY IF EXISTS "vehiculo_docs_ceo_all" ON public.vehiculo_docs;
CREATE POLICY "vehiculo_docs_ceo_all" ON public.vehiculo_docs FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());
