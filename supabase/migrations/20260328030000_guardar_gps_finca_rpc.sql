-- RPC para guardar coordenadas GPS de una finca
-- Bypasses PostgREST WKT format issues in direct REST updates
CREATE OR REPLACE FUNCTION guardar_gps_finca(
  p_finca_id UUID,
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE fincas
  SET coordenadas = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  WHERE id = p_finca_id
    AND propietario_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la finca o no tienes permiso para actualizarla.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION guardar_gps_finca(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
