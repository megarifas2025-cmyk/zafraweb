-- ================================================================
-- UNICORNIO AGRO v2.0 – Schema PostgreSQL
-- Roles (+ agrotienda) | Mercado Ciego | Waze Agrícola | B2B | RLS estricto
-- Ejecutar completo en Supabase SQL Editor
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------
CREATE TYPE rol_usuario AS ENUM (
  'zafra_ceo', 'company', 'perito', 'independent_producer', 'buyer', 'transporter', 'agrotienda'
);
CREATE TYPE categoria_insumo AS ENUM ('quimicos', 'semillas', 'maquinaria');
CREATE TYPE linea_catalogo_agrotienda AS ENUM ('insumos', 'repuestos');
CREATE TYPE kyc_estado AS ENUM ('pendiente','en_revision','verified','rechazado','bloqueado');
CREATE TYPE cosecha_estado AS ENUM ('borrador','publicada','negociando','vendida','cancelada');
CREATE TYPE flete_estado AS ENUM ('available','asignado','en_ruta','completado','cancelado');
CREATE TYPE freight_request_estado AS ENUM ('abierta','con_postulaciones','asignada','cancelada','completada');
CREATE TYPE freight_application_estado AS ENUM ('pendiente','aceptada','rechazada');
CREATE TYPE tipo_doc AS ENUM ('cedula','rif','acta_constitutiva','licencia_4ta','licencia_5ta','guia_sada','guia_sunagro','otro');
CREATE TYPE tipo_vehiculo AS ENUM ('camioneta','camion_5t','camion_10t','gandola','mula');
CREATE TYPE alerta_waze_tipo AS ENUM ('plaga','inundacion','bloqueo_via','otro');
CREATE TYPE alerta_waze_estado AS ENUM ('no_verificada','verificada');
CREATE TYPE field_inspection_estatus AS ENUM ('pending','in_progress','synced','approved');

-- ================================================================
-- PERFILES
-- ================================================================
CREATE TABLE public.perfiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol          rol_usuario NOT NULL,
  nombre       TEXT        NOT NULL,
  telefono     TEXT,
  estado_ve    TEXT        NOT NULL DEFAULT 'Venezuela',
  municipio    TEXT,
  kyc_estado   kyc_estado  NOT NULL DEFAULT 'pendiente',
  kyc_fecha    TIMESTAMPTZ,
  avatar_url   TEXT,
  reputacion   NUMERIC(3,2) DEFAULT 5.00 CHECK (reputacion BETWEEN 0 AND 5),
  total_tratos INTEGER      DEFAULT 0,
  activo       BOOLEAN     DEFAULT TRUE,
  bloqueado    BOOLEAN     DEFAULT FALSE,
  creado_en    TIMESTAMPTZ DEFAULT NOW(),
  actualizado  TIMESTAMPTZ DEFAULT NOW(),
  trust_score  INTEGER     NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  zafras_completadas INTEGER NOT NULL DEFAULT 0 CHECK (zafras_completadas >= 0),
  doc_prefijo  TEXT CHECK (doc_prefijo IS NULL OR doc_prefijo IN ('V','E','J','G')),
  doc_numero   TEXT,
  fecha_nacimiento DATE,
  ubicacion_point geometry(Point, 4326),
  disponibilidad_flete BOOLEAN NOT NULL DEFAULT false,
  expo_push_token TEXT
);

CREATE TABLE public.admin_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  actor_role   rol_usuario NOT NULL,
  action       TEXT NOT NULL,
  target_table TEXT,
  target_id    UUID,
  target_label TEXT,
  reason       TEXT,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_actor ON public.admin_audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_created_at ON public.admin_audit_logs(created_at DESC);

-- ================================================================
-- COMPANIES (Empresas/Silos)
-- ================================================================
CREATE TABLE public.companies (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id          UUID NOT NULL UNIQUE REFERENCES public.perfiles(id) ON DELETE CASCADE,
  razon_social       TEXT NOT NULL,
  rif                TEXT NOT NULL UNIQUE,
  logo_url           TEXT        NOT NULL DEFAULT '',
  direccion          TEXT,
  direccion_fiscal   TEXT        NOT NULL DEFAULT '',
  telefono_contacto  TEXT        NOT NULL DEFAULT '',
  correo_contacto    TEXT        NOT NULL DEFAULT '',
  descripcion        TEXT,
  creado_en          TIMESTAMPTZ DEFAULT NOW(),
  ubicacion_point    geometry(Point, 4326)
);

CREATE INDEX idx_companies_ubicacion_point ON public.companies USING GIST (ubicacion_point);

-- Afiliaciones: Empresa ↔ Agricultor financiado
CREATE TABLE public.company_affiliations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.perfiles(id),
  activo      BOOLEAN DEFAULT TRUE,
  creado_en   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, producer_id)
);

CREATE INDEX idx_affiliations_company ON public.company_affiliations(company_id);
CREATE INDEX idx_affiliations_producer ON public.company_affiliations(producer_id);

CREATE TABLE public.transporter_company_links (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transporter_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transporter_id, company_id)
);

CREATE INDEX idx_transporter_links_company ON public.transporter_company_links(company_id, status, creado_en DESC);
CREATE INDEX idx_transporter_links_transporter ON public.transporter_company_links(transporter_id, status, creado_en DESC);

-- Búnker: empleados (peritos) y agricultores financiados (se sincronizan con peritos / company_affiliations)
CREATE TABLE public.company_employees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  perfil_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, perfil_id)
);
CREATE INDEX idx_company_employees_company ON public.company_employees(company_id);
CREATE INDEX idx_company_employees_perfil ON public.company_employees(perfil_id);

CREATE TABLE public.company_farmers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, producer_id)
);
CREATE INDEX idx_company_farmers_company ON public.company_farmers(company_id);
CREATE INDEX idx_company_farmers_producer ON public.company_farmers(producer_id);

-- Peritos (Ingenieros de campo) asignados a la Empresa
CREATE TABLE public.peritos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  perfil_id    UUID NOT NULL REFERENCES public.perfiles(id),
  especialidad TEXT,
  num_inpsa    TEXT,
  activo       BOOLEAN DEFAULT TRUE,
  creado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- FINCAS
-- ================================================================
CREATE TABLE public.fincas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  propietario_id  UUID NOT NULL REFERENCES public.perfiles(id),
  company_id      UUID REFERENCES public.companies(id),
  nombre          TEXT NOT NULL,
  estado_ve       TEXT NOT NULL,
  municipio       TEXT NOT NULL,
  parroquia       TEXT,
  coordenadas     GEOGRAPHY(POINT, 4326),
  hectareas       NUMERIC(10,2) NOT NULL CHECK (hectareas > 0),
  rubro           TEXT NOT NULL,
  rubros_extras   TEXT[],
  foto_url        TEXT,
  activa          BOOLEAN DEFAULT TRUE,
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fincas_propietario ON public.fincas(propietario_id);
CREATE INDEX idx_fincas_geo ON public.fincas USING GIST(coordenadas);

-- ================================================================
-- INSPECCIONES (Offline → Sync)
-- ================================================================
CREATE TABLE public.inspecciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perito_id       UUID NOT NULL REFERENCES public.perfiles(id),
  finca_id        UUID NOT NULL REFERENCES public.fincas(id),
  company_id      UUID NOT NULL REFERENCES public.companies(id),
  asignado_por    UUID REFERENCES public.perfiles(id),
  estado_fenologico TEXT,
  requerimiento_insumos TEXT,
  observaciones   TEXT,
  fotos           TEXT[],
  sincronizado    BOOLEAN DEFAULT FALSE,
  aprobado        BOOLEAN DEFAULT FALSE,
  creado_en       TIMESTAMPTZ DEFAULT NOW(),
  sincronizado_en TIMESTAMPTZ
);

CREATE INDEX idx_inspecciones_perito ON public.inspecciones(perito_id);
CREATE INDEX idx_inspecciones_finca ON public.inspecciones(finca_id);

