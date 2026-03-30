-- Opcional: capacidad y estado para tarjetas de flota (FleetManagement).
ALTER TABLE public.company_fleet_units
  ADD COLUMN IF NOT EXISTS capacidad_ton NUMERIC(10,2);
ALTER TABLE public.company_fleet_units
  ADD COLUMN IF NOT EXISTS estado_logistico TEXT NOT NULL DEFAULT 'disponible';

COMMENT ON COLUMN public.company_fleet_units.capacidad_ton IS 'Capacidad útil en toneladas.';
COMMENT ON COLUMN public.company_fleet_units.estado_logistico IS 'disponible | en_ruta';
