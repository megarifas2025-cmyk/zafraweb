ALTER TYPE public.freight_request_estado ADD VALUE IF NOT EXISTS 'completada';

BEGIN;

ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS tracking_status TEXT;

UPDATE public.freight_requests
SET tracking_status = CASE
  WHEN estado::text = 'completada' THEN 'received'
  WHEN estado::text = 'asignada' AND driver_name IS NOT NULL THEN 'prepared'
  ELSE 'assigned_pending_prep'
END
WHERE tracking_status IS NULL;

ALTER TABLE public.freight_requests
  ALTER COLUMN tracking_status SET DEFAULT 'assigned_pending_prep';

ALTER TABLE public.freight_requests
  ALTER COLUMN tracking_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'freight_requests_tracking_status_chk'
  ) THEN
    ALTER TABLE public.freight_requests
      ADD CONSTRAINT freight_requests_tracking_status_chk CHECK (
        tracking_status IN (
          'assigned_pending_prep',
          'prepared',
          'departed_origin',
          'in_transit',
          'signal_lost',
          'arrived_destination',
          'received'
        )
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_freight_tracking_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester uuid;
  v_actor_name text;
BEGIN
  SELECT requester_id INTO v_requester
  FROM public.freight_requests
  WHERE id = NEW.freight_request_id;

  IF v_requester IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nombre INTO v_actor_name
  FROM public.perfiles
  WHERE id = NEW.actor_id;

  IF NEW.event_type = 'departed_origin' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'departed_origin',
          actualizado_en = NOW()
      WHERE id = NEW.freight_request_id
        AND tracking_status IN ('assigned_pending_prep', 'prepared');

    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_requester,
      'Tu carga va saliendo',
      COALESCE(v_actor_name, 'El chofer') || ' reportó salida desde el punto de carga. Ya puedes seguir la ruta en tiempo real.',
      NEW.freight_request_id
    );
  ELSIF NEW.event_type = 'location_ping' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'in_transit',
          actualizado_en = NOW()
      WHERE id = NEW.freight_request_id
        AND estado = 'asignada'
        AND tracking_status <> 'arrived_destination';
  ELSIF NEW.event_type = 'arrived_destination' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'arrived_destination',
          actualizado_en = NOW()
      WHERE id = NEW.freight_request_id;

    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_requester,
      'Tu carga llegó al destino',
      COALESCE(v_actor_name, 'El chofer') || ' confirmó la llegada de la mercancía al destino.',
      NEW.freight_request_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freight_tracking_notify ON public.freight_tracking_updates;
CREATE TRIGGER trg_freight_tracking_notify
  AFTER INSERT ON public.freight_tracking_updates
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_tracking_after_insert();

CREATE OR REPLACE FUNCTION public.fn_freight_request_after_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado::text = 'completada'
     AND COALESCE(OLD.estado::text, '') <> 'completada'
     AND NEW.assigned_transportista_id IS NOT NULL THEN
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      NEW.assigned_transportista_id,
      'Servicio cerrado por el cliente',
      'El cliente confirmó la recepción y cerró el viaje.',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freight_request_after_update ON public.freight_requests;
CREATE TRIGGER trg_freight_request_after_update
  AFTER UPDATE ON public.freight_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_request_after_update();

