-- Fix 42P17: infinite recursion in RLS on public.perfiles
-- Cause: policy "perfil_cosecha_marketplace_public" subqueried public.perfiles
-- while evaluating RLS on the same table.
-- Fix: SECURITY DEFINER helpers (same pattern as is_zafra_ceo) + recreate policies.

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS public.rol_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_kyc_estado()
RETURNS public.kyc_estado
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kyc_estado FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rol() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_kyc_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_estado() TO authenticated;

COMMENT ON FUNCTION public.get_my_rol() IS 'Evita recursión RLS al usar rol del usuario en políticas sobre perfiles.';
COMMENT ON FUNCTION public.get_my_kyc_estado() IS 'Evita recursión RLS al usar kyc del usuario en políticas sobre perfiles.';

CREATE OR REPLACE FUNCTION public.is_zafra_ceo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'zafra_ceo'::rol_usuario
  );
$$;

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;

DROP POLICY IF EXISTS "zafra_ceo_all" ON public.perfiles;
CREATE POLICY "zafra_ceo_all" ON public.perfiles FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

DROP POLICY IF EXISTS "perfil_cosecha_marketplace_public" ON public.perfiles;
CREATE POLICY "perfil_cosecha_marketplace_public" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cosechas c
      WHERE c.agricultor_id = perfiles.id
        AND c.estado = 'publicada'
    )
    AND public.get_my_kyc_estado() = 'verified'
    AND public.get_my_rol() IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  );
