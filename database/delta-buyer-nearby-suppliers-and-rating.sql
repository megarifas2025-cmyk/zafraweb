BEGIN;

CREATE OR REPLACE FUNCTION public.buyer_nearby_suppliers(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer DEFAULT 25000,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  kind text,
  display_name text,
  subtitle text,
  distance_m double precision,
  available_items integer,
  phone text,
  logo_url text,
  lat double precision,
  lng double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'buyer' AND kyc_estado = 'verified' AND COALESCE(activo, TRUE) = TRUE
  ) THEN
    RAISE EXCEPTION 'Solo compradores verificados pueden consultar proveedores cercanos';
  END IF;

  RETURN QUERY
  WITH ref AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS geo_ref
  ),
  agro AS (
    SELECT
      p.id,
      'agrotienda'::text AS kind,
      p.nombre::text AS display_name,
      COALESCE(NULLIF(TRIM(p.municipio), ''), 'Sin municipio') || ', ' || COALESCE(NULLIF(TRIM(p.estado_ve), ''), 'Venezuela') AS subtitle,
      ST_Distance(p.ubicacion_point::geography, ref.geo_ref) AS distance_m,
      COUNT(ai.id)::integer AS available_items,
      p.telefono::text AS phone,
      p.avatar_url::text AS logo_url,
      ST_Y(p.ubicacion_point)::double precision AS lat,
      ST_X(p.ubicacion_point)::double precision AS lng
    FROM public.perfiles p
    CROSS JOIN ref
    LEFT JOIN public.agricultural_inputs ai
      ON ai.perfil_id = p.id
     AND ai.disponibilidad = TRUE
    WHERE p.rol = 'agrotienda'
      AND p.kyc_estado = 'verified'
      AND COALESCE(p.activo, TRUE) = TRUE
      AND p.ubicacion_point IS NOT NULL
      AND ST_DWithin(p.ubicacion_point::geography, ref.geo_ref, GREATEST(COALESCE(p_radius_m, 25000), 1000))
    GROUP BY p.id, p.nombre, p.municipio, p.estado_ve, p.telefono, p.avatar_url, p.ubicacion_point, ref.geo_ref
  ),
  companies_nearby AS (
    SELECT
      co.id,
      'company'::text AS kind,
      co.razon_social::text AS display_name,
      COALESCE(NULLIF(TRIM(co.direccion), ''), COALESCE(NULLIF(TRIM(pf.municipio), ''), 'Empresa registrada'))::text AS subtitle,
      ST_Distance(co.ubicacion_point::geography, ref.geo_ref) AS distance_m,
      0::integer AS available_items,
      COALESCE(NULLIF(TRIM(co.telefono_contacto), ''), pf.telefono)::text AS phone,
      NULLIF(co.logo_url, '')::text AS logo_url,
      ST_Y(co.ubicacion_point)::double precision AS lat,
      ST_X(co.ubicacion_point)::double precision AS lng
    FROM public.companies co
    JOIN public.perfiles pf ON pf.id = co.perfil_id
    CROSS JOIN ref
    WHERE co.ubicacion_point IS NOT NULL
      AND pf.kyc_estado = 'verified'
      AND COALESCE(pf.activo, TRUE) = TRUE
      AND ST_DWithin(co.ubicacion_point::geography, ref.geo_ref, GREATEST(COALESCE(p_radius_m, 25000), 1000))
  )
  SELECT *
  FROM (
    SELECT * FROM agro
    UNION ALL
    SELECT * FROM companies_nearby
  ) src
  ORDER BY src.distance_m ASC, src.available_items DESC, src.display_name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 30);
END;
$$;

GRANT EXECUTE ON FUNCTION public.buyer_nearby_suppliers(double precision, double precision, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.rate_buyer_from_chat(
  p_sala uuid,
  p_puntaje smallint,
  p_comentario text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.salas_chat%ROWTYPE;
  v_rating_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  IF p_puntaje < 1 OR p_puntaje > 5 THEN
    RAISE EXCEPTION 'Puntaje inválido';
  END IF;

  SELECT * INTO v_sala
  FROM public.salas_chat
  WHERE id = p_sala;

  IF v_sala.id IS NULL THEN
    RAISE EXCEPTION 'Sala no encontrada';
  END IF;

  IF v_sala.agricultor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el vendedor puede calificar al comprador';
  END IF;

  IF v_sala.comprador_id IS NULL OR v_sala.cosecha_id IS NULL THEN
    RAISE EXCEPTION 'La negociación no tiene contexto suficiente para calificar';
  END IF;

  INSERT INTO public.calificaciones (evaluador_id, evaluado_id, cosecha_id, puntaje, comentario)
  VALUES (auth.uid(), v_sala.comprador_id, v_sala.cosecha_id, p_puntaje, NULLIF(TRIM(COALESCE(p_comentario, '')), ''))
  ON CONFLICT (evaluador_id, cosecha_id)
  DO UPDATE SET
    puntaje = EXCLUDED.puntaje,
    comentario = EXCLUDED.comentario,
    creado_en = NOW()
  RETURNING id INTO v_rating_id;

  RETURN v_rating_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_buyer_from_chat(uuid, smallint, text) TO authenticated;

COMMIT;
