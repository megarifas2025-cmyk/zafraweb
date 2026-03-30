-- =============================================================================
-- ZafraClic — ENVÍO ÚNICO (base YA existente — sin schema completo)
-- Generado por: node scripts/build-supabase-envio-unico.cjs
-- =============================================================================
--
-- CUÁNDO USAR
--   • Tu Supabase YA tiene tablas/enums (no es BD vacía).
--   • Si el archivo «COMPLETO» falla con «rol_usuario ya existe», usa ESTE.
--
-- CONTENIDO (en orden)
--   1) SUPABASE-SOLO-DELTAS.sql
--   2) SUPABASE-PENDIENTES-UN-SOLO-RUN.sql
--   3) delta-vehiculos-rls-propietario.sql
--
-- DESPUÉS: database/verificar-tablas-clave.sql
-- =============================================================================

-- =============================================================================
-- UNICORNIO AGRO — SOLO DELTAS (schema YA aplicado en Supabase)
-- =============================================================================
-- Úsalo cuando veas errores como: tipo "rol_usuario" ya existe (42710).
-- Es decir: NO ejecutes SUPABASE-TODO-EN-UNO.sql si la base ya tiene tablas/enums base.
--
-- Contenido (orden):
--   1) Pizarra fletes — freight_requests, postulaciones, chat logística (si aún no existen)
--   2) Módulo empresa — vistas, flota, RPC, políticas (usa freight_requests)
--   3) Panel productor — early_warnings, field_logs, maquinaria, trust
--   4) Upgrade maquinaria — idempotente
--   5) Nacional + comercial — archivo aparte: delta-nacional-comercial.sql (ver nota al final de este archivo)
--
-- Requisitos mínimos: public.perfiles, companies, company_farmers, company_employees,
--                     fincas, cosechas (schema “viejo” sin freight: este script lo crea).
--
-- Supabase → SQL Editor → New query → pegar TODO → Run (una vez).
-- =============================================================================

-- =============================================================================
-- SECCIÓN: PIZARRA FLETES (tablas y RLS si faltan)
-- =============================================================================

-- Pizarra de fletes (freight_requests) + postulaciones + notificaciones + chat logística
-- Ejecutar en Supabase SQL Editor (proyecto que ya tiene schema base).
-- Enums idempotentes (re-ejecutar no falla si ya existen).

