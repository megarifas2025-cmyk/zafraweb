-- ============================================================
-- Agrotienda Analytics: ventas por mes + productos más consultados
-- ============================================================

-- RPC: ventas por mes para el vendedor (últimos 12 meses)
CREATE OR REPLACE FUNCTION public.agrotienda_ventas_por_mes(p_vendedor_id UUID)
RETURNS TABLE (
  mes         TEXT,
  total       BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', confirmada_en), 'YYYY-MM') AS mes,
    COUNT(*)::BIGINT                                        AS total
  FROM public.salas_insumos_chat
  WHERE vendedor_id   = p_vendedor_id
    AND venta_confirmada = true
    AND confirmada_en  >= NOW() - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', confirmada_en)
  ORDER BY DATE_TRUNC('month', confirmada_en) ASC;
$$;

-- RPC: productos más consultados (por número de salas abiertas)
CREATE OR REPLACE FUNCTION public.agrotienda_productos_mas_consultados(p_vendedor_id UUID, p_limit INT DEFAULT 5)
RETURNS TABLE (
  insumo_id       UUID,
  nombre_producto TEXT,
  categoria       TEXT,
  total_consultas BIGINT,
  ventas          BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.insumo_id,
    i.nombre_producto,
    i.categoria::TEXT,
    COUNT(s.id)::BIGINT                                       AS total_consultas,
    COUNT(s.id) FILTER (WHERE s.venta_confirmada)::BIGINT    AS ventas
  FROM public.salas_insumos_chat s
  JOIN public.agricultural_inputs i ON i.id = s.insumo_id
  WHERE s.vendedor_id = p_vendedor_id
  GROUP BY s.insumo_id, i.nombre_producto, i.categoria
  ORDER BY total_consultas DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.agrotienda_ventas_por_mes(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.agrotienda_productos_mas_consultados(UUID, INT) TO authenticated;
