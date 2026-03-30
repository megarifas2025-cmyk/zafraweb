-- Pizarra de fletes (freight_requests) + postulaciones + notificaciones + chat logística
-- Ejecutar en Supabase SQL Editor (proyecto que ya tiene schema base).
-- Enums idempotentes (re-ejecutar no falla si ya existen).

DO $$ BEGIN
  CREATE TYPE freight_request_estado AS ENUM ('abierta','con_postulaciones','asignada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE freight_application_estado AS ENUM ('pendiente','aceptada','rechazada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.freight_requests (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id              UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  requester_role            rol_usuario NOT NULL,
  tipo_servicio             TEXT NOT NULL,
  origen_estado             TEXT NOT NULL,
  origen_municipio          TEXT NOT NULL,
  destino_estado            TEXT,
  destino_municipio         TEXT,
  fecha_necesaria           DATE NOT NULL,
  descripcion               TEXT,
  peso_estimado_kg          NUMERIC(12,2),
  estado                    freight_request_estado NOT NULL DEFAULT 'abierta',
  assigned_transportista_id UUID REFERENCES public.perfiles(id),
  creado_en                 TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT freight_request_generador_rol_chk CHECK (
    requester_role IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_freight_req_estado_muni ON public.freight_requests(estado, origen_municipio, fecha_necesaria DESC);
CREATE INDEX IF NOT EXISTS idx_freight_req_requester ON public.freight_requests(requester_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.freight_request_applications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freight_request_id UUID NOT NULL REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  transportista_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  mensaje            TEXT,
  estado             freight_application_estado NOT NULL DEFAULT 'pendiente',
  creado_en          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(freight_request_id, transportista_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_app_request ON public.freight_request_applications(freight_request_id);
CREATE INDEX IF NOT EXISTS idx_freight_app_transportista ON public.freight_request_applications(transportista_id);

CREATE TABLE IF NOT EXISTS public.logistics_salas (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freight_request_id UUID NOT NULL UNIQUE REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  requester_id       UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  transportista_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logistics_mensajes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sala_id    UUID NOT NULL REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  autor_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contenido  TEXT NOT NULL,
  creado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_msg_sala ON public.logistics_mensajes(sala_id, creado_en);

CREATE TABLE IF NOT EXISTS public.freight_request_notifications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  titulo             TEXT NOT NULL,
  cuerpo             TEXT NOT NULL,
  freight_request_id UUID REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  application_id     UUID REFERENCES public.freight_request_applications(id) ON DELETE CASCADE,
  leida              BOOLEAN DEFAULT FALSE,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freight_notif_user ON public.freight_request_notifications(user_id, leida, creado_en DESC);

CREATE OR REPLACE FUNCTION public.fn_freight_application_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.freight_requests
    SET estado = 'con_postulaciones', actualizado_en = NOW()
    WHERE id = NEW.freight_request_id AND estado = 'abierta';
  INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id, application_id)
  SELECT r.requester_id,
    'Postulación a tu solicitud de transporte',
    COALESCE((SELECT nombre FROM public.perfiles WHERE id = NEW.transportista_id), 'Un transportista') || ' se postuló.',
    r.id,
    NEW.id
  FROM public.freight_requests r WHERE r.id = NEW.freight_request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freight_application_notify ON public.freight_request_applications;
CREATE TRIGGER trg_freight_application_notify
  AFTER INSERT ON public.freight_request_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_application_after_insert();

ALTER TABLE public.freight_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freight_req_zafra_ceo" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_insert_generadores" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_select_own" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_select_transporter_abierta" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_select_asignado" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_update_requester" ON public.freight_requests;

CREATE POLICY "freight_req_zafra_ceo" ON public.freight_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "freight_req_insert_generadores" ON public.freight_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_role = (SELECT rol FROM public.perfiles p WHERE p.id = auth.uid())
    AND (SELECT rol FROM public.perfiles p WHERE p.id = auth.uid()) IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  );
CREATE POLICY "freight_req_select_own" ON public.freight_requests FOR SELECT
  USING (requester_id = auth.uid());
CREATE POLICY "freight_req_select_transporter_abierta" ON public.freight_requests FOR SELECT
  USING (
    estado IN ('abierta','con_postulaciones')
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'transporter' AND p.kyc_estado = 'verified'
    )
  );
CREATE POLICY "freight_req_select_asignado" ON public.freight_requests FOR SELECT
  USING (assigned_transportista_id = auth.uid());
CREATE POLICY "freight_req_update_requester" ON public.freight_requests FOR UPDATE
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS "freight_app_zafra_ceo" ON public.freight_request_applications;
DROP POLICY IF EXISTS "freight_app_insert_transportista" ON public.freight_request_applications;
DROP POLICY IF EXISTS "freight_app_select_parties" ON public.freight_request_applications;
DROP POLICY IF EXISTS "freight_app_update_requester" ON public.freight_request_applications;

CREATE POLICY "freight_app_zafra_ceo" ON public.freight_request_applications FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "freight_app_insert_transportista" ON public.freight_request_applications FOR INSERT
  WITH CHECK (
    transportista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'transporter' AND p.kyc_estado = 'verified'
    )
    AND EXISTS (
      SELECT 1 FROM public.freight_requests r
      WHERE r.id = freight_request_id AND r.estado IN ('abierta','con_postulaciones')
    )
  );
CREATE POLICY "freight_app_select_parties" ON public.freight_request_applications FOR SELECT
  USING (
    transportista_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.freight_requests r
      WHERE r.id = freight_request_id AND r.requester_id = auth.uid()
    )
  );
CREATE POLICY "freight_app_update_requester" ON public.freight_request_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.freight_requests r
      WHERE r.id = freight_request_id AND r.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "freight_notif_select_own" ON public.freight_request_notifications;
DROP POLICY IF EXISTS "freight_notif_update_own" ON public.freight_request_notifications;

CREATE POLICY "freight_notif_select_own" ON public.freight_request_notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "freight_notif_update_own" ON public.freight_request_notifications FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "logistics_sala_zafra_ceo" ON public.logistics_salas;
DROP POLICY IF EXISTS "logistics_sala_select_parties" ON public.logistics_salas;
DROP POLICY IF EXISTS "logistics_sala_insert_requester" ON public.logistics_salas;

CREATE POLICY "logistics_sala_zafra_ceo" ON public.logistics_salas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "logistics_sala_select_parties" ON public.logistics_salas FOR SELECT
  USING (requester_id = auth.uid() OR transportista_id = auth.uid());
CREATE POLICY "logistics_sala_insert_requester" ON public.logistics_salas FOR INSERT
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "logistics_msg_zafra_ceo" ON public.logistics_mensajes;
DROP POLICY IF EXISTS "logistics_msg_select_parties" ON public.logistics_mensajes;
DROP POLICY IF EXISTS "logistics_msg_insert_parties" ON public.logistics_mensajes;

CREATE POLICY "logistics_msg_zafra_ceo" ON public.logistics_mensajes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "logistics_msg_select_parties" ON public.logistics_mensajes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.logistics_salas s
      WHERE s.id = sala_id AND (s.requester_id = auth.uid() OR s.transportista_id = auth.uid())
    )
  );
CREATE POLICY "logistics_msg_insert_parties" ON public.logistics_mensajes FOR INSERT
  WITH CHECK (
    autor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.logistics_salas s
      WHERE s.id = sala_id AND (s.requester_id = auth.uid() OR s.transportista_id = auth.uid())
    )
  );