-- Órdenes de trabajo de campo (Búnker, sync perito offline-first)
CREATE TABLE public.field_inspection_counters (
  empresa_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.field_inspections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_control         TEXT NOT NULL UNIQUE,
  empresa_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  perito_id              UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  productor_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  finca_id               UUID REFERENCES public.fincas(id) ON DELETE SET NULL,
  fecha_programada       DATE NOT NULL,
  coordenadas_gps        GEOGRAPHY(POINT, 4326),
  tipo_inspeccion        TEXT NOT NULL DEFAULT 'seguimiento_tecnico',
  estado_acta            TEXT NOT NULL DEFAULT 'borrador_local',
  observaciones_tecnicas TEXT,
  resumen_dictamen       TEXT,
  insumos_recomendados   JSONB NOT NULL DEFAULT '[]'::jsonb,
  porcentaje_dano        NUMERIC(6,2),
  estimacion_rendimiento_ton NUMERIC(12,2),
  area_verificada_ha     NUMERIC(12,2),
  precision_gps_m        NUMERIC(10,2),
  fuera_de_lote          BOOLEAN NOT NULL DEFAULT FALSE,
  fotos_urls             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidencias_fotos       JSONB NOT NULL DEFAULT '[]'::jsonb,
  firma_perito           JSONB,
  firma_productor        JSONB,
  firmado_en             TIMESTAMPTZ,
  fase_fenologica        TEXT,
  malezas_reportadas     TEXT,
  plagas_reportadas      TEXT,
  recomendacion_insumos  TEXT,
  estatus                field_inspection_estatus NOT NULL DEFAULT 'pending',
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_field_insp_empresa ON public.field_inspections(empresa_id);
CREATE INDEX idx_field_insp_perito_estatus ON public.field_inspections(perito_id, estatus);
CREATE INDEX idx_field_insp_productor ON public.field_inspections(productor_id);
CREATE INDEX idx_field_insp_finca ON public.field_inspections(finca_id);

CREATE OR REPLACE FUNCTION public.fn_field_inspection_numero_control()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_n INT;
BEGIN
  IF NEW.numero_control IS NOT NULL AND btrim(NEW.numero_control) <> '' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.empresa_id::text));
  UPDATE public.field_inspection_counters SET n = n + 1 WHERE empresa_id = NEW.empresa_id RETURNING n INTO v_n;
  IF NOT FOUND THEN
    INSERT INTO public.field_inspection_counters (empresa_id, n) VALUES (NEW.empresa_id, 1);
    v_n := 1;
  END IF;
  NEW.numero_control := 'INSP-' || lpad(v_n::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_field_insp_numero
  BEFORE INSERT ON public.field_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_field_inspection_numero_control();

CREATE OR REPLACE FUNCTION public.fn_field_insp_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_field_insp_touch
  BEFORE UPDATE ON public.field_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_field_insp_touch();

CREATE OR REPLACE FUNCTION public.fn_sync_perito_employee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.company_employees (company_id, perfil_id, activo)
  VALUES (NEW.company_id, NEW.perfil_id, COALESCE(NEW.activo, TRUE))
  ON CONFLICT (company_id, perfil_id) DO UPDATE SET activo = EXCLUDED.activo;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_perito_employee
  AFTER INSERT OR UPDATE ON public.peritos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_perito_employee();

CREATE OR REPLACE FUNCTION public.fn_sync_affiliation_farmer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.company_farmers (company_id, producer_id, activo)
  VALUES (NEW.company_id, NEW.producer_id, COALESCE(NEW.activo, TRUE))
  ON CONFLICT (company_id, producer_id) DO UPDATE SET activo = EXCLUDED.activo;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_affiliation_farmer
  AFTER INSERT OR UPDATE ON public.company_affiliations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_affiliation_farmer();

CREATE OR REPLACE FUNCTION public.company_find_producer_by_doc(p_doc text)
RETURNS TABLE (
  perfil_id uuid,
  nombre text,
  telefono text,
  municipio text,
  estado_ve text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.perfil_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solo cuentas empresa pueden buscar agricultores';
  END IF;

  RETURN QUERY
  SELECT
    p.id::uuid,
    p.nombre::text,
    p.telefono::text,
    p.municipio::text,
    p.estado_ve::text
  FROM public.perfiles p
  WHERE p.doc_numero IS NOT NULL
    AND trim(p.doc_numero) = trim(p_doc)
    AND p.rol = 'independent_producer'
    AND COALESCE(p.activo, true) = true
  LIMIT 1;
END;
$$;

-- ================================================================
-- COSECHAS – MERCADO CIEGO (SIN PRECIO PÚBLICO)
-- ================================================================
CREATE TABLE public.cosechas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agricultor_id    UUID NOT NULL REFERENCES public.perfiles(id),
  finca_id         UUID NOT NULL REFERENCES public.fincas(id),
  rubro            TEXT NOT NULL,
  variedad         TEXT,
  cantidad_kg      NUMERIC(12,2) NOT NULL CHECK (cantidad_kg > 0),
  condicion        TEXT NOT NULL DEFAULT 'Cosecha de Campo',
  fecha_disponible DATE NOT NULL,
  estado           cosecha_estado DEFAULT 'borrador',
  descripcion      TEXT,
  fotos            TEXT[],
  coord_carga      GEOGRAPHY(POINT, 4326),
  estado_ve        TEXT NOT NULL,
  municipio        TEXT NOT NULL,
  ubicacion_estado TEXT,
  vistas           INTEGER DEFAULT 0,
  publicado_en     TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ DEFAULT NOW(),
  -- Solo COMPANY/PERITO pueden editar: datos de laboratorio
  pct_humedad      NUMERIC(5,2),
  pct_impureza     NUMERIC(5,2),
  editado_por      UUID REFERENCES public.perfiles(id),
  editado_en       TIMESTAMPTZ
);

CREATE INDEX idx_cosechas_mercado ON public.cosechas(estado, estado_ve, municipio);
CREATE INDEX idx_cosechas_rubro ON public.cosechas(rubro, estado);
CREATE INDEX idx_cosechas_geo ON public.cosechas USING GIST(coord_carga);
CREATE INDEX idx_cosechas_ubicacion_estado ON public.cosechas(ubicacion_estado) WHERE ubicacion_estado IS NOT NULL;

-- ================================================================
-- VEHÍCULOS Y FLOTA
-- ================================================================
CREATE TABLE public.vehiculos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  propietario_id UUID NOT NULL REFERENCES public.perfiles(id),
  company_id     UUID REFERENCES public.companies(id),
  tipo           tipo_vehiculo NOT NULL,
  placa          TEXT NOT NULL,
  marca          TEXT,
  modelo         TEXT,
  anio           INTEGER,
  color          TEXT,
  carroceria     TEXT,
  ejes           INTEGER,
  driver_has_gps_phone BOOLEAN,
  driver_app_ready BOOLEAN,
  device_notes   TEXT,
  capacidad_kg   NUMERIC(10,2),
  foto_url       TEXT,
  activo         BOOLEAN DEFAULT TRUE,
  creado_en      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.vehiculo_docs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehiculo_id UUID NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
  tipo        tipo_doc NOT NULL,
  numero      TEXT,
  archivo_url TEXT NOT NULL,
  vence       DATE,
  verificado  BOOLEAN DEFAULT FALSE,
  creado_en   TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- FLETES (antes de viajes)
-- ================================================================
CREATE TABLE public.fletes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transportista_id UUID NOT NULL REFERENCES public.perfiles(id),
  vehiculo_id      UUID NOT NULL REFERENCES public.vehiculos(id),
  cosecha_id       UUID REFERENCES public.cosechas(id),
  origen_estado    TEXT NOT NULL,
  origen_municipio TEXT NOT NULL,
  origen_coords    GEOGRAPHY(POINT, 4326),
  destino_estado   TEXT,
  destino_municipio TEXT,
  precio_kg        NUMERIC(10,4),
  moneda           TEXT DEFAULT 'USD',
  fecha_disponible DATE NOT NULL,
  estado           flete_estado DEFAULT 'available',
  notas            TEXT,
  creado_en        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fletes_zona ON public.fletes(estado, origen_estado, origen_municipio);
CREATE INDEX idx_fletes_geo ON public.fletes USING GIST(origen_coords);

-- ================================================================
-- PIZARRA DE FLETES – Solicitudes universales (generadores de carga)
-- ================================================================
CREATE TABLE public.freight_requests (
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
  tracking_status           TEXT NOT NULL DEFAULT 'assigned_pending_prep' CHECK (
    tracking_status IN (
      'assigned_pending_prep',
      'prepared',
      'departed_origin',
      'in_transit',
      'signal_lost',
      'arrived_destination',
      'received'
    )
  ),
  assigned_transportista_id UUID REFERENCES public.perfiles(id),
  vehiculo_id               UUID REFERENCES public.vehiculos(id),
  driver_name               TEXT,
  driver_phone              TEXT,
  driver_document           TEXT,
  driver_has_app            BOOLEAN,
  driver_has_gps            BOOLEAN,
  driver_notes              TEXT,
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

CREATE INDEX idx_freight_req_estado_muni ON public.freight_requests(estado, origen_municipio, fecha_necesaria DESC);
CREATE INDEX idx_freight_req_requester ON public.freight_requests(requester_id, creado_en DESC);

CREATE TABLE public.freight_request_applications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freight_request_id UUID NOT NULL REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  transportista_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  mensaje            TEXT,
  estado             freight_application_estado NOT NULL DEFAULT 'pendiente',
  creado_en          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(freight_request_id, transportista_id)
);

CREATE INDEX idx_freight_app_request ON public.freight_request_applications(freight_request_id);
CREATE INDEX idx_freight_app_transportista ON public.freight_request_applications(transportista_id);

CREATE TABLE public.logistics_salas (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freight_request_id UUID NOT NULL UNIQUE REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  requester_id       UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  transportista_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.logistics_mensajes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sala_id    UUID NOT NULL REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  autor_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contenido  TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'texto',
  media_url  TEXT,
  creado_en  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logistics_msg_sala ON public.logistics_mensajes(sala_id, creado_en);

-- Notificaciones in-app (push real vía Edge Function + Expo token en el futuro)
CREATE TABLE public.freight_request_notifications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  titulo             TEXT NOT NULL,
  cuerpo             TEXT NOT NULL,
  freight_request_id UUID REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  application_id     UUID REFERENCES public.freight_request_applications(id) ON DELETE CASCADE,
  leida              BOOLEAN DEFAULT FALSE,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_freight_notif_user ON public.freight_request_notifications(user_id, leida, creado_en DESC);

CREATE TABLE public.freight_tracking_updates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freight_request_id UUID NOT NULL REFERENCES public.freight_requests(id) ON DELETE CASCADE,
  actor_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  actor_role         rol_usuario NOT NULL,
  event_type         TEXT NOT NULL CHECK (event_type IN ('departed_origin', 'location_ping', 'arrived_destination')),
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  accuracy_m         NUMERIC(8,2),
  label              TEXT,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_freight_tracking_req ON public.freight_tracking_updates(freight_request_id, creado_en DESC);
CREATE INDEX idx_freight_tracking_actor ON public.freight_tracking_updates(actor_id, creado_en DESC);

CREATE OR REPLACE FUNCTION public.fn_transporter_company_link_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_owner uuid;
  v_transporter_name text;
  v_company_name text;
BEGIN
  SELECT perfil_id, razon_social
  INTO v_company_owner, v_company_name
  FROM public.companies
  WHERE id = NEW.company_id;

  SELECT nombre
  INTO v_transporter_name
  FROM public.perfiles
  WHERE id = NEW.transporter_id;

  IF TG_OP = 'INSERT' AND v_company_owner IS NOT NULL THEN
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo)
    VALUES (
      v_company_owner,
      'Solicitud de vínculo de transportista',
      COALESCE(v_transporter_name, 'Un transportista') || ' solicitó vincularse a ' || COALESCE(v_company_name, 'tu empresa') || '.'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo)
    VALUES (
      NEW.transporter_id,
      CASE
        WHEN NEW.status = 'approved' THEN 'Empresa aprobó tu vínculo'
        WHEN NEW.status = 'rejected' THEN 'Empresa rechazó tu vínculo'
        ELSE 'Actualización de vínculo empresarial'
      END,
      CASE
        WHEN NEW.status = 'approved' THEN COALESCE(v_company_name, 'La empresa') || ' aprobó tu operación como transportista aliado.'
        WHEN NEW.status = 'rejected' THEN COALESCE(v_company_name, 'La empresa') || ' rechazó tu solicitud de vínculo.'
        ELSE 'Tu vínculo empresarial cambió de estado.'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transporter_company_link_notify
  AFTER INSERT OR UPDATE ON public.transporter_company_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_transporter_company_link_notify();

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
    COALESCE((SELECT nombre FROM public.perfiles WHERE id = NEW.transportista_id), 'Un transportista') || ' se postuló. Abre «Solicitar transporte» → Mis solicitudes para revisar.',
    r.id,
    NEW.id
  FROM public.freight_requests r WHERE r.id = NEW.freight_request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_freight_application_notify
  AFTER INSERT ON public.freight_request_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_application_after_insert();

CREATE OR REPLACE FUNCTION public.fn_freight_tracking_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester uuid;
  v_actor_name text;
BEGIN
  SELECT requester_id INTO v_requester
  FROM public.freight_requests
  WHERE id = NEW.freight_request_id;

  IF v_requester IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nombre INTO v_actor_name
  FROM public.perfiles
  WHERE id = NEW.actor_id;

  IF NEW.event_type = 'departed_origin' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'departed_origin',
          actualizado_en = NOW()
      WHERE id = NEW.freight_request_id
        AND tracking_status IN ('assigned_pending_prep', 'prepared');
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_requester,
      'Tu carga va saliendo',
      COALESCE(v_actor_name, 'El chofer') || ' reportó salida desde el punto de carga. Ya puedes seguir la ruta en tiempo real.',
      NEW.freight_request_id
    );
  ELSIF NEW.event_type = 'location_ping' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'in_transit',
          actualizado_en = NOW()
      WHERE id = NEW.freight_request_id
        AND estado = 'asignada'
        AND tracking_status <> 'arrived_destination';
  ELSIF NEW.event_type = 'arrived_destination' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'arrived_destination',
          actualizado_en = NOW()
      WHERE id = NEW.freight_request_id;
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_requester,
      'Tu carga llegó al destino',
      COALESCE(v_actor_name, 'El chofer') || ' confirmó la llegada de la mercancía al destino.',
      NEW.freight_request_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_freight_tracking_notify
  AFTER INSERT ON public.freight_tracking_updates
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_tracking_after_insert();

CREATE OR REPLACE FUNCTION public.fn_freight_request_after_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'completada'
     AND COALESCE(OLD.estado, '') <> 'completada'
     AND NEW.assigned_transportista_id IS NOT NULL THEN
    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      NEW.assigned_transportista_id,
      'Servicio cerrado por el cliente',
      'El cliente confirmó la recepción y cerró el viaje.',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_freight_request_after_update
  AFTER UPDATE ON public.freight_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_freight_request_after_update();

CREATE OR REPLACE FUNCTION public.assign_freight_execution(
  p_freight_id uuid,
  p_vehiculo_id uuid,
  p_driver_name text,
  p_driver_phone text,
  p_driver_document text,
  p_driver_has_app boolean,
  p_driver_has_gps boolean,
  p_driver_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.freight_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO v_req
  FROM public.freight_requests
  WHERE id = p_freight_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_req.assigned_transportista_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para preparar este servicio';
  END IF;

  IF v_req.estado <> 'asignada' THEN
    RAISE EXCEPTION 'Solo puedes preparar servicios asignados';
  END IF;

  IF p_vehiculo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vehiculos v
      WHERE v.id = p_vehiculo_id
        AND v.propietario_id = auth.uid()
        AND COALESCE(v.activo, TRUE) = TRUE
    ) THEN
      RAISE EXCEPTION 'El vehículo seleccionado no pertenece a tu flota activa';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.vehiculo_id = p_vehiculo_id
        AND fr.id <> p_freight_id
        AND fr.estado = 'asignada'
    ) THEN
      RAISE EXCEPTION 'Ese vehículo ya tiene otro servicio activo';
    END IF;
  END IF;

  IF NULLIF(btrim(COALESCE(p_driver_document, '')), '') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.driver_document = NULLIF(btrim(p_driver_document), '')
        AND fr.id <> p_freight_id
        AND fr.estado = 'asignada'
    ) THEN
      RAISE EXCEPTION 'Ese chofer ya figura en otro servicio activo';
    END IF;
  END IF;

  UPDATE public.freight_requests
  SET vehiculo_id = p_vehiculo_id,
      driver_name = NULLIF(btrim(COALESCE(p_driver_name, '')), ''),
      driver_phone = NULLIF(btrim(COALESCE(p_driver_phone, '')), ''),
      driver_document = NULLIF(btrim(COALESCE(p_driver_document, '')), ''),
      driver_has_app = p_driver_has_app,
      driver_has_gps = p_driver_has_gps,
      driver_notes = NULLIF(btrim(COALESCE(p_driver_notes, '')), ''),
      tracking_status = 'prepared',
      actualizado_en = NOW()
  WHERE id = p_freight_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_freight_signal_status(
  p_freight_id uuid,
  p_stale_minutes integer DEFAULT 3
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.freight_requests%ROWTYPE;
  v_latest public.freight_tracking_updates%ROWTYPE;
  v_previous_status text;
  v_should_signal boolean := false;
BEGIN
  SELECT *
  INTO v_req
  FROM public.freight_requests
  WHERE id = p_freight_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_req.requester_id
     AND auth.uid() IS DISTINCT FROM v_req.assigned_transportista_id THEN
    RAISE EXCEPTION 'No autorizado para sincronizar este servicio';
  END IF;

  IF v_req.estado <> 'asignada' THEN
    RETURN;
  END IF;

  IF v_req.tracking_status IN ('arrived_destination', 'received') THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_latest
  FROM public.freight_tracking_updates
  WHERE freight_request_id = p_freight_id
  ORDER BY creado_en DESC
  LIMIT 1;

  IF v_latest.id IS NULL THEN
    RETURN;
  END IF;

  v_previous_status := v_req.tracking_status;
  v_should_signal :=
    v_latest.event_type <> 'arrived_destination'
    AND v_latest.creado_en < NOW() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 3), 1));

  IF v_should_signal AND v_req.tracking_status <> 'signal_lost' THEN
    UPDATE public.freight_requests
      SET tracking_status = 'signal_lost',
          actualizado_en = NOW()
      WHERE id = p_freight_id;

    INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
    VALUES (
      v_req.requester_id,
      'Servicio sin señal',
      'El viaje dejó de reportar ubicación reciente. Revisa el estado del chofer o contacta al transportista.',
      p_freight_id
    );

    IF v_req.assigned_transportista_id IS NOT NULL THEN
      INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, freight_request_id)
      VALUES (
        v_req.assigned_transportista_id,
        'Tu servicio quedó sin señal',
        'La aplicación detectó falta de reportes recientes. Reactiva GPS y vuelve a abrir la ruta si es necesario.',
        p_freight_id
      );
    END IF;
    RETURN;
  END IF;

  IF NOT v_should_signal AND v_previous_status = 'signal_lost' THEN
    UPDATE public.freight_requests
      SET tracking_status = CASE
        WHEN v_latest.event_type = 'departed_origin' THEN 'departed_origin'
        WHEN v_latest.event_type = 'arrived_destination' THEN 'arrived_destination'
        ELSE 'in_transit'
      END,
          actualizado_en = NOW()
      WHERE id = p_freight_id;
  END IF;
