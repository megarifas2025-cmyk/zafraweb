-- =============================================================================
-- 42P17 residual: la migración fix_recursion_emergencia reemplazó las políticas
-- con prefijo perfiles_select_* pero NO eliminó la política antigua
-- perfil_select_freight_requester_nombre (nombre distinto: perfil_ vs perfiles_).
--
-- Esa política usa is_verified_transporter() → SELECT en public.perfiles bajo RLS
-- → recursión infinita al OR con el resto de políticas SELECT.
--
-- La cobertura equivalente ya está en perfiles_select_jwt_freight_context +
-- rls_perfiles_freight_context_visible (JWT + función SECURITY DEFINER).
-- =============================================================================

DROP POLICY IF EXISTS "perfil_select_freight_requester_nombre" ON public.perfiles;
