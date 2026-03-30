-- Flujo empresa <-> agricultor:
-- 1) Empresa busca agricultor por documento.
-- 2) Empresa crea invitación en company_affiliations (activo = false).
-- 3) Agricultor ve la invitación, acepta o rechaza.
-- 4) Al aceptar, el trigger existente sincroniza company_farmers con activo = true.

CREATE OR REPLACE FUNCTION public.company_find_producer_by_doc(p_doc text)
RETURNS TABLE (
  perfil_id uuid,
  nombre text,
  telefono text,
  municipio text,
  estado_ve text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.perfil_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solo cuentas empresa pueden buscar agricultores';
  END IF;

  RETURN QUERY
  SELECT
    p.id::uuid,
    p.nombre::text,
    p.telefono::text,
    p.municipio::text,
    p.estado_ve::text
  FROM public.perfiles p
  WHERE p.doc_numero IS NOT NULL
    AND trim(p.doc_numero) = trim(p_doc)
    AND p.rol = 'independent_producer'
    AND COALESCE(p.activo, true) = true
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.company_find_producer_by_doc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_find_producer_by_doc(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_my_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.perfil_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_my_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_my_company_id() TO authenticated;

DROP POLICY IF EXISTS "affiliations_company" ON public.company_affiliations;
CREATE POLICY "affiliations_company" ON public.company_affiliations FOR ALL
  USING (
    public.auth_my_company_id() = company_affiliations.company_id
  )
  WITH CHECK (
    public.auth_my_company_id() = company_affiliations.company_id
  );

DROP POLICY IF EXISTS "affiliations_producer_select" ON public.company_affiliations;
CREATE POLICY "affiliations_producer_select" ON public.company_affiliations FOR SELECT
  USING (auth.uid() = producer_id);

DROP POLICY IF EXISTS "affiliations_producer_update" ON public.company_affiliations;
CREATE POLICY "affiliations_producer_update" ON public.company_affiliations FOR UPDATE
  USING (auth.uid() = producer_id)
  WITH CHECK (auth.uid() = producer_id);

DROP POLICY IF EXISTS "affiliations_producer_delete" ON public.company_affiliations;
CREATE POLICY "affiliations_producer_delete" ON public.company_affiliations FOR DELETE
  USING (auth.uid() = producer_id);

DROP POLICY IF EXISTS "companies_financing_producer_read" ON public.companies;
CREATE POLICY "companies_financing_producer_read" ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_affiliations a
      WHERE a.company_id = companies.id
        AND a.producer_id = auth.uid()
    )
  );
