-- =============================================================================
-- ZafraClic - estabilidad RLS para dashboard de productor
-- Elimina cadenas recursivas entre companies/company_affiliations/perfiles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auth_is_affiliated_producer(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_affiliations a
    WHERE a.company_id = p_company_id
      AND a.producer_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_affiliated_producer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_affiliated_producer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_has_transporter_company_link(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.transporter_company_links tcl
    WHERE tcl.company_id = p_company_id
      AND tcl.transporter_id = auth.uid()
      AND tcl.status IN ('pending', 'approved')
  );
$$;

REVOKE ALL ON FUNCTION public.auth_has_transporter_company_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_transporter_company_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_is_company_employee(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_employees ce
    WHERE ce.company_id = p_company_id
      AND ce.perfil_id = auth.uid()
      AND ce.activo = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_company_employee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_company_employee(uuid) TO authenticated;

DROP POLICY IF EXISTS "companies_bunker_perito_read" ON public.companies;
CREATE POLICY "companies_bunker_perito_read" ON public.companies FOR SELECT
  USING (public.auth_is_company_employee(companies.id));

DROP POLICY IF EXISTS "companies_financing_producer_read" ON public.companies;
CREATE POLICY "companies_financing_producer_read" ON public.companies FOR SELECT
  USING (public.auth_is_affiliated_producer(companies.id));

DROP POLICY IF EXISTS "companies_transporter_link_read" ON public.companies;
CREATE POLICY "companies_transporter_link_read" ON public.companies FOR SELECT
  USING (public.auth_has_transporter_company_link(companies.id));

DROP POLICY IF EXISTS "field_insp_super" ON public.field_inspections;
CREATE POLICY "field_insp_super" ON public.field_inspections FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

DROP POLICY IF EXISTS "lotes_fin_super_admin" ON public.lotes_financiados;
CREATE POLICY "lotes_fin_super_admin" ON public.lotes_financiados FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

DROP POLICY IF EXISTS "cosecha_ver_marketplace" ON public.cosechas;
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND public.get_my_kyc_estado() = 'verified'
    AND public.get_my_rol() IN (
      'independent_producer'::public.rol_usuario,
      'buyer'::public.rol_usuario,
      'company'::public.rol_usuario,
      'agrotienda'::public.rol_usuario
    )
  );