END;
$$;

-- Billetera Logística: docs por viaje
CREATE TABLE public.viajes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flete_id         UUID REFERENCES public.fletes(id),
  transportista_id UUID NOT NULL REFERENCES public.perfiles(id),
  vehiculo_id      UUID NOT NULL REFERENCES public.vehiculos(id),
  guia_sada_url    TEXT,
  guia_sunagro_url TEXT,
  estado           TEXT DEFAULT 'pendiente',
  creado_en        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.viaje_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  viaje_id UUID NOT NULL REFERENCES public.viajes(id) ON DELETE CASCADE,
  tipo tipo_doc NOT NULL,
  archivo_url TEXT NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- KYC – DOCUMENTOS DE IDENTIDAD
-- ================================================================
CREATE TABLE public.kyc_docs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id    UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  tipo         tipo_doc NOT NULL,
  numero       TEXT,
  archivo_url  TEXT NOT NULL,
  ia_resultado JSONB,
  ia_confianza NUMERIC(5,4),
  verificado   BOOLEAN DEFAULT FALSE,
  notas        TEXT,
  creado_en    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kyc_perfil ON public.kyc_docs(perfil_id);

-- ================================================================
-- CHAT PRIVADO – Negociación (precio exclusivo aquí)
-- ================================================================
CREATE TABLE public.salas_chat (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cosecha_id      UUID REFERENCES public.cosechas(id),
  comprador_id    UUID NOT NULL REFERENCES public.perfiles(id),
  agricultor_id   UUID NOT NULL REFERENCES public.perfiles(id),
  cerrada         BOOLEAN DEFAULT FALSE,
  trato_cerrado   BOOLEAN DEFAULT FALSE,
  precio_acordado NUMERIC(12,4),
  moneda          TEXT DEFAULT 'USD',
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_comprador ON public.salas_chat(comprador_id);
CREATE INDEX idx_chat_agricultor ON public.salas_chat(agricultor_id);

CREATE TABLE public.mensajes (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sala_id   UUID NOT NULL REFERENCES public.salas_chat(id) ON DELETE CASCADE,
  autor_id  UUID NOT NULL REFERENCES public.perfiles(id),
  contenido TEXT NOT NULL,
  nonce     TEXT NOT NULL,
  tipo      TEXT DEFAULT 'texto',
  media_url TEXT,
  leido     BOOLEAN DEFAULT FALSE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mensajes_sala ON public.mensajes(sala_id, creado_en ASC);

CREATE TABLE public.chat_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL CHECK (source IN ('market', 'logistics')),
  sala_id           UUID REFERENCES public.salas_chat(id) ON DELETE CASCADE,
  logistics_sala_id UUID REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  reported_by       UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  offender_id       UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  category          TEXT NOT NULL CHECK (category IN ('fraud_attempt', 'obscene_language', 'threat', 'fake_document', 'unsafe_payment', 'manual_report', 'other')),
  severity          TEXT NOT NULL CHECK (severity IN ('media', 'alta', 'critica')),
  message_excerpt   TEXT,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  auto_detected     BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_incidents_one_chat_ref CHECK (
    (sala_id IS NOT NULL AND logistics_sala_id IS NULL)
    OR (sala_id IS NULL AND logistics_sala_id IS NOT NULL)
  )
);

CREATE INDEX idx_chat_incidents_created_at ON public.chat_incidents(created_at DESC);
CREATE INDEX idx_chat_incidents_status ON public.chat_incidents(status, created_at DESC);

CREATE TABLE public.chat_audit_access_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID NOT NULL REFERENCES public.chat_incidents(id) ON DELETE CASCADE,
  actor_id          UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK (source IN ('market', 'logistics')),
  sala_id           UUID REFERENCES public.salas_chat(id) ON DELETE CASCADE,
  logistics_sala_id UUID REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_audit_access_logs_incident ON public.chat_audit_access_logs(incident_id, created_at DESC);

-- ================================================================
-- ALERTAS WAZE AGRÍCOLA
-- ================================================================
CREATE TABLE public.alertas_waze (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id     UUID NOT NULL REFERENCES public.perfiles(id),
  tipo          alerta_waze_tipo NOT NULL,
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  coordenadas   GEOGRAPHY(POINT, 4326) NOT NULL,
  estado_ve     TEXT NOT NULL,
  municipio     TEXT NOT NULL,
  estado        alerta_waze_estado NOT NULL DEFAULT 'no_verificada',
  confirmaciones INTEGER DEFAULT 0,
  fotos         TEXT[],
  ia_sugerencia JSONB,
  creado_en     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alertas_waze_geo ON public.alertas_waze USING GIST(coordenadas);
CREATE INDEX idx_alertas_waze_estado ON public.alertas_waze(estado, estado_ve, municipio);

-- Confirmaciones de productores (2 para pasar a verificada)
CREATE TABLE public.alertas_waze_confirmaciones (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alerta_id UUID NOT NULL REFERENCES public.alertas_waze(id) ON DELETE CASCADE,
  perfil_id UUID NOT NULL REFERENCES public.perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alerta_id, perfil_id)
);

-- ================================================================
-- CALIFICACIONES Y REPUTACIÓN
-- ================================================================
CREATE TABLE public.calificaciones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluador_id UUID NOT NULL REFERENCES public.perfiles(id),
  evaluado_id  UUID NOT NULL REFERENCES public.perfiles(id),
  cosecha_id   UUID REFERENCES public.cosechas(id),
  puntaje      SMALLINT NOT NULL CHECK (puntaje BETWEEN 1 AND 5),
  comentario   TEXT,
  creado_en    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(evaluador_id, cosecha_id)
);

