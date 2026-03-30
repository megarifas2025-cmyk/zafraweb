-- ================================================================
-- Ratings para transporte: calificar transportista post-viaje
-- ================================================================

-- 1. Agregar columna freight_request_id a la tabla de calificaciones
ALTER TABLE public.calificaciones
  ADD COLUMN IF NOT EXISTS freight_request_id UUID REFERENCES public.freight_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calificaciones_freight
  ON public.calificaciones (freight_request_id)
  WHERE freight_request_id IS NOT NULL;

-- 2. RPC: calificar al transportista desde un flete completado
CREATE OR REPLACE FUNCTION public.rate_transporter_from_freight(
  p_freight_id UUID,
  p_puntaje    INT,
  p_comentario TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requester_id      UUID;
  v_transportista_id  UUID;
  v_estado            TEXT;
BEGIN
  SELECT requester_id, assigned_transportista_id, estado
    INTO v_requester_id, v_transportista_id, v_estado
  FROM public.freight_requests
  WHERE id = p_freight_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de transporte no encontrada.';
  END IF;

  IF v_requester_id != auth.uid() THEN
    RAISE EXCEPTION 'Solo el solicitante puede calificar al transportista.';
  END IF;

  IF v_estado != 'completado' THEN
    RAISE EXCEPTION 'Solo puedes calificar una vez que el viaje esté completado.';
  END IF;

  IF v_transportista_id IS NULL THEN
    RAISE EXCEPTION 'Este flete no tiene transportista asignado.';
  END IF;

  IF p_puntaje < 1 OR p_puntaje > 5 THEN
    RAISE EXCEPTION 'El puntaje debe estar entre 1 y 5.';
  END IF;

  -- Evitar calificación duplicada para el mismo flete
  IF EXISTS (
    SELECT 1 FROM public.calificaciones
    WHERE freight_request_id = p_freight_id
      AND evaluador_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Ya calificaste a este transportista por este viaje.';
  END IF;

  INSERT INTO public.calificaciones (
    evaluador_id, evaluado_id, freight_request_id, puntaje, comentario
  ) VALUES (
    auth.uid(), v_transportista_id, p_freight_id, p_puntaje,
    NULLIF(TRIM(COALESCE(p_comentario, '')), '')
  );
END;
$$;

-- 3. RPC: obtener promedio de calificaciones de un usuario
CREATE OR REPLACE FUNCTION public.obtener_promedio_calificaciones(
  p_user_id UUID
)
RETURNS TABLE (promedio NUMERIC, total BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    ROUND(AVG(puntaje)::NUMERIC, 1),
    COUNT(*)
  FROM public.calificaciones
  WHERE evaluado_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.rate_transporter_from_freight(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_promedio_calificaciones(UUID)          TO authenticated;
