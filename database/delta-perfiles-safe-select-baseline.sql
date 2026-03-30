-- =============================================================================
-- ZafraClic - baseline seguro para SELECT sobre perfiles
-- Evita ciclos RLS dejando solo lecturas no recursivas.
-- =============================================================================

DROP POLICY IF EXISTS "perfil_bunker_company_read" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_cosecha_marketplace_public" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_field_inspection_counterparts_read" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_select_freight_requester_nombre" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_transporter_link_company_read" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_transportista_por_solicitud_empresa" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_transportista_por_solicitud_requester" ON public.perfiles;

DROP POLICY IF EXISTS "perfil_select_propio" ON public.perfiles;
CREATE POLICY "perfil_select_propio" ON public.perfiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "perfil_ver_verificados" ON public.perfiles;
CREATE POLICY "perfil_ver_verificados" ON public.perfiles FOR SELECT
  USING (
    kyc_estado = 'verified'
    AND activo = TRUE
    AND bloqueado = FALSE
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
