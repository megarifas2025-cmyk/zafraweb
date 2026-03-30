-- Root cause of persistent 42P17: SECURITY DEFINER does NOT bypass RLS in PostgreSQL.
-- Policies still use the session user for RLS checks, so SELECT from perfiles inside
-- helpers re-enters perfiles policies → infinite recursion.
-- Fix: disable row_security for the duration of the internal read (SET LOCAL).

CREATE OR REPLACE FUNCTION public.is_zafra_ceo()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'zafra_ceo'::rol_usuario
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_verified_transporter()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'transporter'::rol_usuario
      AND p.kyc_estado = 'verified'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS public.rol_usuario
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rol_usuario;
BEGIN
  SET LOCAL row_security = off;
  SELECT p.rol INTO r FROM public.perfiles p WHERE p.id = auth.uid() LIMIT 1;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_kyc_estado()
RETURNS public.kyc_estado
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k public.kyc_estado;
BEGIN
  SET LOCAL row_security = off;
  SELECT p.kyc_estado INTO k FROM public.perfiles p WHERE p.id = auth.uid() LIMIT 1;
  RETURN k;
END;
$$;

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;
REVOKE ALL ON FUNCTION public.is_verified_transporter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_transporter() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rol() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_kyc_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_estado() TO authenticated;
