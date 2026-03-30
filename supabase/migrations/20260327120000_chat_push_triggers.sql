-- =============================================================================
-- Push fuera de app: al insertar mensaje en mercado o logística, encolar fila en
-- buyer_push_outbox (buyer_id = destinatario; reutiliza cola y Edge Function).
-- Requiere: perfiles.expo_push_token + process-buyer-push-outbox + cron/schedule.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_mensaje_mercado_enqueue_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.salas_chat%ROWTYPE;
  v_recipient uuid;
  v_preview text;
BEGIN
  SELECT * INTO v_sala FROM public.salas_chat WHERE id = NEW.sala_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.autor_id = v_sala.comprador_id THEN
    v_recipient := v_sala.agricultor_id;
  ELSIF NEW.autor_id = v_sala.agricultor_id THEN
    v_recipient := v_sala.comprador_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.autor_id THEN
    RETURN NEW;
  END IF;

  v_preview := left(trim(coalesce(NEW.contenido, '')), 120);
  IF length(v_preview) = 0 AND NEW.media_url IS NOT NULL THEN
    v_preview := 'Enviaron una imagen';
  END IF;

  INSERT INTO public.buyer_push_outbox (buyer_id, title, body, data)
  VALUES (
    v_recipient,
    'Chat Mercado',
    'Nuevo mensaje: ' || coalesce(nullif(v_preview, ''), '(mensaje)'),
    jsonb_build_object('tipo', 'chat_mercado', 'sala_id', NEW.sala_id::text)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mensaje_mercado_push ON public.mensajes;
CREATE TRIGGER trg_mensaje_mercado_push
  AFTER INSERT ON public.mensajes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_mensaje_mercado_enqueue_push();

CREATE OR REPLACE FUNCTION public.fn_logistics_mensaje_enqueue_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.logistics_salas%ROWTYPE;
  v_recipient uuid;
  v_preview text;
BEGIN
  SELECT * INTO v_sala FROM public.logistics_salas WHERE id = NEW.sala_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.autor_id = v_sala.requester_id THEN
    v_recipient := v_sala.transportista_id;
  ELSIF NEW.autor_id = v_sala.transportista_id THEN
    v_recipient := v_sala.requester_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.autor_id THEN
    RETURN NEW;
  END IF;

  v_preview := left(trim(coalesce(NEW.contenido, '')), 120);
  IF length(v_preview) = 0 AND NEW.media_url IS NOT NULL THEN
    v_preview := 'Enviaron una imagen';
  END IF;

  INSERT INTO public.buyer_push_outbox (buyer_id, title, body, data)
  VALUES (
    v_recipient,
    'Chat logística',
    'Nuevo mensaje: ' || coalesce(nullif(v_preview, ''), '(mensaje)'),
    jsonb_build_object('tipo', 'chat_logistica', 'sala_id', NEW.sala_id::text)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logistics_mensaje_push ON public.logistics_mensajes;
CREATE TRIGGER trg_logistics_mensaje_push
  AFTER INSERT ON public.logistics_mensajes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_logistics_mensaje_enqueue_push();
