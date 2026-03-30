-- =============================================================================
-- ZafraClic - rompe ciclos RLS company <-> perfiles
-- Reutiliza public.auth_my_company_id() para evitar recursiones entre policies.
-- =============================================================================

DROP POLICY IF EXISTS "field_insp_company_all" ON public.field_inspections;
CREATE POLICY "field_insp_company_all" ON public.field_inspections FOR ALL
  USING (public.auth_my_company_id() = empresa_id)
  WITH CHECK (public.auth_my_company_id() = empresa_id);

DROP POLICY IF EXISTS "finca_bunker_company_read" ON public.fincas;
CREATE POLICY "finca_bunker_company_read" ON public.fincas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_farmers cf
      WHERE cf.company_id = public.auth_my_company_id()
        AND cf.producer_id = fincas.propietario_id
        AND cf.activo = TRUE
    )
  );

DROP POLICY IF EXISTS "cosecha_bunker_company_read" ON public.cosechas;
CREATE POLICY "cosecha_bunker_company_read" ON public.cosechas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_farmers cf
      WHERE cf.company_id = public.auth_my_company_id()
        AND cf.producer_id = cosechas.agricultor_id
        AND cf.activo = TRUE
    )
  );

DROP POLICY IF EXISTS "lotes_fin_company_rw" ON public.lotes_financiados;
CREATE POLICY "lotes_fin_company_rw" ON public.lotes_financiados FOR ALL
  USING (public.auth_my_company_id() = company_id)
  WITH CHECK (public.auth_my_company_id() = company_id);

DROP POLICY IF EXISTS "perfil_bunker_company_read" ON public.perfiles;
CREATE POLICY "perfil_bunker_company_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_employees ce
      WHERE ce.company_id = public.auth_my_company_id()
        AND ce.perfil_id = perfiles.id
        AND ce.activo = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_farmers cf
      WHERE cf.company_id = public.auth_my_company_id()
        AND cf.producer_id = perfiles.id
        AND cf.activo = TRUE
    )
  );

DROP POLICY IF EXISTS "perfil_field_inspection_counterparts_read" ON public.perfiles;
CREATE POLICY "perfil_field_inspection_counterparts_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.field_inspections fi
      WHERE (fi.perito_id = auth.uid() AND perfiles.id = fi.productor_id)
         OR (fi.productor_id = auth.uid() AND perfiles.id = fi.perito_id)
         OR (
           (perfiles.id = fi.perito_id OR perfiles.id = fi.productor_id)
           AND fi.empresa_id = public.auth_my_company_id()
         )
    )
  );

DROP POLICY IF EXISTS "perfil_transporter_link_company_read" ON public.perfiles;
CREATE POLICY "perfil_transporter_link_company_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.transporter_company_links tcl
      WHERE tcl.company_id = public.auth_my_company_id()
        AND tcl.transporter_id = perfiles.id
    )
  );
