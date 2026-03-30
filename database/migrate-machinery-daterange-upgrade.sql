-- ================================================================
-- UPGRADE: machinery_rentals → disponibilidad_fechas (daterange) +
--         ubicacion_lat / ubicacion_lng (para filtros “cercanos” en app)
-- Ejecutar UNA VEZ si ya aplicaste migrate-producer-master-panel.sql
-- con disponibilidad_inicio / disponibilidad_fin (columnas legadas).
-- ================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'machinery_rentals'
      AND column_name = 'disponibilidad_inicio'
  ) THEN
    ALTER TABLE public.machinery_rentals ADD COLUMN IF NOT EXISTS disponibilidad_fechas daterange;
    UPDATE public.machinery_rentals
    SET disponibilidad_fechas = daterange(disponibilidad_inicio, disponibilidad_fin, '[]')
    WHERE disponibilidad_fechas IS NULL;
    ALTER TABLE public.machinery_rentals DROP COLUMN IF EXISTS disponibilidad_inicio;
    ALTER TABLE public.machinery_rentals DROP COLUMN IF EXISTS disponibilidad_fin;
    ALTER TABLE public.machinery_rentals ALTER COLUMN disponibilidad_fechas SET NOT NULL;
  END IF;
END $$;

-- Coordenadas planas para Haversine en cliente (evita parsear WKB de geography).
ALTER TABLE public.machinery_rentals ADD COLUMN IF NOT EXISTS ubicacion_lat double precision;
ALTER TABLE public.machinery_rentals ADD COLUMN IF NOT EXISTS ubicacion_lng double precision;

UPDATE public.machinery_rentals
SET
  ubicacion_lat = ST_Y(ubicacion_gps::geometry),
  ubicacion_lng = ST_X(ubicacion_gps::geometry)
WHERE ubicacion_gps IS NOT NULL
  AND (ubicacion_lat IS NULL OR ubicacion_lng IS NULL);

CREATE OR REPLACE FUNCTION public.fn_machinery_sync_lat_lng()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ubicacion_gps IS NOT NULL THEN
    NEW.ubicacion_lat := ST_Y(NEW.ubicacion_gps::geometry);
    NEW.ubicacion_lng := ST_X(NEW.ubicacion_gps::geometry);
  ELSE
    NEW.ubicacion_lat := NULL;
    NEW.ubicacion_lng := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_machinery_lat_lng ON public.machinery_rentals;
CREATE TRIGGER trg_machinery_lat_lng
  BEFORE INSERT OR UPDATE OF ubicacion_gps ON public.machinery_rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_machinery_sync_lat_lng();
