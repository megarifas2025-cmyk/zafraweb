-- =============================================================================
-- Flete ↔ Flota propia: fleet_unit_id en freight_requests + sync vía trigger
-- Idempotente. Ejecutar en Supabase SQL Editor (una vez).
-- Requiere: company_fleet_units.estado_logistico (delta-company-fleet-capacity-estado.sql)
-- =============================================================================

-- Columna en solicitudes
ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS fleet_unit_id UUID REFERENCES public.company_fleet_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_freight_requests_fleet_unit
  ON public.freight_requests(fleet_unit_id)
  WHERE fleet_unit_id IS NOT NULL;

COMMENT ON COLUMN public.freight_requests.fleet_unit_id IS 'Unidad de company_fleet_units asignada (flota interna empresa).';

-- Estado terminal para cerrar viaje interno
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'freight_request_estado'
      AND e.enumlabel = 'completada'
  ) THEN
    ALTER TYPE freight_request_estado ADD VALUE 'completada';
  END IF;
END $$;

-- Asegurar columna logística en unidades (si no corriste el otro delta)
ALTER TABLE public.company_fleet_units
  ADD COLUMN IF NOT EXISTS estado_logistico TEXT NOT NULL DEFAULT 'disponible';

-- -----------------------------------------------------------------------------
-- Trigger: sincroniza company_fleet_units.estado_logistico con freight_requests
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_freight_sync_fleet_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new TEXT;
BEGIN
  v_new := COALESCE(NEW.estado::text, '');

  IF TG_OP = 'UPDATE' AND OLD.fleet_unit_id IS NOT NULL THEN
    IF OLD.fleet_unit_id IS DISTINCT FROM NEW.fleet_unit_id OR v_new IN ('completada', 'cancelada') THEN
      UPDATE public.company_fleet_units
      SET estado_logistico = 'disponible'
      WHERE id = OLD.fleet_unit_id;
    END IF;
  END IF;

  IF NEW.fleet_unit_id IS NOT NULL THEN
    IF v_new IN ('completada', 'cancelada') THEN
      UPDATE public.company_fleet_units
      SET estado_logistico = 'disponible'
      WHERE id = NEW.fleet_unit_id;
    ELSE
      UPDATE public.company_fleet_units
      SET estado_logistico = 'en_ruta'
      WHERE id = NEW.fleet_unit_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_freight_sync_fleet_unit ON public.freight_requests;
CREATE TRIGGER tr_freight_sync_fleet_unit
  AFTER INSERT OR UPDATE OF estado, fleet_unit_id ON public.freight_requests
  FOR EACH ROW
  EXECUTE PROCEDURE public.fn_freight_sync_fleet_unit();

CREATE OR REPLACE FUNCTION public.fn_freight_sync_fleet_unit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.fleet_unit_id IS NOT NULL THEN
    UPDATE public.company_fleet_units
    SET estado_logistico = 'disponible'
    WHERE id = OLD.fleet_unit_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_freight_sync_fleet_unit_delete ON public.freight_requests;
CREATE TRIGGER tr_freight_sync_fleet_unit_delete
  AFTER DELETE ON public.freight_requests
  FOR EACH ROW
  EXECUTE PROCEDURE public.fn_freight_sync_fleet_unit_delete();

COMMENT ON FUNCTION public.fn_freight_sync_fleet_unit() IS
  'Pone en_ruta la unidad al crear/activar un flete con fleet_unit_id; disponible al completar/cancelar o borrar.';
