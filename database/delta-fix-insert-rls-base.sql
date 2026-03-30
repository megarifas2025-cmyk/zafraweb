-- Corrige inserts bloqueados por RLS en tablas base operativas.
-- Aplicar cuando el usuario puede leer/editar lo suyo, pero no crear registros nuevos.

ALTER TABLE public.fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finca_crud_propietario" ON public.fincas;
CREATE POLICY "finca_crud_propietario" ON public.fincas FOR ALL
  USING (auth.uid() = propietario_id)
  WITH CHECK (auth.uid() = propietario_id);

DROP POLICY IF EXISTS "cosecha_crud_agricultor" ON public.cosechas;
CREATE POLICY "cosecha_crud_agricultor" ON public.cosechas FOR ALL
  USING (auth.uid() = agricultor_id)
  WITH CHECK (auth.uid() = agricultor_id);

DROP POLICY IF EXISTS "vehiculo_crud_propietario" ON public.vehiculos;
CREATE POLICY "vehiculo_crud_propietario" ON public.vehiculos FOR ALL
  USING (auth.uid() = propietario_id)
  WITH CHECK (auth.uid() = propietario_id);

DROP POLICY IF EXISTS "flete_crud_transportista" ON public.fletes;
CREATE POLICY "flete_crud_transportista" ON public.fletes FOR ALL
  USING (auth.uid() = transportista_id)
  WITH CHECK (auth.uid() = transportista_id);