CREATE OR REPLACE FUNCTION fn_actualizar_reputacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.perfiles SET
    reputacion   = (SELECT ROUND(AVG(puntaje)::NUMERIC,2) FROM public.calificaciones WHERE evaluado_id = NEW.evaluado_id),
    total_tratos = (SELECT COUNT(*) FROM public.calificaciones WHERE evaluado_id = NEW.evaluado_id)
  WHERE id = NEW.evaluado_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reputacion
  AFTER INSERT OR UPDATE ON public.calificaciones
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_reputacion();

-- ================================================================
-- ALERTAS CLIMÁTICAS
-- ================================================================
CREATE TABLE public.alertas_clima (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id UUID NOT NULL REFERENCES public.perfiles(id),
  finca_id  UUID REFERENCES public.fincas(id),
  tipo      TEXT NOT NULL,
  titulo    TEXT NOT NULL,
  mensaje   TEXT NOT NULL,
  severidad TEXT DEFAULT 'media',
  leida     BOOLEAN DEFAULT FALSE,
  expira_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alertas_perfil ON public.alertas_clima(perfil_id, leida, creado_en DESC);

-- ================================================================
-- TICKER TAPE (Weather Ticker + Alertas Waze + Publicidad)
-- ================================================================
CREATE TABLE public.ticker_items (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo      TEXT NOT NULL,
  texto     TEXT NOT NULL,
  estado_ve TEXT,
  activo    BOOLEAN DEFAULT TRUE,
  prioridad SMALLINT DEFAULT 5,
  patrocinado BOOLEAN DEFAULT FALSE,
  expira_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticker_activo ON public.ticker_items(activo, prioridad DESC, creado_en DESC);

-- ================================================================
-- AGROTIENDAS – Catálogo de insumos (sin precios; precio acordar fuera de la app)
-- ================================================================
CREATE TABLE public.agricultural_inputs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id        UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  nombre_producto  TEXT NOT NULL,
  linea_catalogo   linea_catalogo_agrotienda NOT NULL DEFAULT 'insumos',
  categoria        categoria_insumo NOT NULL,
  subcategoria     TEXT,
  descripcion      TEXT,
  imagen_url       TEXT,
  disponibilidad   BOOLEAN NOT NULL DEFAULT TRUE,
  precio           NUMERIC(14,2),
  creado_en        TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agri_inputs_perfil ON public.agricultural_inputs(perfil_id);
CREATE INDEX idx_agri_inputs_disponible ON public.agricultural_inputs(disponibilidad) WHERE disponibilidad = TRUE;
CREATE INDEX idx_agri_inputs_nombre ON public.agricultural_inputs USING gin (nombre_producto gin_trgm_ops);
CREATE INDEX idx_agri_inputs_linea ON public.agricultural_inputs(linea_catalogo);

CREATE INDEX idx_perfiles_ubicacion_point ON public.perfiles USING GIST (ubicacion_point) WHERE ubicacion_point IS NOT NULL;

-- ================================================================
-- MERCADO COMPRADOR — Banners, wishlist, cola push (ver también migrate-buyer-market-geo.sql)
-- ================================================================
CREATE TABLE public.ad_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  link        TEXT,
  estatus     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ad_campaigns_company ON public.ad_campaigns(company_id) WHERE estatus = TRUE;

CREATE TABLE public.buyer_wishlist (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  rubro              TEXT NOT NULL,
  estado_ve          TEXT,
  municipio          TEXT,
  volumen_minimo_kg  INTEGER NOT NULL DEFAULT 0 CHECK (volumen_minimo_kg >= 0),
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_buyer_wishlist_buyer ON public.buyer_wishlist(buyer_id) WHERE active = TRUE;
CREATE UNIQUE INDEX idx_buyer_wishlist_dedup
  ON public.buyer_wishlist (buyer_id, lower(trim(rubro)), COALESCE(lower(trim(estado_ve)), ''), COALESCE(lower(trim(municipio)), ''))
  WHERE active = TRUE;

CREATE TABLE public.buyer_push_outbox (
  id          BIGSERIAL PRIMARY KEY,
  buyer_id    UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  procesado   BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_buyer_push_outbox_pending ON public.buyer_push_outbox(procesado, creado_en) WHERE NOT procesado;

-- ================================================================
-- DEMANDA COMPRADOR / LOTES FINANCIADOS / LLEGADAS (Radar)
-- (Paridad con delta-nacional-comercial.sql + delta-arrival-events.sql)
-- ================================================================
CREATE TABLE public.requerimientos_compra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id      UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  rubro             TEXT NOT NULL,
  cantidad          NUMERIC(14,2) NOT NULL CHECK (cantidad > 0),
  precio_estimado   NUMERIC(14,2),
  ubicacion_estado  TEXT NOT NULL,
  fecha_limite      DATE NOT NULL,
  categoria_destino TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_req_compra_comprador ON public.requerimientos_compra(comprador_id, creado_en DESC);
CREATE INDEX idx_req_compra_ubicacion ON public.requerimientos_compra(ubicacion_estado, fecha_limite);
CREATE INDEX idx_req_compra_categoria_destino ON public.requerimientos_compra(categoria_destino) WHERE categoria_destino IS NOT NULL;

CREATE TABLE public.lotes_financiados (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  productor_id  UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  finca_id      UUID NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, productor_id, finca_id)
);
CREATE INDEX idx_lotes_fin_company ON public.lotes_financiados(company_id, creado_en DESC);
CREATE INDEX idx_lotes_fin_productor ON public.lotes_financiados(productor_id);

CREATE TABLE public.arrival_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  lugar_label text,
  rol text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_arrival_events_perfil ON public.arrival_events(perfil_id, creado_en DESC);

CREATE OR REPLACE FUNCTION public.fn_lotes_financiados_validar_finca()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fincas f
    WHERE f.id = NEW.finca_id AND f.propietario_id = NEW.productor_id
  ) THEN
    RAISE EXCEPTION 'lotes_financiados: finca_id debe pertenecer a productor_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotes_financiados_validar_finca ON public.lotes_financiados;
CREATE TRIGGER trg_lotes_financiados_validar_finca
  BEFORE INSERT OR UPDATE OF finca_id, productor_id ON public.lotes_financiados
  FOR EACH ROW EXECUTE FUNCTION public.fn_lotes_financiados_validar_finca();

-- ================================================================
-- Helpers RLS (evitar recursión 42P17 en políticas sobre perfiles)
-- SECURITY DEFINER no omite RLS; SET LOCAL en plpgsql no es fiable aquí.
-- ALTER FUNCTION ... SET row_security TO off (GUC durante toda la invocación).
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_zafra_ceo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'zafra_ceo'::rol_usuario
  );
$$;
ALTER FUNCTION public.is_zafra_ceo() SET row_security TO off;

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_verified_transporter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND p.rol = 'transporter'::rol_usuario
      AND p.kyc_estado = 'verified'
  );
