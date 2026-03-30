-- ================================================================
-- Acuerdo mutuo para cierre de trato en insumos/agrotienda
--
-- Flujo nuevo:
--   1. Vendedor presiona "Proponer cierre" → vendedor_propuso = TRUE
--   2. Comprador ve la propuesta y presiona "Aceptar el trato"
--      → venta_confirmada = TRUE + stock decrementado
-- ================================================================

-- 1. Agregar columna vendedor_propuso
ALTER TABLE public.salas_insumos_chat
  ADD COLUMN IF NOT EXISTS vendedor_propuso BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. RPC: el vendedor propone cerrar el trato (no confirma aún)
CREATE OR REPLACE FUNCTION public.vendedor_proponer_cierre_insumo(
  p_sala_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.salas_insumos_chat
  SET vendedor_propuso = TRUE
  WHERE id = p_sala_id
    AND vendedor_id = auth.uid()
    AND venta_confirmada = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala no encontrada o ya tienes el trato confirmado / no tienes permiso.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendedor_proponer_cierre_insumo(UUID) TO authenticated;

-- 3. Actualizar confirmar_venta_insumo: ahora solo lo llama el COMPRADOR
--    y requiere que el vendedor haya propuesto primero.
CREATE OR REPLACE FUNCTION public.confirmar_venta_insumo(
  p_sala_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_insumo_id   UUID;
  v_vendedor_id UUID;
  v_buyer_id    UUID;
  v_stock       INT;
  v_propuso     BOOLEAN;
BEGIN
  SELECT insumo_id, vendedor_id, buyer_id, vendedor_propuso
    INTO v_insumo_id, v_vendedor_id, v_buyer_id, v_propuso
  FROM public.salas_insumos_chat
  WHERE id = p_sala_id AND venta_confirmada = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala no encontrada o el trato ya fue confirmado anteriormente.';
  END IF;

  IF v_buyer_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo el comprador puede confirmar la compra.';
  END IF;

  IF NOT v_propuso THEN
    RAISE EXCEPTION 'El vendedor todavía no ha propuesto el cierre del trato.';
  END IF;

  -- Cerrar el trato
  UPDATE public.salas_insumos_chat
  SET venta_confirmada = TRUE,
      confirmada_en    = NOW()
  WHERE id = p_sala_id;

  -- Decrementar stock si tiene control de stock
  SELECT stock_actual INTO v_stock
  FROM public.agricultural_inputs
  WHERE id = v_insumo_id;

  IF v_stock IS NOT NULL THEN
    PERFORM public.decrementar_stock_insumo(v_insumo_id, 1);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_venta_insumo(UUID) TO authenticated;
