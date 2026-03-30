-- Chat governance hardening:
-- 1) soporte de imagen en chats comercial/logístico
-- 2) moderación preventiva con bloqueo
-- 3) incidentes/reportes para panel CEO
-- 4) alertas in-app hacia cuentas zafra_ceo

ALTER TABLE IF EXISTS public.logistics_mensajes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS media_url TEXT;

ALTER TABLE IF EXISTS public.mensajes
  ADD COLUMN IF NOT EXISTS media_url TEXT;

CREATE TABLE IF NOT EXISTS public.chat_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL CHECK (source IN ('market', 'logistics')),
  sala_id           UUID REFERENCES public.salas_chat(id) ON DELETE CASCADE,
  logistics_sala_id UUID REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  reported_by       UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  offender_id       UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  category          TEXT NOT NULL CHECK (category IN ('fraud_attempt', 'obscene_language', 'threat', 'fake_document', 'unsafe_payment', 'manual_report', 'other')),
  severity          TEXT NOT NULL CHECK (severity IN ('media', 'alta', 'critica')),
  message_excerpt   TEXT,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  auto_detected     BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_incidents_created_at ON public.chat_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_incidents_status ON public.chat_incidents(status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_incidents_one_chat_ref'
  ) THEN
    ALTER TABLE public.chat_incidents
      ADD CONSTRAINT chat_incidents_one_chat_ref CHECK (
        (sala_id IS NOT NULL AND logistics_sala_id IS NULL)
        OR (sala_id IS NULL AND logistics_sala_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.detect_chat_policy_violation(p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text := lower(trim(coalesce(p_content, '')));
BEGIN
  IF v_text = '' THEN
    RETURN NULL;
  END IF;

  IF v_text ~ '(maldito|maldita|mierda|coño|carajo|puta|puto|marico|marica|hijo de puta|mamaguevo)' THEN
    RETURN jsonb_build_object('category', 'obscene_language', 'severity', 'alta', 'message', 'No puedes usar lenguaje ofensivo u obsceno dentro del chat.');
  END IF;

  IF v_text ~ '(te voy a matar|te voy a joder|te voy a caer|vas a pagar|te voy a buscar|te voy a romper)' THEN
    RETURN jsonb_build_object('category', 'threat', 'severity', 'critica', 'message', 'No puedes enviar amenazas o intimidaciones dentro del chat.');
  END IF;

  IF v_text ~ '(transfiere ya|paga ya|dep[oó]sito inmediato|env[ií]a el dinero|hazme la transferencia|sin garant[ií]a|sin factura|sin respaldo)' THEN
    RETURN jsonb_build_object('category', 'fraud_attempt', 'severity', 'critica', 'message', 'Ese mensaje parece un intento de fraude o manipulación de pago y no puede enviarse.');
  END IF;

  IF v_text ~ '(adelanto completo|pago por fuera|sin verificaci[oó]n|sin soporte|sin revisarlo)' THEN
    RETURN jsonb_build_object('category', 'unsafe_payment', 'severity', 'alta', 'message', 'Evita presionar pagos inseguros o sin respaldo dentro del chat.');
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_zafra_ceo_chat_alert(p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, leida)
  SELECT p.id, p_title, p_body, FALSE
  FROM public.perfiles p
  WHERE p.rol = 'zafra_ceo'::rol_usuario
    AND COALESCE(p.activo, TRUE) = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_market_chat_message(
  p_sala_id uuid,
  p_contenido text,
  p_tipo text DEFAULT 'texto',
  p_media_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.salas_chat%ROWTYPE;
  v_violation jsonb;
  v_msg_id uuid;
  v_excerpt text := left(trim(coalesce(p_contenido, '')), 240);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO v_sala FROM public.salas_chat WHERE id = p_sala_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala no encontrada';
  END IF;
  IF auth.uid() NOT IN (v_sala.comprador_id, v_sala.agricultor_id) THEN
    RAISE EXCEPTION 'No autorizado para escribir en esta sala';
  END IF;
  IF p_tipo = 'imagen' AND coalesce(trim(p_media_url), '') = '' THEN
    RAISE EXCEPTION 'Debes adjuntar una imagen válida.';
  END IF;

  v_violation := public.detect_chat_policy_violation(p_contenido);
  IF v_violation IS NOT NULL THEN
    INSERT INTO public.chat_incidents (source, sala_id, reported_by, offender_id, category, severity, message_excerpt, reason, auto_detected, status)
    VALUES ('market', p_sala_id, auth.uid(), auth.uid(), v_violation->>'category', v_violation->>'severity', v_excerpt, v_violation->>'message', TRUE, 'open');
    PERFORM public.notify_zafra_ceo_chat_alert('Alerta automática de chat comercial', format('Se bloqueó un mensaje por %s en una negociación comercial.', v_violation->>'category'));
    RAISE EXCEPTION '%', 'CHAT_POLICY_BLOCK:' || (v_violation->>'message');
  END IF;

  INSERT INTO public.mensajes (sala_id, autor_id, contenido, nonce, tipo, media_url)
  VALUES (p_sala_id, auth.uid(), trim(coalesce(p_contenido, '')), '__plain__', coalesce(nullif(trim(p_tipo), ''), 'texto'), nullif(trim(coalesce(p_media_url, '')), ''))
  RETURNING id INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_logistics_chat_message(
  p_sala_id uuid,
  p_contenido text,
  p_tipo text DEFAULT 'texto',
  p_media_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.logistics_salas%ROWTYPE;
  v_violation jsonb;
  v_msg_id uuid;
  v_excerpt text := left(trim(coalesce(p_contenido, '')), 240);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO v_sala FROM public.logistics_salas WHERE id = p_sala_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala logística no encontrada';
  END IF;
  IF auth.uid() NOT IN (v_sala.requester_id, v_sala.transportista_id) THEN
    RAISE EXCEPTION 'No autorizado para escribir en esta sala logística';
  END IF;
  IF p_tipo = 'imagen' AND coalesce(trim(p_media_url), '') = '' THEN
    RAISE EXCEPTION 'Debes adjuntar una imagen válida.';
  END IF;

  v_violation := public.detect_chat_policy_violation(p_contenido);
  IF v_violation IS NOT NULL THEN
    INSERT INTO public.chat_incidents (source, logistics_sala_id, reported_by, offender_id, category, severity, message_excerpt, reason, auto_detected, status)
    VALUES ('logistics', p_sala_id, auth.uid(), auth.uid(), v_violation->>'category', v_violation->>'severity', v_excerpt, v_violation->>'message', TRUE, 'open');
    PERFORM public.notify_zafra_ceo_chat_alert('Alerta automática de chat logístico', format('Se bloqueó un mensaje por %s en una coordinación logística.', v_violation->>'category'));
    RAISE EXCEPTION '%', 'CHAT_POLICY_BLOCK:' || (v_violation->>'message');
  END IF;

  INSERT INTO public.logistics_mensajes (sala_id, autor_id, contenido, tipo, media_url)
  VALUES (p_sala_id, auth.uid(), trim(coalesce(p_contenido, '')), coalesce(nullif(trim(p_tipo), ''), 'texto'), nullif(trim(coalesce(p_media_url, '')), ''))
  RETURNING id INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_chat_incident(
  p_source text,
  p_sala_id uuid DEFAULT NULL,
  p_logistics_sala_id uuid DEFAULT NULL,
  p_offender_id uuid DEFAULT NULL,
  p_category text DEFAULT 'manual_report',
  p_severity text DEFAULT 'media',
  p_reason text DEFAULT NULL,
  p_message_excerpt text DEFAULT NULL,
  p_auto_detected boolean DEFAULT FALSE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  INSERT INTO public.chat_incidents (source, sala_id, logistics_sala_id, reported_by, offender_id, category, severity, reason, message_excerpt, auto_detected, status)
  VALUES (p_source, p_sala_id, p_logistics_sala_id, auth.uid(), p_offender_id, p_category, p_severity, p_reason, p_message_excerpt, p_auto_detected, 'open')
  RETURNING id INTO v_id;

  PERFORM public.notify_zafra_ceo_chat_alert('Nuevo reporte de chat', format('Se registró un incidente manual en un chat %s.', p_source));
  RETURN v_id;
END;
$$;

ALTER TABLE public.chat_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_incidents_zafra_ceo_select" ON public.chat_incidents;
DROP POLICY IF EXISTS "chat_incidents_zafra_ceo_update" ON public.chat_incidents;

CREATE POLICY "chat_incidents_zafra_ceo_select" ON public.chat_incidents FOR SELECT
  USING (public.is_zafra_ceo());

CREATE POLICY "chat_incidents_zafra_ceo_update" ON public.chat_incidents FOR UPDATE
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

REVOKE ALL ON FUNCTION public.detect_chat_policy_violation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_zafra_ceo_chat_alert(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_market_chat_message(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_logistics_chat_message(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_chat_incident(text, uuid, uuid, uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_market_chat_message(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_logistics_chat_message(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_chat_incident(text, uuid, uuid, uuid, text, text, text, text, boolean) TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public;

DROP POLICY IF EXISTS "chat_media_auth_own_all" ON storage.objects;
CREATE POLICY "chat_media_auth_own_all"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'chat-media' AND split_part(name, '/', 1) = auth.uid()::text)
WITH CHECK (bucket_id = 'chat-media' AND split_part(name, '/', 1) = auth.uid()::text);
