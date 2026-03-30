-- =============================================================================
-- ZafraClic — confianza logística
-- 1) campos extra de vehículos de carga
-- 2) tracking real por flete: saliendo / en ruta / llegó
-- =============================================================================

ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS carroceria TEXT,
  ADD COLUMN IF NOT EXISTS ejes INTEGER;

CREATE TABLE IF NOT EXISTS public.freight_tracking_updates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freight_request_id UUID NOT NULL REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  actor_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  actor_role         rol_usuario NOT NULL,
  event_type         TEXT NOT NULL CHECK (event_type IN ('departed_origin', 'location_ping', 'arrived_destination')),
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  accuracy_m         NUMERIC(8,2),
  label              TEXT,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freight_tracking_req ON public.freight_tracking_updates(freight_request_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_freight_tracking_actor ON public.freight_tracking_updates(actor_id, creado_en DESC);

ALTER TABLE public.freight_tracking_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freight_tracking_select_parties" ON public.freight_tracking_updates;
CREATE POLICY "freight_tracking_select_parties" ON public.freight_tracking_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.id = freight_tracking_updates.freight_request_id
        AND (
          fr.requester_id = auth.uid()
          OR fr.assigned_transportista_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "freight_tracking_insert_assigned_transportista" ON public.freight_tracking_updates;
CREATE POLICY "freight_tracking_insert_assigned_transportista" ON public.freight_tracking_updates FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.id = freight_request_id
        AND fr.assigned_transportista_id = auth.uid()
        AND fr.estado = 'asignada'
    )
  );

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
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_requester,
      'Tu carga va saliendo',
      COALESCE(v_actor_name, 'El chofer') || ' reportó salida desde el punto de carga. Ya puedes seguir la ruta en tiempo real.',
      NEW.freight_request_id
    );
  ELSIF NEW.event_type = 'arrived_destination' THEN
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
