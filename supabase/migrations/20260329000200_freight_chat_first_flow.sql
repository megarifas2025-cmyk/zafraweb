-- ================================================================
-- TRANSPORTE: flujo "chat primero, acuerdo después"
--
-- Antes: transportista postula → solicitante acepta → chat abre
-- Ahora: transportista contacta (abre chat) → hablan → solicitante
--        confirma manualmente → solicitud marcada como asignada
-- ================================================================

-- 1. Permitir múltiples salas por freight_request (una por transportista)
-- Eliminamos cualquier unique constraint sobre freight_request_id solo
DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'logistics_salas'
      AND constraint_type = 'UNIQUE'
      AND constraint_name NOT LIKE '%freight_request_id%transportista%'
      AND constraint_name NOT LIKE '%transportista%freight_request_id%'
  LOOP
    -- Solo eliminar si es un unique sobre freight_request_id solo
    IF EXISTS (
      SELECT 1
      FROM information_schema.key_column_usage
      WHERE table_name = 'logistics_salas'
        AND constraint_name = c
        AND column_name = 'freight_request_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.key_column_usage
      WHERE table_name = 'logistics_salas'
        AND constraint_name = c
        AND column_name = 'transportista_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.logistics_salas DROP CONSTRAINT %I', c);
    END IF;
  END LOOP;
END $$;

-- 2. Unique por par (freight_request_id, transportista_id) — una sala por transportista
ALTER TABLE public.logistics_salas
  DROP CONSTRAINT IF EXISTS logistics_salas_freight_transportista_unique;
ALTER TABLE public.logistics_salas
  ADD CONSTRAINT logistics_salas_freight_transportista_unique
    UNIQUE (freight_request_id, transportista_id);

-- 3. Columnas para cierre de trato
ALTER TABLE public.logistics_salas
  ADD COLUMN IF NOT EXISTS trato_cerrado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cerrado_en    TIMESTAMPTZ;

-- ================================================================
-- RPC: transportista abre sala de negociación previa
-- ================================================================
CREATE OR REPLACE FUNCTION public.iniciar_chat_transporte(
  p_freight_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requester_id     UUID;
  v_estado           TEXT;
  v_sala_id          UUID;
BEGIN
  -- Verificar que la solicitud existe y está abierta
  SELECT requester_id, estado
    INTO v_requester_id, v_estado
  FROM public.freight_requests
  WHERE id = p_freight_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de transporte no encontrada.';
  END IF;

  IF v_estado NOT IN ('abierta', 'con_postulaciones') THEN
    RAISE EXCEPTION 'Esta solicitud ya no está disponible para contactar (estado: %).', v_estado;
  END IF;

  IF v_requester_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes contactarte a ti mismo.';
  END IF;

  -- Si ya existe sala para este par, devolver la existente
  SELECT id INTO v_sala_id
  FROM public.logistics_salas
  WHERE freight_request_id = p_freight_request_id
    AND transportista_id   = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.logistics_salas (freight_request_id, requester_id, transportista_id)
    VALUES (p_freight_request_id, v_requester_id, auth.uid())
    RETURNING id INTO v_sala_id;

    -- Pasar a con_postulaciones cuando llega el primer contacto
    UPDATE public.freight_requests
    SET estado        = 'con_postulaciones',
        actualizado_en = NOW()
    WHERE id = p_freight_request_id AND estado = 'abierta';
  END IF;

  RETURN v_sala_id;
END;
$$;

-- ================================================================
-- RPC: solicitante confirma el transportista elegido
-- ================================================================
CREATE OR REPLACE FUNCTION public.confirmar_transportista_flete(
  p_sala_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_freight_id       UUID;
  v_transportista_id UUID;
  v_requester_id     UUID;
  v_estado           TEXT;
BEGIN
  SELECT freight_request_id, transportista_id, requester_id
    INTO v_freight_id, v_transportista_id, v_requester_id
  FROM public.logistics_salas
  WHERE id = p_sala_id AND trato_cerrado = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala no encontrada o trato ya fue cerrado anteriormente.';
  END IF;

  IF v_requester_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo el solicitante del transporte puede confirmar el acuerdo.';
  END IF;

  SELECT estado INTO v_estado
  FROM public.freight_requests WHERE id = v_freight_id;

  IF v_estado NOT IN ('abierta', 'con_postulaciones') THEN
    RAISE EXCEPTION 'Esta solicitud ya fue asignada o cancelada.';
  END IF;

  -- Cerrar esta sala (trato confirmado)
  UPDATE public.logistics_salas
  SET trato_cerrado = TRUE,
      cerrado_en    = NOW()
  WHERE id = p_sala_id;

  -- Marcar la solicitud como asignada al transportista elegido
  UPDATE public.freight_requests
  SET estado                    = 'asignada',
      assigned_transportista_id = v_transportista_id,
      tracking_status           = 'assigned_pending_prep',
      actualizado_en            = NOW()
  WHERE id = v_freight_id;
END;
$$;

-- ================================================================
-- Vista auxiliar: salas de un freight_request con nombre del transportista
-- (usada por el solicitante para ver quién lo contactó)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_logistics_salas_freight_req
  ON public.logistics_salas (freight_request_id);