$$;
ALTER FUNCTION public.is_verified_transporter() SET row_security TO off;

REVOKE ALL ON FUNCTION public.is_verified_transporter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_transporter() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS public.rol_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;
ALTER FUNCTION public.get_my_rol() SET row_security TO off;

CREATE OR REPLACE FUNCTION public.get_my_kyc_estado()
RETURNS public.kyc_estado
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kyc_estado FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;
ALTER FUNCTION public.get_my_kyc_estado() SET row_security TO off;

REVOKE ALL ON FUNCTION public.get_my_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rol() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_kyc_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_estado() TO authenticated;

CREATE OR REPLACE FUNCTION public.public_company_directory()
RETURNS TABLE (
  id uuid,
  razon_social text,
  rif text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id, c.razon_social, c.rif
  FROM public.companies c
  ORDER BY c.razon_social;
$$;

REVOKE ALL ON FUNCTION public.public_company_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_company_directory() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.company_find_producer_by_doc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_find_producer_by_doc(text) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_freight_execution(uuid, uuid, text, text, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_freight_execution(uuid, uuid, text, text, text, boolean, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_freight_signal_status(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_freight_signal_status(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.detect_chat_policy_violation(p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text := lower(trim(coalesce(p_content, '')));
BEGIN
  IF v_text = '' THEN
    RETURN NULL;
  END IF;

  IF v_text ~ '(maldito|maldita|mierda|coño|carajo|puta|puto|marico|marica|hijo de puta|mamaguevo)' THEN
    RETURN jsonb_build_object(
      'category', 'obscene_language',
      'severity', 'alta',
      'message', 'No puedes usar lenguaje ofensivo u obsceno dentro del chat.'
    );
  END IF;

  IF v_text ~ '(te voy a matar|te voy a joder|te voy a caer|vas a pagar|te voy a buscar|te voy a romper)' THEN
    RETURN jsonb_build_object(
      'category', 'threat',
      'severity', 'critica',
      'message', 'No puedes enviar amenazas o intimidaciones dentro del chat.'
    );
  END IF;

  IF v_text ~ '(transfiere ya|paga ya|dep[oó]sito inmediato|env[ií]a el dinero|hazme la transferencia|sin garant[ií]a|sin factura|sin respaldo)' THEN
    RETURN jsonb_build_object(
      'category', 'fraud_attempt',
      'severity', 'critica',
      'message', 'Ese mensaje parece un intento de fraude o manipulación de pago y no puede enviarse.'
    );
  END IF;

  IF v_text ~ '(adelanto completo|pago por fuera|sin verificaci[oó]n|sin soporte|sin revisarlo)' THEN
    RETURN jsonb_build_object(
      'category', 'unsafe_payment',
      'severity', 'alta',
      'message', 'Evita presionar pagos inseguros o sin respaldo dentro del chat.'
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_zafra_ceo_chat_alert(p_title text, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.freight_request_notifications (user_id, titulo, cuerpo, leida)
  SELECT p.id, p_title, p_body, FALSE
  FROM public.perfiles p
  WHERE p.rol = 'zafra_ceo'::rol_usuario
    AND COALESCE(p.activo, TRUE) = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_market_chat_message(
  p_sala_id uuid,
  p_contenido text,
  p_tipo text DEFAULT 'texto',
  p_media_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.salas_chat%ROWTYPE;
  v_violation jsonb;
  v_msg_id uuid;
  v_excerpt text := left(trim(coalesce(p_contenido, '')), 240);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO v_sala
  FROM public.salas_chat
  WHERE id = p_sala_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala no encontrada';
  END IF;
  IF auth.uid() NOT IN (v_sala.comprador_id, v_sala.agricultor_id) THEN
    RAISE EXCEPTION 'No autorizado para escribir en esta sala';
  END IF;

  IF p_tipo = 'imagen' AND coalesce(trim(p_media_url), '') = '' THEN
    RAISE EXCEPTION 'Debes adjuntar una imagen válida.';
  END IF;

  v_violation := public.detect_chat_policy_violation(p_contenido);
  IF v_violation IS NOT NULL THEN
    INSERT INTO public.chat_incidents (
      source, sala_id, reported_by, offender_id, category, severity, message_excerpt, reason, auto_detected, status
    )
    VALUES (
      'market',
      p_sala_id,
      auth.uid(),
      auth.uid(),
      v_violation->>'category',
      v_violation->>'severity',
      v_excerpt,
      v_violation->>'message',
      TRUE,
      'open'
    );

    PERFORM public.notify_zafra_ceo_chat_alert(
      'Alerta automática de chat comercial',
      format('Se bloqueó un mensaje por %s en una negociación comercial.', v_violation->>'category')
    );
    RAISE EXCEPTION '%', 'CHAT_POLICY_BLOCK:' || (v_violation->>'message');
  END IF;

  INSERT INTO public.mensajes (sala_id, autor_id, contenido, nonce, tipo, media_url)
  VALUES (p_sala_id, auth.uid(), trim(coalesce(p_contenido, '')), '__plain__', coalesce(nullif(trim(p_tipo), ''), 'texto'), nullif(trim(coalesce(p_media_url, '')), ''))
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_logistics_chat_message(
  p_sala_id uuid,
  p_contenido text,
  p_tipo text DEFAULT 'texto',
  p_media_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.logistics_salas%ROWTYPE;
  v_violation jsonb;
  v_msg_id uuid;
  v_excerpt text := left(trim(coalesce(p_contenido, '')), 240);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT * INTO v_sala
  FROM public.logistics_salas
  WHERE id = p_sala_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala logística no encontrada';
  END IF;
  IF auth.uid() NOT IN (v_sala.requester_id, v_sala.transportista_id) THEN
    RAISE EXCEPTION 'No autorizado para escribir en esta sala logística';
  END IF;

  IF p_tipo = 'imagen' AND coalesce(trim(p_media_url), '') = '' THEN
    RAISE EXCEPTION 'Debes adjuntar una imagen válida.';
  END IF;

  v_violation := public.detect_chat_policy_violation(p_contenido);
  IF v_violation IS NOT NULL THEN
    INSERT INTO public.chat_incidents (
      source, logistics_sala_id, reported_by, offender_id, category, severity, message_excerpt, reason, auto_detected, status
    )
    VALUES (
      'logistics',
      p_sala_id,
      auth.uid(),
      auth.uid(),
      v_violation->>'category',
      v_violation->>'severity',
      v_excerpt,
      v_violation->>'message',
      TRUE,
      'open'
    );

    PERFORM public.notify_zafra_ceo_chat_alert(
      'Alerta automática de chat logístico',
      format('Se bloqueó un mensaje por %s en una coordinación logística.', v_violation->>'category')
    );
    RAISE EXCEPTION '%', 'CHAT_POLICY_BLOCK:' || (v_violation->>'message');
  END IF;

  INSERT INTO public.logistics_mensajes (sala_id, autor_id, contenido, tipo, media_url)
  VALUES (p_sala_id, auth.uid(), trim(coalesce(p_contenido, '')), coalesce(nullif(trim(p_tipo), ''), 'texto'), nullif(trim(coalesce(p_media_url, '')), ''))
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_chat_incident(
  p_source text,
  p_sala_id uuid DEFAULT NULL,
  p_logistics_sala_id uuid DEFAULT NULL,
  p_offender_id uuid DEFAULT NULL,
  p_category text DEFAULT 'manual_report',
  p_severity text DEFAULT 'media',
  p_reason text DEFAULT NULL,
  p_message_excerpt text DEFAULT NULL,
  p_auto_detected boolean DEFAULT FALSE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_market public.salas_chat%ROWTYPE;
  v_logistics public.logistics_salas%ROWTYPE;
  v_final_severity text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_source NOT IN ('market', 'logistics') THEN
    RAISE EXCEPTION 'Fuente de incidente inválida.';
  END IF;

  IF p_source = 'market' THEN
    IF p_sala_id IS NULL OR p_logistics_sala_id IS NOT NULL THEN
      RAISE EXCEPTION 'Referencia de chat comercial inválida.';
    END IF;
    SELECT * INTO v_market FROM public.salas_chat WHERE id = p_sala_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La sala comercial no existe.';
    END IF;
    IF auth.uid() NOT IN (v_market.comprador_id, v_market.agricultor_id) THEN
      RAISE EXCEPTION 'Solo los participantes pueden reportar este chat comercial.';
    END IF;
    IF p_offender_id IS NOT NULL AND p_offender_id NOT IN (v_market.comprador_id, v_market.agricultor_id) THEN
      RAISE EXCEPTION 'El usuario reportado no pertenece a este chat comercial.';
    END IF;
  ELSE
    IF p_logistics_sala_id IS NULL OR p_sala_id IS NOT NULL THEN
      RAISE EXCEPTION 'Referencia de chat logístico inválida.';
    END IF;
    SELECT * INTO v_logistics FROM public.logistics_salas WHERE id = p_logistics_sala_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La sala logística no existe.';
    END IF;
    IF auth.uid() NOT IN (v_logistics.requester_id, v_logistics.transportista_id) THEN
      RAISE EXCEPTION 'Solo los participantes pueden reportar este chat logístico.';
    END IF;
    IF p_offender_id IS NOT NULL AND p_offender_id NOT IN (v_logistics.requester_id, v_logistics.transportista_id) THEN
      RAISE EXCEPTION 'El usuario reportado no pertenece a este chat logístico.';
    END IF;
  END IF;

  v_final_severity := CASE
    WHEN p_category IN ('fraud_attempt', 'threat', 'fake_document') THEN
      CASE WHEN p_severity IN ('alta', 'critica') THEN p_severity ELSE 'alta' END
    WHEN p_category = 'unsafe_payment' THEN
      CASE WHEN p_severity IN ('alta', 'critica') THEN p_severity ELSE 'alta' END
    ELSE
      'media'
  END;

  INSERT INTO public.chat_incidents (
    source,
    sala_id,
    logistics_sala_id,
    reported_by,
    offender_id,
    category,
    severity,
    reason,
    message_excerpt,
    auto_detected,
    status
  )
  VALUES (
    p_source,
    p_sala_id,
    p_logistics_sala_id,
    auth.uid(),
    p_offender_id,
    p_category,
    v_final_severity,
    p_reason,
    p_message_excerpt,
    p_auto_detected,
    'open'
  )
  RETURNING id INTO v_id;

  PERFORM public.notify_zafra_ceo_chat_alert(
    'Nuevo reporte de chat',
    format('Se registró un incidente manual en un chat %s.', p_source)
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ceo_get_chat_audit_messages(p_incident_id uuid)
RETURNS TABLE (
  id uuid,
  incident_id uuid,
  source text,
  chat_id uuid,
  author_id uuid,
  author_name text,
  contenido text,
  tipo text,
  media_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident public.chat_incidents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_zafra_ceo() THEN
    RAISE EXCEPTION 'Solo el CEO puede usar modo auditor.';
  END IF;

  SELECT *
  INTO v_incident
  FROM public.chat_incidents
  WHERE id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incidente no encontrado.';
  END IF;

  IF v_incident.severity NOT IN ('alta', 'critica') THEN
    RAISE EXCEPTION 'Modo auditor disponible solo para incidentes de severidad alta o crítica.';
  END IF;

  INSERT INTO public.chat_audit_access_logs (
    incident_id,
    actor_id,
    source,
    sala_id,
    logistics_sala_id
  )
  VALUES (
    v_incident.id,
    auth.uid(),
    v_incident.source,
    v_incident.sala_id,
    v_incident.logistics_sala_id
  );

  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    target_label,
    reason,
    details
  )
  VALUES (
    auth.uid(),
    'zafra_ceo'::rol_usuario,
    'open_chat_audit',
    'chat_incidents',
    v_incident.id,
    v_incident.category,
    'Apertura de conversación en modo auditor',
    jsonb_build_object(
      'source', v_incident.source,
      'severity', v_incident.severity,
      'sala_id', v_incident.sala_id,
      'logistics_sala_id', v_incident.logistics_sala_id
    )
  );

  IF v_incident.source = 'market' THEN
    RETURN QUERY
    SELECT
      m.id,
      v_incident.id,
      'market'::text,
      m.sala_id,
      m.autor_id,
      p.nombre,
      m.contenido,
      m.tipo,
      m.media_url,
      m.creado_en
    FROM public.mensajes m
    LEFT JOIN public.perfiles p ON p.id = m.autor_id
    WHERE m.sala_id = v_incident.sala_id
    ORDER BY m.creado_en ASC;
  ELSE
    RETURN QUERY
    SELECT
      m.id,
      v_incident.id,
      'logistics'::text,
      m.sala_id,
      m.autor_id,
      p.nombre,
      m.contenido,
      m.tipo,
      m.media_url,
      m.creado_en
    FROM public.logistics_mensajes m
    LEFT JOIN public.perfiles p ON p.id = m.autor_id
    WHERE m.sala_id = v_incident.logistics_sala_id
    ORDER BY m.creado_en ASC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_chat_policy_violation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_zafra_ceo_chat_alert(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_market_chat_message(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_logistics_chat_message(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_chat_incident(text, uuid, uuid, uuid, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ceo_get_chat_audit_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_market_chat_message(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_logistics_chat_message(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_chat_incident(text, uuid, uuid, uuid, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ceo_get_chat_audit_messages(uuid) TO authenticated;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transporter_company_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_inspection_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculo_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viaje_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salas_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_waze ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_waze_confirmaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_clima ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticker_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agricultural_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_audit_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requerimientos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_financiados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrival_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_tracking_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ---- ZAFRA_CEO: usa is_zafra_ceo() para evitar JWT claims stale ----
CREATE POLICY "perfiles_select_jwt_zafra_ceo" ON public.perfiles FOR SELECT
  USING (public.is_zafra_ceo());

-- ---- Marketplace: usa get_my_rol() (SECURITY DEFINER + row_security=off) para evitar recursión ----
CREATE POLICY "perfiles_select_jwt_marketplace_cosecha" ON public.perfiles FOR SELECT
  USING (
    public.rls_perfiles_has_cosecha_publicada(id)
    AND public.get_my_rol() IN (
      'independent_producer'::rol_usuario,
      'buyer'::rol_usuario,
      'company'::rol_usuario,
      'agrotienda'::rol_usuario
    )
  );

-- ---- perfiles ----
CREATE POLICY "perfil_ver_propio_o_verified" ON public.perfiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "perfil_editar_propio" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
-- Registro en la app: el usuario recién autenticado crea su fila en perfiles.
CREATE POLICY "perfil_insert_registro" ON public.perfiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND rol IN ('company', 'independent_producer', 'buyer', 'transporter', 'agrotienda')
  );

CREATE POLICY "perfil_select_freight_requester_nombre" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.estado IN ('abierta', 'con_postulaciones')
        AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'transporter'
    )
    OR EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.assigned_transportista_id = auth.uid()
    )
  );
CREATE POLICY "perfil_transportista_por_solicitud_requester" ON public.perfiles FOR SELECT
  USING (
    perfiles.rol = 'transporter'
    AND EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = auth.uid()
        AND (
          fr.assigned_transportista_id = perfiles.id
          OR EXISTS (
            SELECT 1
            FROM public.freight_request_applications fa
            WHERE fa.freight_request_id = fr.id
              AND fa.transportista_id = perfiles.id
          )
        )
    )
  );
CREATE POLICY "perfil_chat_participantes_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.salas_chat sc
      WHERE (sc.comprador_id = auth.uid() OR sc.agricultor_id = auth.uid())
        AND (sc.comprador_id = perfiles.id OR sc.agricultor_id = perfiles.id)
    )
  );
CREATE POLICY "perfil_transporter_link_company_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.transporter_company_links tcl
      JOIN public.companies c ON c.id = tcl.company_id
      WHERE tcl.transporter_id = perfiles.id
        AND c.perfil_id = auth.uid()
    )
  );
CREATE POLICY "perfil_cosecha_marketplace_public" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cosechas c
      WHERE c.agricultor_id = perfiles.id
        AND c.estado = 'publicada'
    )
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') IN (
      'independent_producer',
      'buyer',
      'company',
      'agrotienda'
    )
  );

-- ---- companies ----
CREATE POLICY "company_crud_propio" ON public.companies FOR ALL
  USING (
    public.is_zafra_ceo()
    OR EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol = 'company'
        AND p.id = companies.perfil_id
    )
  )
  WITH CHECK (
    public.is_zafra_ceo()
    OR EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol = 'company'
        AND p.id = companies.perfil_id
    )
  );
CREATE POLICY "companies_bunker_perito_read" ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.field_inspections fi
      INNER JOIN public.company_employees ce ON ce.company_id = fi.empresa_id AND ce.perfil_id = auth.uid() AND ce.activo = TRUE
      WHERE fi.empresa_id = companies.id
    )
  );
CREATE POLICY "companies_transporter_link_read" ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.transporter_company_links tcl
      WHERE tcl.company_id = companies.id
        AND tcl.transporter_id = auth.uid()
        AND tcl.status IN ('pending', 'approved')
    )
  );

-- ---- company_affiliations ----
CREATE POLICY "affiliations_company" ON public.company_affiliations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c JOIN public.perfiles p ON p.id = c.perfil_id WHERE c.id = company_id AND p.id = auth.uid()));

