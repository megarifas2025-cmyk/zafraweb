-- Si ya ejecutaste schema.sql antes y el registro falla por RLS, corre esto en SQL Editor.
-- Mantiene el auto-registro abierto solo para roles públicos de la app.

DROP POLICY IF EXISTS "perfil_insert_registro" ON public.perfiles;
CREATE POLICY "perfil_insert_registro" ON public.perfiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND rol IN ('company', 'independent_producer', 'buyer', 'transporter', 'agrotienda')
  );
