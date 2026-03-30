-- ================================================================
-- MERCADO COMPRADOR: anuncios, wishlist "sniper", geo mapa, push outbox
-- Ejecutar en Supabase SQL Editor (PostGIS ya en schema: CREATE EXTENSION postgis).
-- ================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---- Ubicación mapa (GEOMETRY WGS84). cosechas ya usa coord_carga GEOGRAPHY. ----
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ubicacion_point geometry(Point, 4326);

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS ubicacion_point geometry(Point, 4326),
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_companies_ubicacion_point ON public.companies USING GIST (ubicacion_point);
CREATE INDEX IF NOT EXISTS idx_perfiles_ubicacion_point ON public.perfiles USING GIST (ubicacion_point) WHERE ubicacion_point IS NOT NULL;

-- ---- Banners patrocinados ----
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  link        TEXT,
  estatus     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_company ON public.ad_campaigns(company_id) WHERE estatus = TRUE;

-- ---- Wishlist comprador (coincidencia por rubro + ubicación + volumen mínimo kg) ----
CREATE TABLE IF NOT EXISTS public.buyer_wishlist (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  rubro              TEXT NOT NULL,
  estado_ve          TEXT,
  municipio          TEXT,
  volumen_minimo_kg  INTEGER NOT NULL DEFAULT 0 CHECK (volumen_minimo_kg >= 0),
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buyer_wishlist_buyer ON public.buyer_wishlist(buyer_id) WHERE active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_wishlist_dedup
  ON public.buyer_wishlist (buyer_id, lower(trim(rubro)), COALESCE(lower(trim(estado_ve)), ''), COALESCE(lower(trim(municipio)), ''))
  WHERE active = TRUE;

-- ---- Cola para Edge Function / Expo Push (service_role lee y marca procesado) ----
CREATE TABLE IF NOT EXISTS public.buyer_push_outbox (
  id          BIGSERIAL PRIMARY KEY,
  buyer_id    UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  procesado   BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buyer_push_outbox_pending ON public.buyer_push_outbox(procesado, creado_en) WHERE NOT procesado;

-- ---- RPC: ecosistema en radio (metros) desde centro mapa — respeta RLS del rol invocador ----
CREATE OR REPLACE FUNCTION public.market_ecosystem_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cosechas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'rubro', c.rubro,
        'cantidad_kg', c.cantidad_kg,
        'municipio', c.municipio,
        'estado_ve', c.estado_ve,
        'lng', ST_X(c.coord_carga::geometry),
        'lat', ST_Y(c.coord_carga::geometry),
        'fotos', to_jsonb(c.fotos),
        'agricultor_id', c.agricultor_id
      ))
      FROM public.cosechas c
      WHERE c.estado = 'publicada'
        AND c.coord_carga IS NOT NULL
        AND ST_DWithin(
          c.coord_carga::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ), '[]'::jsonb),
    'companies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', co.id,
        'razon_social', co.razon_social,
        'lng', ST_X(co.ubicacion_point),
        'lat', ST_Y(co.ubicacion_point),
        'logo_url', co.logo_url
      ))
      FROM public.companies co
      WHERE co.ubicacion_point IS NOT NULL
        AND ST_DWithin(
          co.ubicacion_point::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ), '[]'::jsonb),
    'agrotiendas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'lng', ST_X(p.ubicacion_point),
        'lat', ST_Y(p.ubicacion_point),
        'avatar_url', p.avatar_url
      ))
      FROM public.perfiles p
      WHERE p.rol = 'agrotienda'
        AND p.kyc_estado = 'verified'
        AND p.ubicacion_point IS NOT NULL
        AND ST_DWithin(
          p.ubicacion_point::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.market_ecosystem_nearby(double precision, double precision, double precision) TO authenticated;

-- ---- Trigger: cosecha publicada → cola push si coincide wishlist ----
CREATE OR REPLACE FUNCTION public.fn_cosecha_wishlist_enqueue_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'publicada' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.buyer_push_outbox (buyer_id, title, body, data)
  SELECT w.buyer_id,
    'Alerta Mercado',
    'Nueva cosecha de ' || NEW.rubro || ' en ' || NEW.municipio || ' (' || NEW.estado_ve || ') coincide con tu lista.',
    jsonb_build_object('cosecha_id', NEW.id, 'tipo', 'buyer_wishlist_match')
  FROM public.buyer_wishlist w
  WHERE w.active
    AND w.buyer_id IS DISTINCT FROM NEW.agricultor_id
    AND lower(trim(w.rubro)) = lower(trim(NEW.rubro))
    AND (w.estado_ve IS NULL OR trim(w.estado_ve) = '' OR lower(trim(w.estado_ve)) = lower(trim(NEW.estado_ve)))
    AND (w.municipio IS NULL OR trim(w.municipio) = '' OR lower(trim(w.municipio)) = lower(trim(NEW.municipio)))
    AND NEW.cantidad_kg::numeric >= w.volumen_minimo_kg::numeric;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cosecha_wishlist_push ON public.cosechas;
CREATE TRIGGER trg_cosecha_wishlist_push
  AFTER INSERT OR UPDATE OF estado ON public.cosechas
  FOR EACH ROW
  WHEN (NEW.estado = 'publicada')
  EXECUTE FUNCTION public.fn_cosecha_wishlist_enqueue_push();

-- ---- RLS ----
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_push_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_campaigns_select_public" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_select_verified" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_company_rw" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_super" ON public.ad_campaigns;

CREATE POLICY "ad_campaigns_super" ON public.ad_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "ad_campaigns_select_verified" ON public.ad_campaigns FOR SELECT
  USING (
    estatus = TRUE
    AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.kyc_estado = 'verified')
  );

CREATE POLICY "ad_campaigns_company_rw" ON public.ad_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = ad_campaigns.company_id AND c.perfil_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "buyer_wishlist_super" ON public.buyer_wishlist;
DROP POLICY IF EXISTS "buyer_wishlist_own" ON public.buyer_wishlist;

CREATE POLICY "buyer_wishlist_super" ON public.buyer_wishlist FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "buyer_wishlist_own" ON public.buyer_wishlist FOR ALL
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

-- Permitir al comprador ver sus propias filas pendientes (opcional depuración)
DROP POLICY IF EXISTS "buyer_push_outbox_own_select" ON public.buyer_push_outbox;
CREATE POLICY "buyer_push_outbox_own_select" ON public.buyer_push_outbox FOR SELECT
  USING (buyer_id = auth.uid());

-- expo_push_token en perfiles: el usuario ya puede actualizar su fila con la política perfil_editar_propio existente.