DO $$ BEGIN
  CREATE TYPE freight_request_estado AS ENUM ('abierta','con_postulaciones','asignada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE freight_application_estado AS ENUM ('pendiente','aceptada','rechazada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.freight_requests (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id              UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  requester_role            rol_usuario NOT NULL,
  tipo_servicio             TEXT NOT NULL,
  origen_estado             TEXT NOT NULL,
  origen_municipio          TEXT NOT NULL,
  destino_estado            TEXT,
  destino_municipio         TEXT,
  fecha_necesaria           DATE NOT NULL,
  descripcion               TEXT,
  peso_estimado_kg          NUMERIC(12,2),
  estado                    freight_request_estado NOT NULL DEFAULT 'abierta',
  assigned_transportista_id UUID REFERENCES public.perfiles(id),
  creado_en                 TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT freight_request_generador_rol_chk CHECK (
    requester_role IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_freight_req_estado_muni ON public.freight_requests(estado, origen_municipio, fecha_necesaria DESC);
CREATE INDEX IF NOT EXISTS idx_freight_req_requester ON public.freight_requests(requester_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.freight_request_applications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freight_request_id UUID NOT NULL REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  transportista_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  mensaje            TEXT,
  estado             freight_application_estado NOT NULL DEFAULT 'pendiente',
  creado_en          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(freight_request_id, transportista_id)
);

CREATE INDEX IF NOT EXISTS idx_freight_app_request ON public.freight_request_applications(freight_request_id);
CREATE INDEX IF NOT EXISTS idx_freight_app_transportista ON public.freight_request_applications(transportista_id);

CREATE TABLE IF NOT EXISTS public.logistics_salas (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freight_request_id UUID NOT NULL UNIQUE REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  requester_id       UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  transportista_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logistics_mensajes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sala_id    UUID NOT NULL REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  autor_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contenido  TEXT NOT NULL,
  creado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_msg_sala ON public.logistics_mensajes(sala_id, creado_en);

CREATE TABLE IF NOT EXISTS public.freight_request_notifications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  titulo             TEXT NOT NULL,
  cuerpo             TEXT NOT NULL,
  freight_request_id UUID REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  application_id     UUID REFERENCES public.freight_request_applications(id) ON DELETE CASCADE,
  leida              BOOLEAN DEFAULT FALSE,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freight_notif_user ON public.freight_request_notifications(user_id, leida, creado_en DESC);

CREATE OR REPLACE FUNCTION public.fn_freight_application_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.freight_requests
    SET estado = 'con_postulaciones', actualizado_en = NOW()
    WHERE id = NEW.freight_request_id AND estado = 'abierta';
  INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id, application_id)
  SELECT r.requester_id,
    'Postulación a tu solicitud de transporte',
    COALESCE((SELECT nombre FROM public.perfiles WHERE id = NEW.transportista_id), 'Un transportista') || ' se postuló.',
    r.id,
    NEW.id
  FROM public.freight_requests r WHERE r.id = NEW.freight_request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freight_application_notify ON public.freight_request_applications;
CREATE TRIGGER trg_freight_application_notify
  AFTER INSERT ON public.freight_request_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_application_after_insert();

ALTER TABLE public.freight_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freight_req_zafra_ceo" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_insert_generadores" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_select_own" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_select_transporter_abierta" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_select_asignado" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_update_requester" ON public.freight_requests;

CREATE POLICY "freight_req_zafra_ceo" ON public.freight_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "freight_req_insert_generadores" ON public.freight_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_role = (SELECT rol FROM public.perfiles p WHERE p.id = auth.uid())
    AND (SELECT rol FROM public.perfiles p WHERE p.id = auth.uid()) IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  );
CREATE POLICY "freight_req_select_own" ON public.freight_requests FOR SELECT
  USING (requester_id = auth.uid());
CREATE POLICY "freight_req_select_transporter_abierta" ON public.freight_requests FOR SELECT
  USING (
    estado IN ('abierta','con_postulaciones')
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'transporter' AND p.kyc_estado = 'verified'
    )
  );
CREATE POLICY "freight_req_select_asignado" ON public.freight_requests FOR SELECT
  USING (assigned_transportista_id = auth.uid());
CREATE POLICY "freight_req_update_requester" ON public.freight_requests FOR UPDATE
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS "freight_app_zafra_ceo" ON public.freight_request_applications;
DROP POLICY IF EXISTS "freight_app_insert_transportista" ON public.freight_request_applications;
DROP POLICY IF EXISTS "freight_app_select_parties" ON public.freight_request_applications;
DROP POLICY IF EXISTS "freight_app_update_requester" ON public.freight_request_applications;

CREATE POLICY "freight_app_zafra_ceo" ON public.freight_request_applications FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "freight_app_insert_transportista" ON public.freight_request_applications FOR INSERT
  WITH CHECK (
    transportista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'transporter' AND p.kyc_estado = 'verified'
    )
    AND EXISTS (
      SELECT 1 FROM public.freight_requests r
      WHERE r.id = freight_request_id AND r.estado IN ('abierta','con_postulaciones')
    )
  );
CREATE POLICY "freight_app_select_parties" ON public.freight_request_applications FOR SELECT
  USING (
    transportista_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.freight_requests r
      WHERE r.id = freight_request_id AND r.requester_id = auth.uid()
    )
  );
CREATE POLICY "freight_app_update_requester" ON public.freight_request_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.freight_requests r
      WHERE r.id = freight_request_id AND r.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "freight_notif_select_own" ON public.freight_request_notifications;
DROP POLICY IF EXISTS "freight_notif_update_own" ON public.freight_request_notifications;

CREATE POLICY "freight_notif_select_own" ON public.freight_request_notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "freight_notif_update_own" ON public.freight_request_notifications FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "logistics_sala_zafra_ceo" ON public.logistics_salas;
DROP POLICY IF EXISTS "logistics_sala_select_parties" ON public.logistics_salas;
DROP POLICY IF EXISTS "logistics_sala_insert_requester" ON public.logistics_salas;

CREATE POLICY "logistics_sala_zafra_ceo" ON public.logistics_salas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "logistics_sala_select_parties" ON public.logistics_salas FOR SELECT
  USING (requester_id = auth.uid() OR transportista_id = auth.uid());
CREATE POLICY "logistics_sala_insert_requester" ON public.logistics_salas FOR INSERT
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "logistics_msg_zafra_ceo" ON public.logistics_mensajes;
DROP POLICY IF EXISTS "logistics_msg_select_parties" ON public.logistics_mensajes;
DROP POLICY IF EXISTS "logistics_msg_insert_parties" ON public.logistics_mensajes;

