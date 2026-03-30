-- ============================================================
-- 1. Agrotienda: columna stock_actual en agricultural_inputs
-- ============================================================
ALTER TABLE public.agricultural_inputs
  ADD COLUMN IF NOT EXISTS stock_actual INT DEFAULT NULL CHECK (stock_actual IS NULL OR stock_actual >= 0);

COMMENT ON COLUMN public.agricultural_inputs.stock_actual IS
  'Unidades en inventario. NULL = sin control de stock. 0 = agotado (auto-pausa).';

-- Auto-desactivar cuando stock llega a 0
CREATE OR REPLACE FUNCTION public.fn_agrotienda_auto_pause_on_zero_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_actual IS NOT NULL AND NEW.stock_actual = 0 THEN
    NEW.disponibilidad := FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agrotienda_auto_pause ON public.agricultural_inputs;
CREATE TRIGGER trg_agrotienda_auto_pause
  BEFORE UPDATE ON public.agricultural_inputs
  FOR EACH ROW EXECUTE FUNCTION public.fn_agrotienda_auto_pause_on_zero_stock();

-- RPC: decrementar stock desde el chat de negociación
-- Solo puede llamarlo el dueño del producto (perfil_id = auth.uid())
CREATE OR REPLACE FUNCTION public.decrementar_stock_insumo(
  p_insumo_id UUID,
  p_cantidad  INT DEFAULT 1
)
RETURNS TABLE(stock_restante INT, disponible BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock INT;
  v_disp  BOOLEAN;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0.';
  END IF;

  SELECT stock_actual, disponibilidad INTO v_stock, v_disp
  FROM public.agricultural_inputs
  WHERE id = p_insumo_id AND perfil_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado o sin permiso.';
  END IF;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Este producto no tiene control de stock activado.';
  END IF;

  IF v_stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente (disponible: %).', v_stock;
  END IF;

  UPDATE public.agricultural_inputs
  SET stock_actual = stock_actual - p_cantidad,
      actualizado_en = NOW()
  WHERE id = p_insumo_id;

  SELECT stock_actual, disponibilidad INTO v_stock, v_disp
  FROM public.agricultural_inputs WHERE id = p_insumo_id;

  RETURN QUERY SELECT v_stock, v_disp;
END;
$$;

-- ============================================================
-- 2. Transporte: estado inicial correcto para freight_requests
--    nuevas: la columna ya existe, solo garantizamos el default
-- ============================================================
ALTER TABLE public.freight_requests
  ALTER COLUMN estado SET DEFAULT 'abierta';

-- Aseguramos que tracking_status tenga default NULL en requests nuevas
ALTER TABLE public.freight_requests
  ALTER COLUMN tracking_status DROP DEFAULT;

-- ============================================================
-- 3. Transporte: trigger para pasar a 'con_postulaciones'
--    cuando llega la primera postulación
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_freight_mark_con_postulaciones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.freight_requests
  SET estado = 'con_postulaciones',
      actualizado_en = NOW()
  WHERE id = NEW.freight_request_id
    AND estado = 'abierta';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freight_postulacion ON public.freight_request_applications;
CREATE TRIGGER trg_freight_postulacion
  AFTER INSERT ON public.freight_request_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_mark_con_postulaciones();

-- ============================================================
-- 4. Pizarra: también mostrar 'asignada' recientes (< 3h)
--    Esto lo maneja la app con un query ampliado; aquí solo
--    garantizamos el índice para que sea rápido.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_freight_requests_estado_actualizado
  ON public.freight_requests (estado, actualizado_en DESC);
