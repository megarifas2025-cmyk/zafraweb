-- Vehículos: políticas explícitas por comando (INSERT/UPDATE/DELETE/SELECT propio).
-- Si "vehiculo_crud_propietario" FOR ALL fallaba en INSERT en tu instancia, ejecuta esto en Supabase SQL.
-- Mantiene "vehiculo_lectura_verified" para ver unidades activas del mercado (otros verificados).

DROP POLICY IF EXISTS "vehiculo_crud_propietario" ON public.vehiculos;

CREATE POLICY "vehiculo_select_propietario" ON public.vehiculos FOR SELECT
  USING (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_insert_propietario" ON public.vehiculos FOR INSERT
  WITH CHECK (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_update_propietario" ON public.vehiculos FOR UPDATE
  USING (auth.uid() = propietario_id)
  WITH CHECK (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_delete_propietario" ON public.vehiculos FOR DELETE
  USING (auth.uid() = propietario_id);
