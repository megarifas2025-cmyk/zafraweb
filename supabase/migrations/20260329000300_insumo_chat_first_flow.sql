-- ================================================================
-- AGROTIENDA: flujo "chat primero, venta después"
--
-- Comprador abre chat sobre un insumo específico → negocian →
-- vendedor (agrotienda) confirma la venta manualmente →
-- stock se decrementa automáticamente
-- ================================================================

-- 1. Tabla de salas de negociación para insumos
CREATE TABLE IF NOT EXISTS public.salas_insumos_chat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id     UUID NOT NULL REFERENCES public.agricultural_inputs(id) ON DELETE CASCADE,
  buyer_id      UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  vendedor_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  venta_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
  confirmada_en TIMESTAMPTZ,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT salas_insumos_chat_insumo_buyer_unique UNIQUE (insumo_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_salas_insumos_buyer
  ON public.salas_insumos_chat (buyer_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_salas_insumos_vendedor
  ON public.salas_insumos_chat (vendedor_id, creado_en DESC);

-- 2. Tabla de mensajes dentro de cada sala
CREATE TABLE IF NOT EXISTS public.mensajes_insumos_chat (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id    UUID NOT NULL REFERENCES public.salas_insumos_chat(id) ON DELETE CASCADE,
  autor_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contenido  TEXT,
  tipo       TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagen')),
  media_url  TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_insumos_sala
  ON public.mensajes_insumos_chat (sala_id, creado_en ASC);

-- 3. RLS
ALTER TABLE public.salas_insumos_chat   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_insumos_chat ENABLE ROW LEVEL SECURITY;

-- Salas: solo los participantes pueden ver y crear
DROP POLICY IF EXISTS "insumo_sala_participantes_select" ON public.salas_insumos_chat;
CREATE POLICY "insumo_sala_participantes_select" ON public.salas_insumos_chat FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = vendedor_id);

DROP POLICY IF EXISTS "insumo_sala_buyer_insert" ON public.salas_insumos_chat;
CREATE POLICY "insumo_sala_buyer_insert" ON public.salas_insumos_chat FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "insumo_sala_vendedor_update" ON public.salas_insumos_chat;
CREATE POLICY "insumo_sala_vendedor_update" ON public.salas_insumos_chat FOR UPDATE
  USING (auth.uid() = vendedor_id);

DROP POLICY IF EXISTS "insumo_sala_ceo_all" ON public.salas_insumos_chat;
CREATE POLICY "insumo_sala_ceo_all" ON public.salas_insumos_chat FOR ALL
  USING (public.is_zafra_ceo());

-- Mensajes: solo participantes de la sala
DROP POLICY IF EXISTS "insumo_msg_participantes_select" ON public.mensajes_insumos_chat;
CREATE POLICY "insumo_msg_participantes_select" ON public.mensajes_insumos_chat FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.salas_insumos_chat s
      WHERE s.id = sala_id
        AND (s.buyer_id = auth.uid() OR s.vendedor_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insumo_msg_participantes_insert" ON public.mensajes_insumos_chat;
CREATE POLICY "insumo_msg_participantes_insert" ON public.mensajes_insumos_chat FOR INSERT
  WITH CHECK (
    auth.uid() = autor_id AND
    EXISTS (
      SELECT 1 FROM public.salas_insumos_chat s
      WHERE s.id = sala_id
        AND (s.buyer_id = auth.uid() OR s.vendedor_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insumo_msg_ceo_all" ON public.mensajes_insumos_chat;
CREATE POLICY "insumo_msg_ceo_all" ON public.mensajes_insumos_chat FOR ALL
  USING (public.is_zafra_ceo());

-- ================================================================
-- RPC: comprador inicia sala de consulta sobre un insumo
-- ================================================================
CREATE OR REPLACE FUNCTION public.iniciar_chat_insumo(
  p_insumo_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vendedor_id UUID;
  v_disponible  BOOLEAN;
  v_sala_id     UUID;
BEGIN
  -- Verificar que el insumo existe y está disponible
  SELECT perfil_id, disponibilidad
    INTO v_vendedor_id, v_disponible
  FROM public.agricultural_inputs
  WHERE id = p_insumo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado.';
  END IF;

  IF NOT v_disponible THEN
    RAISE EXCEPTION 'Este producto no está disponible actualmente.';
  END IF;

  IF v_vendedor_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes consultar sobre tu propio producto.';
  END IF;

  -- Devolver sala existente o crear nueva
  SELECT id INTO v_sala_id
  FROM public.salas_insumos_chat
  WHERE insumo_id = p_insumo_id
    AND buyer_id  = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.salas_insumos_chat (insumo_id, buyer_id, vendedor_id)
    VALUES (p_insumo_id, auth.uid(), v_vendedor_id)
    RETURNING id INTO v_sala_id;
  END IF;

  RETURN v_sala_id;
END;
$$;

-- ================================================================
-- RPC: vendedor confirma la venta (cierra el trato)
-- ================================================================
CREATE OR REPLACE FUNCTION public.confirmar_venta_insumo(
  p_sala_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_insumo_id  UUID;
  v_vendedor_id UUID;
  v_stock      INT;
BEGIN
  SELECT insumo_id, vendedor_id
    INTO v_insumo_id, v_vendedor_id
  FROM public.salas_insumos_chat
  WHERE id = p_sala_id AND venta_confirmada = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala no encontrada o venta ya confirmada anteriormente.';
  END IF;

  IF v_vendedor_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo el vendedor puede confirmar la venta.';
  END IF;

  -- Marcar sala como confirmada
  UPDATE public.salas_insumos_chat
  SET venta_confirmada = TRUE,
      confirmada_en    = NOW()
  WHERE id = p_sala_id;

  -- Decrementar stock si el insumo tiene control de stock
  SELECT stock_actual INTO v_stock
  FROM public.agricultural_inputs
  WHERE id = v_insumo_id;

  IF v_stock IS NOT NULL THEN
    -- Usa el RPC existente de stock (de la migración 20260329000100)
    PERFORM public.decrementar_stock_insumo(v_insumo_id, 1);
  END IF;
END;
$$;

-- ================================================================
-- RPC: listar salas del vendedor con info del insumo y último mensaje
-- ================================================================
CREATE OR REPLACE FUNCTION public.listar_salas_insumos_vendedor(
  p_vendedor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  sala_id          UUID,
  insumo_id        UUID,
  nombre_producto  TEXT,
  buyer_id         UUID,
  buyer_nombre     TEXT,
  venta_confirmada BOOLEAN,
  confirmada_en    TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ,
  ultimo_mensaje   TEXT,
  ultimo_mensaje_en TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := COALESCE(p_vendedor_id, auth.uid());
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.insumo_id,
    ai.nombre_producto,
    s.buyer_id,
    p.nombre,
    s.venta_confirmada,
    s.confirmada_en,
    s.creado_en,
    m.contenido,
    m.creado_en
  FROM public.salas_insumos_chat s
  JOIN public.agricultural_inputs ai ON ai.id = s.insumo_id
  JOIN public.perfiles p             ON p.id  = s.buyer_id
  LEFT JOIN LATERAL (
    SELECT contenido, creado_en
    FROM public.mensajes_insumos_chat
    WHERE sala_id = s.id
    ORDER BY creado_en DESC
    LIMIT 1
  ) m ON TRUE
  WHERE s.vendedor_id = v_uid
  ORDER BY COALESCE(m.creado_en, s.creado_en) DESC;
END;
$$;