-- ---- transporter_company_links ----
CREATE POLICY "transporter_links_company_all" ON public.transporter_company_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = transporter_company_links.company_id AND c.perfil_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = transporter_company_links.company_id AND c.perfil_id = auth.uid()));
CREATE POLICY "transporter_links_transporter_insert" ON public.transporter_company_links FOR INSERT
  WITH CHECK (
    transporter_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol = 'transporter'
    )
  );
CREATE POLICY "transporter_links_transporter_select" ON public.transporter_company_links FOR SELECT
  USING (transporter_id = auth.uid());
CREATE POLICY "transporter_links_transporter_retry" ON public.transporter_company_links FOR UPDATE
  USING (transporter_id = auth.uid() AND status = 'rejected')
  WITH CHECK (transporter_id = auth.uid() AND status = 'pending');

-- ---- company_employees (búnker) ----
CREATE POLICY "company_employees_super" ON public.company_employees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "company_employees_company_all" ON public.company_employees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_employees.company_id AND c.perfil_id = auth.uid()));
CREATE POLICY "company_employees_perito_select" ON public.company_employees FOR SELECT
  USING (auth.uid() = perfil_id AND activo = TRUE);

-- ---- company_farmers (búnker) ----
CREATE POLICY "company_farmers_super" ON public.company_farmers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "company_farmers_company_all" ON public.company_farmers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_farmers.company_id AND c.perfil_id = auth.uid()));
CREATE POLICY "company_farmers_producer_select" ON public.company_farmers FOR SELECT
  USING (auth.uid() = producer_id AND activo = TRUE);

