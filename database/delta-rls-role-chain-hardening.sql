-- =============================================================================
-- ZafraClic — Endurecimiento RLS por cadenas reales entre roles
-- Corrige:
-- 1) acceso de companies mal agrupado,
-- 2) lectura excesiva de perfiles verificados,
-- 3) requerimientos visibles por rol/categoria,
-- 4) catálogo agrotienda visible solo a roles comerciales correctos.
-- =============================================================================

-- ---- companies ----
DROP POLICY IF EXISTS "company_crud_propio" ON public.companies;
CREATE POLICY "company_crud_propio" ON public.companies FOR ALL
  USING (
    public.is_zafra_ceo()
    OR auth.uid() = companies.perfil_id
  )
  WITH CHECK (
    public.is_zafra_ceo()
    OR auth.uid() = companies.perfil_id
  );

-- ---- perfiles ----
DROP POLICY IF EXISTS "perfil_ver_propio_o_verified" ON public.perfiles;
CREATE POLICY "perfil_ver_propio_o_verified" ON public.perfiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "perfil_transportista_por_solicitud_requester" ON public.perfiles;
CREATE POLICY "perfil_transportista_por_solicitud_requester" ON public.perfiles FOR SELECT
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

DROP POLICY IF EXISTS "perfil_chat_participantes_read" ON public.perfiles;
CREATE POLICY "perfil_chat_participantes_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.salas_chat sc
      WHERE (sc.comprador_id = auth.uid() OR sc.agricultor_id = auth.uid())
        AND (sc.comprador_id = perfiles.id OR sc.agricultor_id = perfiles.id)
    )
  );

DROP POLICY IF EXISTS "perfil_cosecha_marketplace_public" ON public.perfiles;
CREATE POLICY "perfil_cosecha_marketplace_public" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cosechas c
      WHERE c.agricultor_id = perfiles.id
        AND c.estado = 'publicada'
        AND EXISTS (
          SELECT 1
          FROM public.perfiles p
          WHERE p.id = auth.uid()
            AND p.kyc_estado = 'verified'
            AND p.rol IN (
              'independent_producer'::rol_usuario,
              'buyer'::rol_usuario,
              'company'::rol_usuario,
              'agrotienda'::rol_usuario
            )
        )
    )
  );

-- ---- agricultural_inputs ----
DROP POLICY IF EXISTS "agri_inputs_select_mismo_municipio" ON public.agricultural_inputs;
CREATE POLICY "agri_inputs_select_mismo_municipio" ON public.agricultural_inputs FOR SELECT
  USING (
    disponibilidad = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p_tienda
      WHERE p_tienda.id = agricultural_inputs.perfil_id
        AND p_tienda.rol = 'agrotienda'
        AND p_tienda.kyc_estado = 'verified'
        AND p_tienda.municipio IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.perfiles p_user
          WHERE p_user.id = auth.uid()
            AND p_user.kyc_estado = 'verified'
            AND p_user.rol IN (
              'independent_producer'::rol_usuario,
              'buyer'::rol_usuario,
              'agrotienda'::rol_usuario
            )
            AND p_user.municipio IS NOT NULL
            AND p_user.municipio = p_tienda.municipio
        )
    )
  );

-- ---- requerimientos_compra ----
DROP POLICY IF EXISTS "req_compra_select_mercado" ON public.requerimientos_compra;
CREATE POLICY "req_compra_select_mercado" ON public.requerimientos_compra FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND (
          (p.rol = 'independent_producer'::rol_usuario AND requerimientos_compra.categoria_destino = 'Cosecha a Granel')
          OR (p.rol = 'company'::rol_usuario AND requerimientos_compra.categoria_destino = 'Volumen Procesado / Silos')
          OR (p.rol = 'agrotienda'::rol_usuario AND requerimientos_compra.categoria_destino = 'Insumos y Maquinaria')
        )
    )
  );

-- ---- cosechas ----
DROP POLICY IF EXISTS "cosecha_ver_marketplace" ON public.cosechas;
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
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
