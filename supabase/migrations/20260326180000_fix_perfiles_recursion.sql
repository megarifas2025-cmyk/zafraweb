-- fix_perfiles_recursion: elimina TODAS las políticas RLS de public.perfiles y recrea
-- solo acceso a la propia fila (sin subconsultas a perfiles → sin 42P17).
-- Nota: se pierde lectura cruzada (marketplace, chat, CEO, etc.); recuperar con
-- políticas en otras tablas o RPC SECURITY DEFINER si hace falta.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'perfiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.perfiles', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfiles_select_own" ON public.perfiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "perfiles_insert_own" ON public.perfiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "perfiles_update_own" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "perfiles_delete_own" ON public.perfiles FOR DELETE
  USING (auth.uid() = id);
