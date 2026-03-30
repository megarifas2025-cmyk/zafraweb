BEGIN;

CREATE INDEX IF NOT EXISTS idx_alertas_waze_tipo_fecha ON public.alertas_waze(tipo, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_waze_confirm_alerta ON public.alertas_waze_confirmaciones(alerta_id);

CREATE OR REPLACE FUNCTION public.fn_recompute_plague_alert(p_alerta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta public.alertas_waze%ROWTYPE;
  v_confirmaciones integer := 0;
  v_perito_confirma boolean := false;
BEGIN
  SELECT * INTO v_alerta FROM public.alertas_waze WHERE id = p_alerta_id;
  IF v_alerta.id IS NULL OR v_alerta.tipo <> 'plaga' THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer INTO v_confirmaciones
  FROM public.alertas_waze_confirmaciones
  WHERE alerta_id = p_alerta_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.alertas_waze_confirmaciones c
    JOIN public.peritos pr ON pr.perfil_id = c.perfil_id
    WHERE c.alerta_id = p_alerta_id
  ) INTO v_perito_confirma;

  UPDATE public.alertas_waze
  SET
    confirmaciones = v_confirmaciones,
    estado = CASE
      WHEN estado = 'verificada' THEN 'verificada'
      WHEN v_perito_confirma OR v_confirmaciones >= 2 THEN 'verificada'
      ELSE 'no_verificada'
    END
  WHERE id = p_alerta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_alerta_waze_after_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_recompute_plague_alert(NEW.alerta_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerta_waze_after_confirm ON public.alertas_waze_confirmaciones;
CREATE TRIGGER trg_alerta_waze_after_confirm
  AFTER INSERT ON public.alertas_waze_confirmaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_alerta_waze_after_confirm();

CREATE OR REPLACE FUNCTION public.fn_notify_verified_plague_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo <> 'plaga' OR NEW.estado <> 'verificada' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.estado, 'no_verificada') = 'verificada' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.alertas_clima (perfil_id, finca_id, tipo, titulo, mensaje, severidad, expira_en)
  SELECT DISTINCT ON (f.propietario_id)
    f.propietario_id,
    f.id,
    'radar_plaga',
    CONCAT('Plaga confirmada: ', NEW.titulo),
    CONCAT('Se confirmó una alerta de "', NEW.titulo, '" a menos de 100 km en ', NEW.municipio, ', ', NEW.estado_ve, '. Revisa tu lote y confirma si observas síntomas similares.'),
    CASE WHEN NEW.confirmaciones >= 3 THEN 'alta' ELSE 'media' END,
    NOW() + INTERVAL '24 hours'
  FROM public.fincas f
  JOIN public.perfiles p ON p.id = f.propietario_id
  WHERE f.activa = TRUE
    AND f.coordenadas IS NOT NULL
    AND p.rol = 'independent_producer'
    AND COALESCE(p.activo, TRUE) = TRUE
    AND f.propietario_id <> NEW.perfil_id
    AND ST_DWithin(f.coordenadas, NEW.coordenadas, 100000)
    AND NOT EXISTS (
      SELECT 1
      FROM public.alertas_clima ac
      WHERE ac.perfil_id = f.propietario_id
        AND ac.tipo = 'radar_plaga'
        AND ac.titulo = CONCAT('Plaga confirmada: ', NEW.titulo)
        AND ac.creado_en >= NOW() - INTERVAL '24 hours'
    )
  ORDER BY f.propietario_id, f.creado_en DESC;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_verified_plague_alert_insert ON public.alertas_waze;
CREATE TRIGGER trg_notify_verified_plague_alert_insert
  AFTER INSERT ON public.alertas_waze
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_verified_plague_alert();

DROP TRIGGER IF EXISTS trg_notify_verified_plague_alert_update ON public.alertas_waze;
CREATE TRIGGER trg_notify_verified_plague_alert_update
  AFTER UPDATE OF estado, confirmaciones ON public.alertas_waze
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_verified_plague_alert();

CREATE OR REPLACE FUNCTION public.nearby_plague_alerts(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer DEFAULT 100000
)
RETURNS TABLE (
  id uuid,
  perfil_id uuid,
  titulo text,
  descripcion text,
  estado_ve text,
  municipio text,
  estado public.alerta_waze_estado,
  confirmaciones integer,
  creado_en timestamptz,
  reporter_name text,
  distance_m double precision,
  confirmed_by_me boolean,
  is_owner boolean,
  ia_sugerencia jsonb,
  fotos text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.perfil_id,
    a.titulo,
    a.descripcion,
    a.estado_ve,
    a.municipio,
    a.estado,
    a.confirmaciones,
    a.creado_en,
    p.nombre,
    ST_Distance(a.coordenadas, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m,
    EXISTS (
      SELECT 1
      FROM public.alertas_waze_confirmaciones c
      WHERE c.alerta_id = a.id AND c.perfil_id = auth.uid()
    ) AS confirmed_by_me,
    a.perfil_id = auth.uid() AS is_owner,
    a.ia_sugerencia,
    a.fotos
  FROM public.alertas_waze a
  JOIN public.perfiles p ON p.id = a.perfil_id
  WHERE a.tipo = 'plaga'
    AND ST_DWithin(a.coordenadas, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, GREATEST(COALESCE(p_radius_m, 100000), 1000))
    AND a.creado_en >= NOW() - INTERVAL '14 days'
  ORDER BY
    CASE WHEN a.estado = 'verificada' THEN 0 ELSE 1 END,
    a.confirmaciones DESC,
    distance_m ASC,
    a.creado_en DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_community_plague_alert(p_alerta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerta public.alertas_waze%ROWTYPE;
  v_role public.rol_usuario;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT * INTO v_alerta
  FROM public.alertas_waze
  WHERE id = p_alerta_id AND tipo = 'plaga';

  IF v_alerta.id IS NULL THEN
    RAISE EXCEPTION 'Alerta no encontrada';
  END IF;

  IF v_alerta.perfil_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes confirmar tu propia alerta';
  END IF;

  SELECT rol INTO v_role FROM public.perfiles WHERE id = auth.uid();
  IF v_role NOT IN ('independent_producer', 'perito') THEN
    RAISE EXCEPTION 'Solo agricultores o peritos pueden confirmar alertas comunitarias';
  END IF;

  INSERT INTO public.alertas_waze_confirmaciones (alerta_id, perfil_id)
  VALUES (p_alerta_id, auth.uid())
  ON CONFLICT (alerta_id, perfil_id) DO NOTHING;

  PERFORM public.fn_recompute_plague_alert(p_alerta_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recompute_plague_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearby_plague_alerts(double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_community_plague_alert(uuid) TO authenticated;

COMMIT;