CREATE POLICY "logistics_msg_zafra_ceo" ON public.logistics_mensajes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "logistics_msg_select_parties" ON public.logistics_mensajes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.logistics_salas s
      WHERE s.id = sala_id AND (s.requester_id = auth.uid() OR s.transportista_id = auth.uid())
    )
  );
CREATE POLICY "logistics_msg_insert_parties" ON public.logistics_mensajes FOR INSERT
  WITH CHECK (
    autor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.logistics_salas s
      WHERE s.id = sala_id AND (s.requester_id = auth.uid() OR s.transportista_id = auth.uid())
    )
  );

-- =============================================================================
-- SECCIÓN: MÓDULO EMPRESA
-- =============================================================================

-- Vistas (RLS de fincas / cosechas sigue aplicándose sobre las filas base)
CREATE OR REPLACE VIEW public.registered_farms AS
SELECT * FROM public.fincas;

CREATE OR REPLACE VIEW public.active_harvests AS
SELECT *
FROM public.cosechas
WHERE estado IS DISTINCT FROM 'cancelada' AND estado IS DISTINCT FROM 'vendida';

-- Cartera: empresa lee cosechas de agricultores en company_farmers
DROP POLICY IF EXISTS "cosecha_bunker_company_read" ON public.cosechas;
CREATE POLICY "cosecha_bunker_company_read" ON public.cosechas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.company_farmers cf ON cf.company_id = c.id AND cf.activo = TRUE
      WHERE c.perfil_id = auth.uid() AND cf.producer_id = cosechas.agricultor_id
    )
  );

-- Flota propia
CREATE TABLE IF NOT EXISTS public.company_fleet_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  placa       TEXT NOT NULL,
  tipo_camion TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, placa)
);
CREATE INDEX IF NOT EXISTS idx_company_fleet_company ON public.company_fleet_units(company_id);

ALTER TABLE public.company_fleet_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_fleet_super" ON public.company_fleet_units;
DROP POLICY IF EXISTS "company_fleet_rw" ON public.company_fleet_units;
CREATE POLICY "company_fleet_super" ON public.company_fleet_units FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "company_fleet_rw" ON public.company_fleet_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_fleet_units.company_id AND c.perfil_id = auth.uid()
    )
  );

-- Zona al vincular perito (el formulario puede enviar zona_asignada; si no migraste, igual no rompe)
ALTER TABLE public.company_employees
  ADD COLUMN IF NOT EXISTS zona_asignada TEXT;

-- RPC: buscar perito verificado por doc_numero (solo si auth es empresa)
CREATE OR REPLACE FUNCTION public.company_find_collaborator_by_doc(p_doc text)
RETURNS TABLE (perfil_id uuid, nombre text, rol text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.perfil_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solo cuentas empresa pueden buscar colaboradores';
  END IF;
  RETURN QUERY
  SELECT p.id::uuid, p.nombre::text, p.rol::text
  FROM public.perfiles p
  WHERE p.doc_numero IS NOT NULL
    AND trim(p.doc_numero) = trim(p_doc)
    AND p.kyc_estado = 'verified'
    AND p.rol = 'perito'
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.company_find_collaborator_by_doc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_find_collaborator_by_doc(text) TO authenticated;

-- Listado de transportistas afiliados (nombres) para pantalla empresa
DROP POLICY IF EXISTS "perfil_transportista_por_solicitud_empresa" ON public.perfiles;
CREATE POLICY "perfil_transportista_por_solicitud_empresa" ON public.perfiles FOR SELECT
  USING (
    perfiles.rol = 'transporter'
    AND EXISTS (
      SELECT 1 FROM public.freight_requests fr
      WHERE fr.requester_id = auth.uid()
        AND (
          fr.assigned_transportista_id = perfiles.id
          OR EXISTS (
            SELECT 1 FROM public.freight_request_applications fa
            WHERE fa.freight_request_id = fr.id AND fa.transportista_id = perfiles.id
          )
        )
    )
  );

-- =============================================================================
-- Comprobación manual (opcional): descomenta y Run en otra pestaña
-- =============================================================================
-- SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('registered_farms','active_harvests');
-- SELECT proname FROM pg_proc WHERE proname = 'company_find_collaborator_by_doc';

-- =============================================================================
-- SECCIÓN: PANEL PRODUCTOR
-- =============================================================================

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


-- =============================================================================
-- SECCIÓN: UPGRADE MAQUINARIA (idempotente)
-- =============================================================================

-- ================================================================
-- UPGRADE: machinery_rentals → disponibilidad_fechas (daterange) +
--         ubicacion_lat / ubicacion_lng (para filtros “cercanos” en app)
-- Ejecutar UNA VEZ si ya aplicaste migrate-producer-master-panel.sql
-- con disponibilidad_inicio / disponibilidad_fin (columnas legadas).
-- ================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'machinery_rentals'
      AND column_name = 'disponibilidad_inicio'
  ) THEN
    ALTER TABLE public.machinery_rentals ADD COLUMN IF NOT EXISTS disponibilidad_fechas daterange;
    UPDATE public.machinery_rentals
    SET disponibilidad_fechas = daterange(disponibilidad_inicio, disponibilidad_fin, '[]')
    WHERE disponibilidad_fechas IS NULL;
    ALTER TABLE public.machinery_rentals DROP COLUMN IF EXISTS disponibilidad_inicio;
    ALTER TABLE public.machinery_rentals DROP COLUMN IF EXISTS disponibilidad_fin;
    ALTER TABLE public.machinery_rentals ALTER COLUMN disponibilidad_fechas SET NOT NULL;
  END IF;
