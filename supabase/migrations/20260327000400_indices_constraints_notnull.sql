-- =============================================================================
-- Auditoría: índices FK faltantes + NOT NULL + CHECK constraints
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Índices en columnas FK de alto tráfico (sin índice automático en PostgreSQL)
-- -----------------------------------------------------------------------------

-- peritos
CREATE INDEX IF NOT EXISTS idx_peritos_company_id   ON public.peritos(company_id)  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_peritos_perfil_id    ON public.peritos(perfil_id);

-- fincas
CREATE INDEX IF NOT EXISTS idx_fincas_company_id    ON public.fincas(company_id)   WHERE company_id IS NOT NULL;

-- cosechas
CREATE INDEX IF NOT EXISTS idx_cosechas_agricultor  ON public.cosechas(agricultor_id);
CREATE INDEX IF NOT EXISTS idx_cosechas_finca        ON public.cosechas(finca_id)   WHERE finca_id IS NOT NULL;

-- vehiculos
CREATE INDEX IF NOT EXISTS idx_vehiculos_propietario ON public.vehiculos(propietario_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_company     ON public.vehiculos(company_id) WHERE company_id IS NOT NULL;

-- vehiculo_docs
CREATE INDEX IF NOT EXISTS idx_vehiculo_docs_vehiculo ON public.vehiculo_docs(vehiculo_id);

-- fletes
CREATE INDEX IF NOT EXISTS idx_fletes_transportista  ON public.fletes(transportista_id);
CREATE INDEX IF NOT EXISTS idx_fletes_vehiculo        ON public.fletes(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_fletes_cosecha         ON public.fletes(cosecha_id)  WHERE cosecha_id IS NOT NULL;

-- viajes
CREATE INDEX IF NOT EXISTS idx_viajes_flete           ON public.viajes(flete_id)    WHERE flete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viajes_transportista   ON public.viajes(transportista_id);
CREATE INDEX IF NOT EXISTS idx_viajes_vehiculo        ON public.viajes(vehiculo_id);

-- viaje_docs
CREATE INDEX IF NOT EXISTS idx_viaje_docs_viaje       ON public.viaje_docs(viaje_id);

-- salas_chat
CREATE INDEX IF NOT EXISTS idx_salas_chat_cosecha     ON public.salas_chat(cosecha_id) WHERE cosecha_id IS NOT NULL;

-- lotes_financiados
CREATE INDEX IF NOT EXISTS idx_lotes_fin_finca        ON public.lotes_financiados(finca_id) WHERE finca_id IS NOT NULL;

-- inspecciones
CREATE INDEX IF NOT EXISTS idx_inspecciones_company   ON public.inspecciones(company_id)  WHERE company_id IS NOT NULL;

-- freight_request_notifications (fk adicionales sin índice)
CREATE INDEX IF NOT EXISTS idx_freight_notif_request  ON public.freight_request_notifications(freight_request_id);

-- -----------------------------------------------------------------------------
-- 2. NOT NULL en columnas de estado con DEFAULT ya definido
--    Primero actualizamos NULLs residuales, luego aplicamos la restricción
-- -----------------------------------------------------------------------------

UPDATE public.cosechas  SET estado = 'borrador'   WHERE estado IS NULL;
ALTER TABLE public.cosechas  ALTER COLUMN estado SET NOT NULL;

UPDATE public.fletes    SET estado = 'available'  WHERE estado IS NULL;
ALTER TABLE public.fletes    ALTER COLUMN estado SET NOT NULL;

UPDATE public.viajes    SET estado = 'pendiente'  WHERE estado IS NULL;
ALTER TABLE public.viajes    ALTER COLUMN estado SET NOT NULL;

UPDATE public.mensajes  SET tipo = 'texto'        WHERE tipo IS NULL;
ALTER TABLE public.mensajes  ALTER COLUMN tipo SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. CHECK constraints: precios no negativos y porcentajes acotados
-- -----------------------------------------------------------------------------

-- Precios
ALTER TABLE public.fletes
  ADD CONSTRAINT fletes_precio_kg_nonneg
  CHECK (precio_kg IS NULL OR precio_kg >= 0);

ALTER TABLE public.salas_chat
  ADD CONSTRAINT salas_chat_precio_acordado_nonneg
  CHECK (precio_acordado IS NULL OR precio_acordado >= 0);

ALTER TABLE public.agricultural_inputs
  ADD CONSTRAINT agri_inputs_precio_nonneg
  CHECK (precio IS NULL OR precio >= 0);

-- Porcentaje de daño en inspecciones (0–100)
ALTER TABLE public.field_inspections
  ADD CONSTRAINT field_insp_porcentaje_range
  CHECK (porcentaje_dano IS NULL OR (porcentaje_dano >= 0 AND porcentaje_dano <= 100));
