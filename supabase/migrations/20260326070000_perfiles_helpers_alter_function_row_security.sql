-- PL/pgSQL SET LOCAL row_security can still leave RLS active for policy evaluation in some cases.
-- PostgreSQL documents ALTER FUNCTION ... SET row_security TO off so the entire function
-- runs with row_security disabled (reliable for SECURITY DEFINER reads of perfiles).

CREATE OR REPLACE FUNCTION public.is_zafra_ceo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'zafra_ceo'::rol_usuario
  );
$$;
ALTER FUNCTION public.is_zafra_ceo() SET row_security TO off;

CREATE OR REPLACE FUNCTION public.is_verified_transporter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'transporter'::rol_usuario
      AND p.kyc_estado = 'verified'
  );
$$;
ALTER FUNCTION public.is_verified_transporter() SET row_security TO off;

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS public.rol_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;
ALTER FUNCTION public.get_my_rol() SET row_security TO off;

CREATE OR REPLACE FUNCTION public.get_my_kyc_estado()
RETURNS public.kyc_estado
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kyc_estado FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;
ALTER FUNCTION public.get_my_kyc_estado() SET row_security TO off;

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;
REVOKE ALL ON FUNCTION public.is_verified_transporter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_transporter() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rol() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_kyc_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_estado() TO authenticated;