-- ---- field_inspections ----
CREATE POLICY "field_insp_super" ON public.field_inspections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "field_insp_company_all" ON public.field_inspections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = field_inspections.empresa_id AND c.perfil_id = auth.uid()));
CREATE POLICY "field_insp_perito_rw" ON public.field_inspections FOR SELECT
  USING (
    auth.uid() = perito_id
    AND (
      EXISTS (
        SELECT 1 FROM public.company_employees ce
        WHERE ce.company_id = field_inspections.empresa_id AND ce.perfil_id = auth.uid() AND ce.activo = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM public.peritos pe
        WHERE pe.company_id = field_inspections.empresa_id AND pe.perfil_id = auth.uid() AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  );
CREATE POLICY "field_insp_perito_update" ON public.field_inspections FOR UPDATE
  USING (
    auth.uid() = perito_id
    AND (
      EXISTS (
        SELECT 1 FROM public.company_employees ce
        WHERE ce.company_id = field_inspections.empresa_id AND ce.perfil_id = auth.uid() AND ce.activo = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM public.peritos pe
        WHERE pe.company_id = field_inspections.empresa_id AND pe.perfil_id = auth.uid() AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (auth.uid() = perito_id);
CREATE POLICY "field_insp_producer_select" ON public.field_inspections FOR SELECT
  USING (auth.uid() = productor_id);

CREATE POLICY "finca_field_insp_perito_read" ON public.fincas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.field_inspections fi
      WHERE fi.finca_id = fincas.id
        AND fi.perito_id = auth.uid()
    )
  );

CREATE POLICY "perfil_field_inspection_counterparts_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.field_inspections fi
      WHERE (
        fi.perito_id = auth.uid()
        AND perfiles.id = fi.productor_id
      ) OR (
        fi.productor_id = auth.uid()
        AND perfiles.id = fi.perito_id
      ) OR (
        perfiles.id IN (fi.perito_id, fi.productor_id)
        AND EXISTS (
          SELECT 1
          FROM public.companies c
          WHERE c.id = fi.empresa_id
            AND c.perfil_id = auth.uid()
        )
      )
    )
  );

-- ---- fincas: lectura para empresa sobre productores vinculados ----
CREATE POLICY "finca_bunker_company_read" ON public.fincas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.company_farmers cf ON cf.company_id = c.id AND cf.activo = TRUE
      WHERE c.perfil_id = auth.uid() AND cf.producer_id = fincas.propietario_id
    )
  );

-- ---- perfiles: lectura empresa sobre empleados y agricultores vinculados ----
CREATE POLICY "perfil_bunker_company_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.perfil_id = auth.uid()
        AND (
          EXISTS (SELECT 1 FROM public.company_employees ce WHERE ce.company_id = c.id AND ce.perfil_id = perfiles.id AND ce.activo = TRUE)
          OR EXISTS (SELECT 1 FROM public.company_farmers cf WHERE cf.company_id = c.id AND cf.producer_id = perfiles.id AND cf.activo = TRUE)
        )
    )
  );

-- ---- peritos ----
CREATE POLICY "perito_zafra_ceo" ON public.peritos FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());
CREATE POLICY "perito_company" ON public.peritos FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c JOIN public.perfiles p ON p.id = c.perfil_id WHERE c.id = company_id AND p.id = auth.uid()));

-- ---- fincas ----
CREATE POLICY "finca_crud_propietario" ON public.fincas FOR ALL
  USING (auth.uid() = propietario_id);
CREATE POLICY "finca_lectura_activa" ON public.fincas FOR SELECT
  USING (activa = TRUE);

-- ---- inspecciones ----
CREATE POLICY "inspeccion_perito" ON public.inspecciones FOR ALL
  USING (auth.uid() = perito_id);

-- ---- cosechas ----
CREATE POLICY "cosecha_crud_agricultor" ON public.cosechas FOR ALL
  USING (auth.uid() = agricultor_id);
CREATE POLICY "cosecha_edit_lab_company_perito" ON public.cosechas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'company'::rol_usuario
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.perfiles p
        WHERE p.id = auth.uid() AND p.rol = 'perito'::rol_usuario
      )
      AND EXISTS (
        SELECT 1 FROM public.peritos pe
        WHERE pe.perfil_id = auth.uid() AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  );
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN (
          'independent_producer'::rol_usuario,
          'buyer'::rol_usuario,
          'company'::rol_usuario,
          'agrotienda'::rol_usuario,
          'perito'::rol_usuario
        )
    )
  );

-- ---- vehiculos ----
CREATE POLICY "vehiculo_crud_propietario" ON public.vehiculos FOR ALL
  USING (auth.uid() = propietario_id);
CREATE POLICY "vehiculo_lectura_verified" ON public.vehiculos FOR SELECT
  USING (activo = TRUE AND EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND kyc_estado = 'verified'));

-- ---- vehiculo_docs ----
CREATE POLICY "vehiculo_docs_crud_propietario" ON public.vehiculo_docs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.vehiculos v WHERE v.id = vehiculo_docs.vehiculo_id AND v.propietario_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vehiculos v WHERE v.id = vehiculo_docs.vehiculo_id AND v.propietario_id = auth.uid()));
CREATE POLICY "vehiculo_docs_select_verified" ON public.vehiculo_docs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.kyc_estado = 'verified'));
CREATE POLICY "vehiculo_docs_ceo_all" ON public.vehiculo_docs FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- ---- fletes ----
CREATE POLICY "flete_crud_transportista" ON public.fletes FOR ALL
  USING (auth.uid() = transportista_id);
CREATE POLICY "flete_lectura_verified" ON public.fletes FOR SELECT
  USING (estado = 'available' AND EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND kyc_estado = 'verified'));

-- ---- viajes ----
CREATE POLICY "viajes_crud_transportista" ON public.viajes FOR ALL
  USING (auth.uid() = transportista_id) WITH CHECK (auth.uid() = transportista_id);
CREATE POLICY "viajes_select_freight_requester" ON public.viajes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.freight_requests fr
    WHERE fr.requester_id = auth.uid()
      AND fr.assigned_transportista_id = viajes.transportista_id
      AND fr.estado IN ('asignada', 'completada')
  ));
CREATE POLICY "viajes_ceo_all" ON public.viajes FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- ---- viaje_docs ----
CREATE POLICY "viaje_docs_crud_transportista" ON public.viaje_docs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.viajes v WHERE v.id = viaje_docs.viaje_id AND v.transportista_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.viajes v WHERE v.id = viaje_docs.viaje_id AND v.transportista_id = auth.uid()));
CREATE POLICY "viaje_docs_select_freight_requester" ON public.viaje_docs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.viajes v
    JOIN public.freight_requests fr ON fr.assigned_transportista_id = v.transportista_id
      AND fr.requester_id = auth.uid() AND fr.estado IN ('asignada', 'completada')
    WHERE v.id = viaje_docs.viaje_id
  ));
CREATE POLICY "viaje_docs_ceo_all" ON public.viaje_docs FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- ---- kyc_docs ----
CREATE POLICY "kyc_solo_propio" ON public.kyc_docs FOR ALL
  USING (auth.uid() = perfil_id);

-- ---- chat ----
CREATE POLICY "chat_participantes" ON public.salas_chat FOR ALL
  USING (auth.uid() = comprador_id OR auth.uid() = agricultor_id);
CREATE POLICY "mensajes_participantes" ON public.mensajes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.salas_chat WHERE id = sala_id AND (comprador_id = auth.uid() OR agricultor_id = auth.uid())));

-- ---- chat_incidents ----
CREATE POLICY "chat_incidents_zafra_ceo_select" ON public.chat_incidents FOR SELECT
  USING (public.is_zafra_ceo());
CREATE POLICY "chat_incidents_zafra_ceo_update" ON public.chat_incidents FOR UPDATE
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

-- ---- chat_audit_access_logs ----
CREATE POLICY "chat_audit_logs_zafra_ceo_select" ON public.chat_audit_access_logs FOR SELECT
  USING (public.is_zafra_ceo());

-- ---- alertas_waze ----
CREATE POLICY "alerta_waze_insert" ON public.alertas_waze FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);
CREATE POLICY "alerta_waze_select" ON public.alertas_waze FOR SELECT
  USING (TRUE);
CREATE POLICY "alerta_waze_confirmar" ON public.alertas_waze_confirmaciones FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);

-- ---- calificaciones ----
CREATE POLICY "cal_insert_evaluador" ON public.calificaciones FOR INSERT
  WITH CHECK (auth.uid() = evaluador_id);
CREATE POLICY "cal_select_public" ON public.calificaciones FOR SELECT
  USING (TRUE);

-- ---- field_inspection_counters ----
CREATE POLICY "fic_ceo_all" ON public.field_inspection_counters FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());
CREATE POLICY "fic_empresa_select" ON public.field_inspection_counters FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = empresa_id AND c.perfil_id = auth.uid()));

-- ---- ticker_items ----
CREATE POLICY "ticker_select_activos" ON public.ticker_items FOR SELECT
  USING (activo = TRUE AND (expira_en IS NULL OR expira_en > NOW()));
CREATE POLICY "ticker_ceo_all" ON public.ticker_items FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- ---- alertas_clima ----
CREATE POLICY "alerta_clima_propietario" ON public.alertas_clima FOR ALL
  USING (auth.uid() = perfil_id);

-- ---- admin_audit_logs ----
CREATE POLICY "admin_audit_zafra_ceo_select" ON public.admin_audit_logs FOR SELECT
  USING (public.is_zafra_ceo());
CREATE POLICY "admin_audit_zafra_ceo_insert" ON public.admin_audit_logs FOR INSERT
  WITH CHECK (public.is_zafra_ceo() AND actor_id = auth.uid() AND actor_role = 'zafra_ceo'::rol_usuario);

-- ---- agricultural_inputs (agrotienda) ----
CREATE POLICY "agri_inputs_zafra_ceo" ON public.agricultural_inputs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "agri_inputs_crud_dueno" ON public.agricultural_inputs FOR ALL
  USING (auth.uid() = perfil_id);
