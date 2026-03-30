-- =============================================================================
-- Parche RLS: foto de perfil (UPDATE), insumos agrotienda (INSERT), transporte (INSERT)
-- =============================================================================
-- Síntomas: no sube avatar, no guarda producto en Mi tienda, no publica solicitud
-- de transporte — a menudo por subconsultas a `perfiles` dentro de WITH CHECK
-- que chocan con RLS o sin WITH CHECK en políticas FOR ALL.
--
-- Ejecutar en Supabase → SQL Editor → Run (una vez). Idempotente.
-- Recomendado después de: PARCHE-SUPABASE-42P17-RLS.sql y disponibilidad-flete-*.sql
-- =============================================================================

-- Rol del usuario actual sin recursión RLS (usa en políticas de freight_requests, etc.)
CREATE OR REPLACE FUNCTION public.auth_my_rol()
RETURNS public.rol_usuario
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_my_rol() IS 'Rol del usuario autenticado; lectura de perfiles bajo RLS sin bucles en políticas.';

REVOKE ALL ON FUNCTION public.auth_my_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_my_rol() TO authenticated;

-- ----- freight_requests: INSERT sin subconsultas RLS frágiles -----
DROP POLICY IF EXISTS "freight_req_insert_generadores" ON public.freight_requests;

CREATE POLICY "freight_req_insert_generadores" ON public.freight_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_role = public.auth_my_rol()
    AND public.auth_my_rol() IN (
      'independent_producer'::public.rol_usuario,
      'buyer'::public.rol_usuario,
      'company'::public.rol_usuario,
      'agrotienda'::public.rol_usuario
    )
  );

-- ----- agricultural_inputs: dueño agrotienda — USING + WITH CHECK explícitos -----
DROP POLICY IF EXISTS "agri_inputs_crud_dueno" ON public.agricultural_inputs;

CREATE POLICY "agri_inputs_crud_dueno" ON public.agricultural_inputs FOR ALL
  USING (auth.uid() = perfil_id)
  WITH CHECK (auth.uid() = perfil_id);

-- ----- perfiles: asegurar UPDATE propio (avatar_url, etc.) -----
DROP POLICY IF EXISTS "perfil_editar_propio" ON public.perfiles;

CREATE POLICY "perfil_editar_propio" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
