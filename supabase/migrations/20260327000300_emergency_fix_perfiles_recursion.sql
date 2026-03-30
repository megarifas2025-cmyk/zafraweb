-- =============================================================================
-- EMERGENCIA: Fix recursión infinita en perfiles
-- La política perfiles_select_jwt_marketplace_cosecha tenía un EXISTS que
-- consultaba la misma tabla perfiles dentro de una política de perfiles → loop.
-- Solución: usar get_my_rol() (SECURITY DEFINER + row_security=off)
-- =============================================================================

-- Política que causaba la recursión:
-- EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN (...))
-- ↑ Esto re-ejecuta todas las políticas de perfiles → loop infinito

DROP POLICY IF EXISTS "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles;
CREATE POLICY "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles FOR SELECT
  USING (
    public.rls_perfiles_has_cosecha_publicada(id)
    AND public.get_my_rol() IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  );
