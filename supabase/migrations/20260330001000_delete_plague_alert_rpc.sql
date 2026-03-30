-- Elimina una alerta comunitaria de plaga creada por el propio usuario.
-- Borra primero confirmaciones relacionadas para evitar bloqueos por FK.
CREATE OR REPLACE FUNCTION public.delete_community_plague_alert(
  p_alerta_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  DELETE FROM public.alertas_waze_confirmaciones
  WHERE alerta_id = p_alerta_id
    AND EXISTS (
      SELECT 1
      FROM public.alertas_waze a
      WHERE a.id = p_alerta_id
        AND a.tipo = 'plaga'
        AND a.perfil_id = auth.uid()
    );

  DELETE FROM public.alertas_waze
  WHERE id = p_alerta_id
    AND tipo = 'plaga'
    AND perfil_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la alerta o no tienes permiso para eliminarla.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_community_plague_alert(UUID) TO authenticated;