CREATE OR REPLACE FUNCTION public.assign_freight_execution(
  p_freight_id uuid,
  p_vehiculo_id uuid,
  p_driver_name text,
  p_driver_phone text,
  p_driver_document text,
  p_driver_has_app boolean,
  p_driver_has_gps boolean,
  p_driver_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.freight_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO v_req
  FROM public.freight_requests
  WHERE id = p_freight_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_req.assigned_transportista_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para preparar este servicio';
  END IF;

  IF v_req.estado <> 'asignada' THEN
    RAISE EXCEPTION 'Solo puedes preparar servicios asignados';
  END IF;

  IF p_vehiculo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vehiculos v
      WHERE v.id = p_vehiculo_id
        AND v.propietario_id = auth.uid()
        AND COALESCE(v.activo, TRUE) = TRUE
    ) THEN
      RAISE EXCEPTION 'El vehículo seleccionado no pertenece a tu flota activa';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.vehiculo_id = p_vehiculo_id
        AND fr.id <> p_freight_id
        AND fr.estado = 'asignada'
    ) THEN
      RAISE EXCEPTION 'Ese vehículo ya tiene otro servicio activo';
    END IF;
  END IF;

  IF NULLIF(btrim(COALESCE(p_driver_document, '')), '') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.driver_document = NULLIF(btrim(p_driver_document), '')
        AND fr.id <> p_freight_id
        AND fr.estado = 'asignada'
    ) THEN
      RAISE EXCEPTION 'Ese chofer ya figura en otro servicio activo';
    END IF;
  END IF;

  UPDATE public.freight_requests
  SET vehiculo_id = p_vehiculo_id,
      driver_name = NULLIF(btrim(COALESCE(p_driver_name, '')), ''),
      driver_phone = NULLIF(btrim(COALESCE(p_driver_phone, '')), ''),
      driver_document = NULLIF(btrim(COALESCE(p_driver_document, '')), ''),
      driver_has_app = p_driver_has_app,
      driver_has_gps = p_driver_has_gps,
      driver_notes = NULLIF(btrim(COALESCE(p_driver_notes, '')), ''),
      tracking_status = 'prepared',
      actualizado_en = NOW()
  WHERE id = p_freight_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_freight_signal_status(
  p_freight_id uuid,
  p_stale_minutes integer DEFAULT 3
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.freight_requests%ROWTYPE;
  v_latest public.freight_tracking_updates%ROWTYPE;
  v_previous_status text;
  v_should_signal boolean := false;
BEGIN
  SELECT *
  INTO v_req
  FROM public.freight_requests
  WHERE id = p_freight_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_req.requester_id
     AND auth.uid() IS DISTINCT FROM v_req.assigned_transportista_id THEN
    RAISE EXCEPTION 'No autorizado para sincronizar este servicio';
  END IF;

  IF v_req.estado <> 'asignada' THEN
    RETURN;
  END IF;

  IF v_req.tracking_status IN ('arrived_destination', 'received') THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_latest
  FROM public.freight_tracking_updates
  WHERE freight_request_id = p_freight_id
  ORDER BY creado_en DESC
  LIMIT 1;

  IF v_latest.id IS NULL THEN
    RETURN;
  END IF;

  v_previous_status := v_req.tracking_status;
  v_should_signal :=
    v_latest.event_type <> 'arrived_destination'
    AND v_latest.creado_en < NOW() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 3), 1));

  IF v_should_signal AND v_req.tracking_status <> 'signal_lost' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'signal_lost',
          actualizado_en = NOW()
      WHERE id = p_freight_id;

    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_req.requester_id,
      'Servicio sin señal',
      'El viaje dejó de reportar ubicación reciente. Revisa el estado del chofer o contacta al transportista.',
      p_freight_id
    );

    IF v_req.assigned_transportista_id IS NOT NULL THEN
      INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
      VALUES (
        v_req.assigned_transportista_id,
        'Tu servicio quedó sin señal',
        'La aplicación detectó falta de reportes recientes. Reactiva GPS y vuelve a abrir la ruta si es necesario.',
        p_freight_id
      );
    END IF;
    RETURN;
  END IF;

  IF NOT v_should_signal AND v_previous_status = 'signal_lost' THEN
    UPDATE public.freight_requests
      SET tracking_status = CASE
        WHEN v_latest.event_type = 'departed_origin' THEN 'departed_origin'
        WHEN v_latest.event_type = 'arrived_destination' THEN 'arrived_destination'
        ELSE 'in_transit'
      END,
          actualizado_en = NOW()
      WHERE id = p_freight_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_freight_execution(uuid, uuid, text, text, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_freight_execution(uuid, uuid, text, text, text, boolean, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_freight_signal_status(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_freight_signal_status(uuid, integer) TO authenticated;

COMMIT;
