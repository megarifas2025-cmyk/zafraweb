-- =============================================================================
-- Fix: 42P17 infinite recursion detected in policy for relation "perfiles"
-- =============================================================================
-- Causa típica: la política "zafra_ceo_all" hace EXISTS (SELECT … FROM perfiles)
-- sobre la misma tabla que protege → Postgres entra en recursión al evaluar RLS.
-- Solución: comprobar rol zafra_ceo en una función SECURITY DEFINER (bypass RLS
-- en la lectura interna, sin bucle).
--
-- Ejecutar en Supabase → SQL Editor → Run (una vez). Idempotente (CREATE OR REPLACE).
-- =============================================================================

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

COMMENT ON FUNCTION public.is_zafra_ceo() IS 'Evita recursión RLS al comprobar zafra_ceo en políticas de perfiles.';

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;

DROP POLICY IF EXISTS "zafra_ceo_all" ON public.perfiles;
CREATE POLICY "zafra_ceo_all" ON public.perfiles FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());
