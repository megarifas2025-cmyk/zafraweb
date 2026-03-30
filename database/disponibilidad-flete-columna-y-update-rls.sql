-- =============================================================================
-- Transportista: columna disponibilidad_flete + política UPDATE clara en perfiles
-- =============================================================================
-- Ejecuta en Supabase SQL Editor si al pulsar «Fuera de servicio / Buscando carga»
-- ves error al actualizar, o si esa columna no existía en tu BD.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS disponibilidad_flete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.perfiles.disponibilidad_flete IS 'Transportista: visible como disponible para nuevas cargas (toggle en Flota).';

-- UPDATE propio: USING y WITH CHECK explícitos (evita rechazos según versión de Postgres)
DROP POLICY IF EXISTS "perfil_editar_propio" ON public.perfiles;
CREATE POLICY "perfil_editar_propio" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