END $$;

-- Coordenadas planas para Haversine en cliente (evita parsear WKB de geography).
ALTER TABLE public.machinery_rentals ADD COLUMN IF NOT EXISTS ubicacion_lat double precision;
ALTER TABLE public.machinery_rentals ADD COLUMN IF NOT EXISTS ubicacion_lng double precision;

UPDATE public.machinery_rentals
SET
  ubicacion_lat = ST_Y(ubicacion_gps::geometry),
  ubicacion_lng = ST_X(ubicacion_gps::geometry)
WHERE ubicacion_gps IS NOT NULL
  AND (ubicacion_lat IS NULL OR ubicacion_lng IS NULL);

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

-- Opcional: embed perfiles(nombre) en pizarra de fletes → database/delta-freight-requester-nombre-rls.sql

-- =============================================================================
-- SECCIÓN 5: NACIONAL + FLUJO COMERCIAL — fuente única (no duplicar en este archivo)
-- =============================================================================
-- El SQL idempotente vive en database/delta-nacional-comercial.sql
-- Tras correr este script (SOLO-DELTAS), ejecuta en el mismo proyecto:
--   npm run supabase:sql -- database/delta-nacional-comercial.sql
-- O el bundle recomendado (nacional + arrival_events + RLS nombre fletes):
--   npm run supabase:apply-deltas
-- O regenera y pega: npm run supabase:gen-deltas-bundle → supabase-APLICAR-DELTAS-RECENTES.sql
-- =============================================================================


-- ##############################################################################
-- PARTE 2 — PENDIENTES
-- ##############################################################################

-- =============================================================================
-- ZafraClic — PENDIENTES EN UN SOLO RUN (Supabase → SQL Editor)
-- =============================================================================
-- NOMBRE DE ESTE ARCHIVO (el que pegas en Supabase):
--   SUPABASE-PENDIENTES-UN-SOLO-RUN.sql
--
-- QUÉ INCLUYE (en orden):
--   1) fix-perfiles-rls-recursion.sql     — si ves error 42P17 en `perfiles` (idempotente).
--   2) migrate-buyer-market-geo.sql      — mercado comprador: PostGIS, wishlist, push outbox, RPC mapa.
--   3) supabase-ACTUALIZAR-DEMANDAS-REQUERIMIENTOS.sql — demandas: company + agrotienda en RLS mercado.
--   4) delta-arrival-events.sql          — tabla opcional arrival_events (Radar / “Llegué”).
--
-- CUÁNDO EJECUTARLO:
--   • Después de tener ya aplicada la base principal:
--       - BD nueva/vacía: primero SUPABASE-TODO-EN-UNO.sql
--       - BD con schema antiguo: SUPABASE-SOLO-DELTAS.sql (y si aplica supabase-APLICAR-DELTAS-RECENTES.sql)
--   • Este archivo NO sustituye al monolito base; añade lo que suele faltar según PENDIENTE-SUPABASE.md
--
-- NO INCLUYE (ya van en otros bundles o son enormes):
--   • supabase-APLICAR-DELTAS-RECENTES.sql — ejecutar aparte si tu proyecto aún no lo tiene.
--   • migrate-saas-perito-central.sql, migrate-bunker-module.sql, etc. — solo si verificar-tablas-clave.sql marca FALTA.
--
-- VERIFICACIÓN: database/verificar-tablas-clave.sql y database/verify-rls-mercado-ciego.sql (solo lectura).
-- =============================================================================


