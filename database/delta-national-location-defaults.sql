ALTER TABLE public.perfiles
  ALTER COLUMN estado_ve SET DEFAULT 'Venezuela';

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
      co.telefono_contacto::text AS phone,
      co.logo_url::text AS logo_url,
      ST_Y(co.ubicacion_point)::double precision AS lat,
      ST_X(co.ubicacion_point)::double precision AS lng
    FROM public.companies co
    JOIN public.perfiles pf ON pf.id = co.perfil_id
    CROSS JOIN ref
    WHERE co.ubicacion_point IS NOT NULL
      AND ST_DWithin(co.ubicacion_point::geography, ref.geo_ref, GREATEST(COALESCE(p_radius_m, 25000), 1000))
  )
  SELECT *
  FROM (
    SELECT * FROM agro
    UNION ALL
    SELECT * FROM companies_nearby
  ) rows
  ORDER BY distance_m ASC, available_items DESC, display_name ASC
  LIMIT GREATEST(COALESCE(p_limit, 12), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.buyer_nearby_suppliers(double precision, double precision, integer, integer) TO authenticated;