CREATE POLICY "agri_inputs_select_mismo_municipio" ON public.agricultural_inputs FOR SELECT
  USING (
    disponibilidad = TRUE
    AND EXISTS (
      SELECT 1 FROM public.perfiles p_tienda
      WHERE p_tienda.id = agricultural_inputs.perfil_id
        AND p_tienda.rol = 'agrotienda'
        AND p_tienda.kyc_estado = 'verified'
        AND p_tienda.municipio IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.perfiles p_user
          WHERE p_user.id = auth.uid()
            AND p_user.kyc_estado = 'verified'
            AND p_user.rol IN (
              'independent_producer'::rol_usuario,
              'buyer'::rol_usuario,
              'agrotienda'::rol_usuario
            )
            AND p_user.municipio IS NOT NULL
            AND p_user.municipio = p_tienda.municipio
        )
    )
  );
CREATE POLICY "agri_inputs_select_nacional_producer_buyer" ON public.agricultural_inputs FOR SELECT
  USING (
    disponibilidad = TRUE
    AND EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND p.rol IN ('independent_producer'::rol_usuario, 'buyer'::rol_usuario)
    )
  );

-- ---- requerimientos_compra ----
CREATE POLICY "req_compra_zafra_ceo" ON public.requerimientos_compra FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "req_compra_buyer_own" ON public.requerimientos_compra FOR ALL
  USING (
    comprador_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('buyer'::rol_usuario, 'independent_producer'::rol_usuario)
    )
  )
  WITH CHECK (
    comprador_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('buyer'::rol_usuario, 'independent_producer'::rol_usuario)
    )
  );
CREATE POLICY "req_compra_select_mercado" ON public.requerimientos_compra FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND (
          (p.rol = 'independent_producer'::rol_usuario AND requerimientos_compra.categoria_destino = 'Cosecha a Granel')
          OR (p.rol = 'company'::rol_usuario AND requerimientos_compra.categoria_destino = 'Volumen Procesado / Silos')
          OR (p.rol = 'agrotienda'::rol_usuario AND requerimientos_compra.categoria_destino = 'Insumos y Maquinaria')
        )
    )
  );

-- ---- lotes_financiados ----
CREATE POLICY "lotes_fin_zafra_ceo" ON public.lotes_financiados FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "lotes_fin_company_rw" ON public.lotes_financiados FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.perfil_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.perfil_id = auth.uid()
    )
  );
CREATE POLICY "lotes_fin_productor_select" ON public.lotes_financiados FOR SELECT
  USING (productor_id = auth.uid());

-- ---- arrival_events ----
CREATE POLICY "arrival_events_insert_own" ON public.arrival_events FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);
CREATE POLICY "arrival_events_select_own" ON public.arrival_events FOR SELECT
  USING (auth.uid() = perfil_id);

-- ---- freight_requests (pizarra) ----
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

-- ---- freight_request_applications ----
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

-- ---- freight_request_notifications (solo lectura para usuarios; INSERT vía trigger) ----
CREATE POLICY "freight_notif_select_own" ON public.freight_request_notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "freight_notif_update_own" ON public.freight_request_notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ---- freight_tracking_updates ----
CREATE POLICY "freight_tracking_select_parties" ON public.freight_tracking_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.id = freight_tracking_updates.freight_request_id
        AND (
          fr.requester_id = auth.uid()
          OR fr.assigned_transportista_id = auth.uid()
        )
    )
  );
CREATE POLICY "freight_tracking_insert_assigned_transportista" ON public.freight_tracking_updates FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.id = freight_request_id
        AND fr.assigned_transportista_id = auth.uid()
        AND fr.estado = 'asignada'
    )
  );

-- ---- logistics_salas ----
CREATE POLICY "logistics_sala_zafra_ceo" ON public.logistics_salas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "logistics_sala_select_parties" ON public.logistics_salas FOR SELECT
  USING (requester_id = auth.uid() OR transportista_id = auth.uid());
CREATE POLICY "logistics_sala_insert_requester" ON public.logistics_salas FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- ---- logistics_mensajes ----
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

-- ---- ad_campaigns, buyer_wishlist, buyer_push_outbox ----
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

CREATE POLICY "buyer_wishlist_super" ON public.buyer_wishlist FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));
CREATE POLICY "buyer_wishlist_own" ON public.buyer_wishlist FOR ALL
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "buyer_push_outbox_own_select" ON public.buyer_push_outbox FOR SELECT
  USING (buyer_id = auth.uid());

-- ================================================================
-- FUNCIONES
-- ================================================================
CREATE OR REPLACE FUNCTION publicar_cosecha(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND kyc_estado = 'verified') THEN
    RAISE EXCEPTION 'KYC_REQUERIDO: Debes verificar tu identidad antes de publicar.';
  END IF;
  UPDATE public.cosechas SET estado = 'publicada', publicado_en = NOW()
    WHERE id = p_id AND agricultor_id = auth.uid();
  INSERT INTO public.ticker_items(tipo, texto, estado_ve, prioridad)
    SELECT 'oferta', '🌽 Nueva cosecha: ' || rubro || ' – ' || cantidad_kg || ' kg | ' || municipio, estado_ve, 8
    FROM public.cosechas WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION cerrar_trato(p_sala UUID, p_precio NUMERIC, p_moneda TEXT DEFAULT 'USD')
RETURNS TABLE(transportista_id UUID, nombre TEXT, distancia_km FLOAT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_coords GEOGRAPHY;
BEGIN
  UPDATE public.salas_chat SET trato_cerrado = TRUE, precio_acordado = p_precio, moneda = p_moneda
    WHERE id = p_sala AND (comprador_id = auth.uid() OR agricultor_id = auth.uid());
  SELECT c.coord_carga INTO v_coords FROM public.salas_chat s JOIN public.cosechas c ON c.id = s.cosecha_id WHERE s.id = p_sala;
  RETURN QUERY
    SELECT p.id, p.nombre, ST_Distance(v_coords, f.origen_coords)::FLOAT / 1000
    FROM public.fletes f JOIN public.perfiles p ON p.id = f.transportista_id
    WHERE f.estado = 'available' AND p.kyc_estado = 'verified'
      AND ST_DWithin(v_coords, f.origen_coords, 30000)
    ORDER BY ST_Distance(v_coords, f.origen_coords) ASC LIMIT 10;
END;
$$;

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

CREATE TRIGGER trg_cosecha_wishlist_push
  AFTER INSERT OR UPDATE OF estado ON public.cosechas
  FOR EACH ROW
  WHEN (NEW.estado = 'publicada')
  EXECUTE FUNCTION public.fn_cosecha_wishlist_enqueue_push();

-- Trigger: Al sincronizar inspección → notificar empresa y agricultor
CREATE OR REPLACE FUNCTION fn_inspeccion_sincronizada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.sincronizado = TRUE AND NOT NEW.aprobado THEN
    UPDATE public.inspecciones SET aprobado = TRUE WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inspeccion_sync
  AFTER UPDATE OF sincronizado ON public.inspecciones
  FOR EACH ROW WHEN (NEW.sincronizado = TRUE)
  EXECUTE FUNCTION fn_inspeccion_sincronizada();

-- Trigger: Alerta Waze de PERITO → verificada automáticamente
CREATE OR REPLACE FUNCTION fn_alerta_perito_verificada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.peritos WHERE perfil_id = NEW.perfil_id) THEN
    NEW.estado := 'verificada';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alerta_perito
  BEFORE INSERT ON public.alertas_waze
  FOR EACH ROW EXECUTE FUNCTION fn_alerta_perito_verificada();

CREATE INDEX idx_alertas_waze_tipo_fecha ON public.alertas_waze(tipo, creado_en DESC);
CREATE INDEX idx_alertas_waze_confirm_alerta ON public.alertas_waze_confirmaciones(alerta_id);

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

-- Trigger: normaliza el auto-registro en fase de prueba sin permitir escaladas de privilegios.
CREATE OR REPLACE FUNCTION public.fn_guardar_perfil_autoservicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Protege la cuenta raíz: no puede degradarse o bloquearse por flujos normales.
  IF TG_OP = 'UPDATE' AND OLD.rol = 'zafra_ceo'::rol_usuario AND auth.role() <> 'service_role' THEN
    NEW.id := OLD.id;
    NEW.rol := OLD.rol;
    NEW.activo := TRUE;
    NEW.bloqueado := FALSE;
    NEW.creado_en := OLD.creado_en;
  END IF;

  -- Service role, SQL editor y zafra_ceo conservan control total.
  IF auth.uid() IS NULL OR auth.role() = 'service_role' OR public.is_zafra_ceo() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'Solo puedes crear tu propio perfil.';
    END IF;
    IF NEW.rol NOT IN ('company', 'independent_producer', 'buyer', 'transporter', 'agrotienda') THEN
      RAISE EXCEPTION 'Rol no permitido para auto-registro.';
    END IF;

    -- Mientras KYC siga desactivado en pruebas, toda alta normal nace operativa.
    NEW.kyc_estado := 'verified';
    NEW.kyc_fecha := COALESCE(NEW.kyc_fecha, NOW());
    NEW.activo := TRUE;
    NEW.bloqueado := FALSE;
    NEW.reputacion := COALESCE(NEW.reputacion, 5.00);
    NEW.total_tratos := COALESCE(NEW.total_tratos, 0);
    NEW.trust_score := COALESCE(NEW.trust_score, 50);
    NEW.zafras_completadas := COALESCE(NEW.zafras_completadas, 0);
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    -- El usuario puede editar datos operativos, pero no privilegios ni contadores sensibles.
    NEW.id := OLD.id;
    NEW.rol := OLD.rol;
    NEW.kyc_estado := OLD.kyc_estado;
    NEW.kyc_fecha := OLD.kyc_fecha;
    NEW.activo := OLD.activo;
    NEW.bloqueado := OLD.bloqueado;
    NEW.reputacion := OLD.reputacion;
    NEW.total_tratos := OLD.total_tratos;
    NEW.trust_score := OLD.trust_score;
    NEW.zafras_completadas := OLD.zafras_completadas;
    NEW.creado_en := OLD.creado_en;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No autorizado para modificar este perfil.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guardar_perfil_autoservicio ON public.perfiles;
CREATE TRIGGER trg_guardar_perfil_autoservicio
  BEFORE INSERT OR UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_guardar_perfil_autoservicio();
