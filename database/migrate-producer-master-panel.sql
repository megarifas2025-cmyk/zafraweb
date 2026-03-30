-- ================================================================
-- PANEL MAESTRO AGRICULTOR – early_warnings, field_logs, machinery, trust
-- Ejecutar en Supabase SQL Editor (después de migrate-bunker-module.sql)
-- ================================================================

-- ---- Perfil: Trust score (solo admin puede mutar vía trigger) ----
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS trust_score INTEGER NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS zafras_completadas INTEGER NOT NULL DEFAULT 0 CHECK (zafras_completadas >= 0);

UPDATE public.perfiles SET trust_score = COALESCE(trust_score, 50), zafras_completadas = COALESCE(zafras_completadas, 0) WHERE trust_score IS NULL OR zafras_completadas IS NULL;

CREATE OR REPLACE FUNCTION public.fn_perfil_trust_immutable_for_producers()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.trust_score IS DISTINCT FROM OLD.trust_score
       OR NEW.zafras_completadas IS DISTINCT FROM OLD.zafras_completadas THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'zafra_ceo'
      ) THEN
        NEW.trust_score := OLD.trust_score;
        NEW.zafras_completadas := OLD.zafras_completadas;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfil_trust_immutable ON public.perfiles;
CREATE TRIGGER trg_perfil_trust_immutable
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_perfil_trust_immutable_for_producers();

-- ---- early_warnings (S.O.S fitosanitario) ----
DO $$ BEGIN
  CREATE TYPE public.early_warning_estatus AS ENUM ('open', 'reviewed', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.early_warnings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  productor_id       UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  finca_id           UUID NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
  foto_url           TEXT,
  diagnostico_ia     TEXT,
  descripcion_usuario TEXT,
  estatus            public.early_warning_estatus NOT NULL DEFAULT 'open',
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_early_warnings_productor ON public.early_warnings(productor_id);
CREATE INDEX IF NOT EXISTS idx_early_warnings_finca ON public.early_warnings(finca_id);
CREATE INDEX IF NOT EXISTS idx_early_warnings_estatus ON public.early_warnings(estatus);

-- ---- field_logs (bitácora ligera) ----
DO $$ BEGIN
  CREATE TYPE public.field_log_tipo AS ENUM (
    'SIEMBRA',
    'APLICACION_QUIMICA',
    'FERTILIZACION',
    'OTRO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.field_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  productor_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  finca_id       UUID NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
  tipo_evento    public.field_log_tipo NOT NULL DEFAULT 'OTRO',
  fecha_evento   DATE NOT NULL,
  notas          TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_field_logs_productor ON public.field_logs(productor_id, fecha_evento DESC);

-- ---- machinery_rentals ----
DO $$ BEGIN
  CREATE TYPE public.machinery_tipo AS ENUM ('Tractor', 'Cosechadora', 'Rastra', 'Sembradora', 'Otro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.machinery_rental_estatus AS ENUM ('available', 'rented', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.machinery_rentals (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                    UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  tipo_maquina                public.machinery_tipo NOT NULL,
  marca_modelo                TEXT NOT NULL,
  ubicacion_gps               GEOGRAPHY(POINT, 4326),
  -- Rango inclusive-inclusive en texto Postgres: [inicio,fin]
  disponibilidad_fechas       DATERANGE NOT NULL,
  ubicacion_lat               DOUBLE PRECISION,
  ubicacion_lng               DOUBLE PRECISION,
  precio_referencial_hectarea NUMERIC(12,2) CHECK (precio_referencial_hectarea IS NULL OR precio_referencial_hectarea >= 0),
  estatus                     public.machinery_rental_estatus NOT NULL DEFAULT 'available',
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_machinery_range_nonempty CHECK (NOT lower_inf(disponibilidad_fechas) AND NOT upper_inf(disponibilidad_fechas))
);
CREATE INDEX IF NOT EXISTS idx_machinery_owner ON public.machinery_rentals(owner_id);
CREATE INDEX IF NOT EXISTS idx_machinery_estatus ON public.machinery_rentals(estatus);

CREATE OR REPLACE FUNCTION public.fn_machinery_sync_lat_lng()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ubicacion_gps IS NOT NULL THEN
    NEW.ubicacion_lat := ST_Y(NEW.ubicacion_gps::geometry);
    NEW.ubicacion_lng := ST_X(NEW.ubicacion_gps::geometry);
  ELSE
    NEW.ubicacion_lat := NULL;
    NEW.ubicacion_lng := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_machinery_lat_lng ON public.machinery_rentals;
CREATE TRIGGER trg_machinery_lat_lng
  BEFORE INSERT OR UPDATE OF ubicacion_gps ON public.machinery_rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_machinery_sync_lat_lng();

-- ---- RLS ----
ALTER TABLE public.early_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machinery_rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "early_warn_super" ON public.early_warnings;
DROP POLICY IF EXISTS "early_warn_producer" ON public.early_warnings;
DROP POLICY IF EXISTS "early_warn_company_bunker" ON public.early_warnings;
DROP POLICY IF EXISTS "early_warn_perito_bunker" ON public.early_warnings;

CREATE POLICY "early_warn_super" ON public.early_warnings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "early_warn_producer" ON public.early_warnings FOR ALL
  USING (auth.uid() = productor_id);

CREATE POLICY "early_warn_company_bunker" ON public.early_warnings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_farmers cf
      JOIN public.companies c ON c.id = cf.company_id AND cf.activo = TRUE
      WHERE cf.producer_id = early_warnings.productor_id AND c.perfil_id = auth.uid()
    )
  );

CREATE POLICY "early_warn_perito_bunker" ON public.early_warnings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_farmers cf
      JOIN public.company_employees ce ON ce.company_id = cf.company_id AND ce.activo = TRUE
      WHERE cf.producer_id = early_warnings.productor_id AND ce.perfil_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "field_logs_super" ON public.field_logs;
DROP POLICY IF EXISTS "field_logs_producer" ON public.field_logs;
CREATE POLICY "field_logs_super" ON public.field_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "field_logs_producer" ON public.field_logs FOR ALL
  USING (auth.uid() = productor_id);

DROP POLICY IF EXISTS "machinery_super" ON public.machinery_rentals;
DROP POLICY IF EXISTS "machinery_owner" ON public.machinery_rentals;
DROP POLICY IF EXISTS "machinery_public_producers" ON public.machinery_rentals;
CREATE POLICY "machinery_super" ON public.machinery_rentals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "machinery_owner" ON public.machinery_rentals FOR ALL
  USING (auth.uid() = owner_id);
CREATE POLICY "machinery_public_producers" ON public.machinery_rentals FOR SELECT
  USING (
    estatus = 'available'
    AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'independent_producer' AND p.kyc_estado = 'verified')
  );

-- Bucket storage (crear en Dashboard > Storage si no existe): early-warnings (público lectura opcional)

-- ---- Trust score (recordatorio) ----
-- trust_score y zafras_completadas solo los muta zafra_ceo vía trigger.
-- La lógica de negocio (entregas, chat, inspecciones) debe vivir en cron / Edge Function con service_role.