-- ##############################################################################
-- BLOQUE 1 — fix-perfiles-rls-recursion.sql
-- ##############################################################################

CREATE OR REPLACE FUNCTION public.is_zafra_ceo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'zafra_ceo'::rol_usuario
  );
$$;

COMMENT ON FUNCTION public.is_zafra_ceo() IS 'Evita recursión RLS al comprobar zafra_ceo en políticas de perfiles.';

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;

DROP POLICY IF EXISTS "zafra_ceo_all" ON public.perfiles;
CREATE POLICY "zafra_ceo_all" ON public.perfiles FOR ALL
  USING (public.is_zafra_ceo());


-- ##############################################################################
-- BLOQUE 2 — migrate-buyer-market-geo.sql (completo)
-- ##############################################################################

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

DROP POLICY IF EXISTS "buyer_push_outbox_own_select" ON public.buyer_push_outbox;
CREATE POLICY "buyer_push_outbox_own_select" ON public.buyer_push_outbox FOR SELECT
  USING (buyer_id = auth.uid());


-- ##############################################################################
-- BLOQUE 3 — supabase-ACTUALIZAR-DEMANDAS-REQUERIMIENTOS.sql (completo)
-- ########################################################################============

-- =============================================================================
-- UNICORNIO — ACTUALIZACIÓN ÚNICA: módulo requerimientos_compra (demandas)
-- =============================================================================
-- PRERREQUISITO: debe existir la tabla public.requerimientos_compra (p. ej. ya
-- aplicaste delta-nacional-comercial o el bundle base del proyecto).
-- =============================================================================

ALTER TABLE public.requerimientos_compra
  ADD COLUMN IF NOT EXISTS categoria_destino TEXT;

COMMENT ON COLUMN public.requerimientos_compra.categoria_destino IS
  'Enrutamiento: Insumos y Maquinaria (agrotienda), Cosecha a Granel (productor), Volumen Procesado / Silos (empresa).';

CREATE INDEX IF NOT EXISTS idx_req_compra_categoria_destino
  ON public.requerimientos_compra(categoria_destino)
  WHERE categoria_destino IS NOT NULL;

DROP POLICY IF EXISTS "req_compra_select_mercado" ON public.requerimientos_compra;

CREATE POLICY "req_compra_select_mercado" ON public.requerimientos_compra FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND p.rol IN (
          'independent_producer'::rol_usuario,
          'buyer'::rol_usuario,
          'company'::rol_usuario,
          'agrotienda'::rol_usuario
        )
    )
  );


-- ##############################################################################
-- BLOQUE 4 — delta-arrival-events.sql (opcional; idempotente)
-- ##############################################################################

CREATE TABLE IF NOT EXISTS public.arrival_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  lugar_label text,
  rol text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arrival_events_perfil ON public.arrival_events(perfil_id, creado_en DESC);

ALTER TABLE public.arrival_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arrival_events_insert_own" ON public.arrival_events;
CREATE POLICY "arrival_events_insert_own" ON public.arrival_events FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);

DROP POLICY IF EXISTS "arrival_events_select_own" ON public.arrival_events;
CREATE POLICY "arrival_events_select_own" ON public.arrival_events FOR SELECT
  USING (auth.uid() = perfil_id);

-- =============================================================================
-- Fin SUPABASE-PENDIENTES-UN-SOLO-RUN.sql
-- =============================================================================


-- ##############################################################################
-- PARTE 3 — vehículos RLS
-- ##############################################################################

-- Vehículos: políticas explícitas por comando (INSERT/UPDATE/DELETE/SELECT propio).
-- Si "vehiculo_crud_propietario" FOR ALL fallaba en INSERT en tu instancia, ejecuta esto en Supabase SQL.
-- Mantiene "vehiculo_lectura_verified" para ver unidades activas del mercado (otros verificados).

DROP POLICY IF EXISTS "vehiculo_crud_propietario" ON public.vehiculos;

CREATE POLICY "vehiculo_select_propietario" ON public.vehiculos FOR SELECT
  USING (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_insert_propietario" ON public.vehiculos FOR INSERT
  WITH CHECK (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_update_propietario" ON public.vehiculos FOR UPDATE
  USING (auth.uid() = propietario_id)
  WITH CHECK (auth.uid() = propietario_id);

CREATE POLICY "vehiculo_delete_propietario" ON public.vehiculos FOR DELETE
  USING (auth.uid() = propietario_id);
