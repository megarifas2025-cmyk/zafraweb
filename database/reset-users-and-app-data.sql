-- ================================================================
-- REINICIO de cuentas y datos de la app
-- Supabase → SQL Editor → Run
-- IRREVERSIBLE (solo desarrollo)
--
-- Si antes te salía: relación «perfiles» no existe → tu BD aún no tiene
-- el schema de Unicornio. 1) Pega y ejecuta database/schema.sql completo
-- 2) Luego vuelve a este script, o usa solo reset-auth-only.sql abajo.
-- ================================================================

BEGIN;

-- Solo si ya creaste las tablas del proyecto
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'perfiles'
  ) THEN
    TRUNCATE TABLE public.perfiles CASCADE;
    RAISE NOTICE 'Tablas public.* ligadas a perfiles vaciadas.';
  ELSE
    RAISE NOTICE 'No existe public.perfiles: se omitió TRUNCATE. Ejecuta database/schema.sql cuando quieras la app completa.';
  END IF;
END $$;

DELETE FROM auth.identities;
DELETE FROM auth.users;

COMMIT;
