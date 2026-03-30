-- =============================================================================
-- Parche único: 42P17 (recursión RLS) + políticas claras en vehículos
-- =============================================================================
-- En Supabase SQL Editor → Run una vez si ves: database error code 42P17 al abrir
-- Perfil, actualizar disponibilidad, o cargar vehículos.
--
-- Si el toggle «Fuera de servicio» falla por columna o UPDATE: además ejecuta
--   database/disponibilidad-flete-columna-y-update-rls.sql
-- =============================================================================

-- ----- 1) Evita recursión en políticas de perfiles (zafra_ceo) -----
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
  USING (public.is_zafra_ceo());

-- ----- 2) Vehículos: políticas por comando (sin FOR ALL ambiguo) -----
-- Idempotente: quita versiones anteriores antes de recrear.
DROP POLICY IF EXISTS "vehiculo_crud_propietario" ON public.vehiculos;
DROP POLICY IF EXISTS "vehiculo_select_propietario" ON public.vehiculos;
DROP POLICY IF EXISTS "vehiculo_insert_propietario" ON public.vehiculos;
DROP POLICY IF EXISTS "vehiculo_update_propietario" ON public.vehiculos;
DROP POLICY IF EXISTS "vehiculo_delete_propietario" ON public.vehiculos;

CREATE POLICY "vehiculo_select_propietario" ON public.vehiculos FOR SELECT
  USING (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_insert_propietario" ON public.vehiculos FOR INSERT
  WITH CHECK (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_update_propietario" ON public.vehiculos FOR UPDATE
  USING (auth.uid() = propietario_id)
  WITH CHECK (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_delete_propietario" ON public.vehiculos FOR DELETE
  USING (auth.uid() = propietario_id);
