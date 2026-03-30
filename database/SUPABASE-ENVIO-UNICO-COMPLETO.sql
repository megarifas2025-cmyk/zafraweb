-- =============================================================================
-- ZafraClic — ENVÍO ÚNICO A SUPABASE (un solo documento / un solo Run)
-- Generado por: node scripts/build-supabase-envio-unico.cjs
-- =============================================================================
--
-- CUÁNDO USAR ESTE ARCHIVO
--   • Proyecto Supabase con base NUEVA o casi vacía (sin tablas de la app).
--   • Dashboard → SQL Editor → pega TODO el archivo → Run.
--
-- CUÁNDO NO USARLO (error típico: tipo «rol_usuario» ya existe / 42710)
--   • Si tu BD YA tiene el schema: usa en su lugar:
--       database/SUPABASE-ENVIO-UNICO-COMPLETO-SIN-SCHEMA-BASE.sql
--
-- CONTENIDO (en orden)
--   1) SUPABASE-TODO-EN-UNO.sql
--   2) SUPABASE-PENDIENTES-UN-SOLO-RUN.sql
--   3) delta-vehiculos-rls-propietario.sql
--
-- DESPUÉS: database/verificar-tablas-clave.sql | Storage | Auth redirects
-- =============================================================================

-- =============================================================================
-- UNICORNIO AGRO — TODO EN UNO (UN SOLO PEGADO → SUPABASE SQL EDITOR → RUN)
-- =============================================================================
-- CUÁNDO USAR ESTE ARCHIVO
--   • Base de datos NUEVA o vacía (sin tablas públicas de la app).
--   • Un solo envío: pega TODO el archivo y ejecuta Run una vez.
--
-- CUÁNDO NO USARLO
--   • Proyecto Supabase que YA tiene tablas/creado con schema o migrates.
--     Error típico: 42710 — tipo «rol_usuario» ya existe.
--     En ese caso usa SUPABASE-SOLO-DELTAS.sql (un pegado sin schema) o migrate-*.sql sueltos.
--
-- CONTENIDO (orden)
--   1) schema.sql — núcleo completo (perfiles, fincas, cosechas, búnker, freight, agro…)
--   2) Módulo empresa — vistas, flota, RPC perito, RLS cosechas/transportistas
--   3) Panel productor — early_warnings, field_logs, machinery_rentals, trust
--   4) Upgrade maquinaria — idempotente (solo si había columnas legadas inicio/fin)
--
-- POST-SETUP
--   • Storage: bucket "early-warnings" si usas fotos S.O.S (Dashboard → Storage).
--   • Este script NO sustituye políticas de Auth ni seed de usuarios.
--   • El núcleo embebido puede ir por detrás de database/schema.sql del repo (deltas nuevos).
--     Tras un RUN de este archivo, aplica también el bundle generado:
--       npm run supabase:gen-deltas-bundle
--     y ejecuta database/supabase-APLICAR-DELTAS-RECENTES.sql (o supabase:apply-deltas).
-- =============================================================================
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
CREATE TYPE kyc_estado AS ENUM ('pendiente','en_revision','verified','rechazado','bloqueado');
CREATE TYPE cosecha_estado AS ENUM ('borrador','publicada','negociando','vendida','cancelada');
CREATE TYPE flete_estado AS ENUM ('available','asignado','en_ruta','completado','cancelado');
CREATE TYPE freight_request_estado AS ENUM ('abierta','con_postulaciones','asignada','cancelada');
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
  doc_prefijo  TEXT CHECK (doc_prefijo IS NULL OR doc_prefijo IN ('V','E','J','G')),
  doc_numero   TEXT,
  fecha_nacimiento DATE
);

-- ================================================================
-- COMPANIES (Empresas/Silos)
-- ================================================================
CREATE TABLE public.companies (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  perfil_id          UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  razon_social       TEXT NOT NULL,
  rif                TEXT NOT NULL UNIQUE,
  logo_url           TEXT        NOT NULL DEFAULT '',
  direccion          TEXT,
  direccion_fiscal   TEXT        NOT NULL DEFAULT '',
  telefono_contacto  TEXT        NOT NULL DEFAULT '',
  correo_contacto    TEXT        NOT NULL DEFAULT '',
  descripcion        TEXT,
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

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
  fecha_programada       DATE NOT NULL,
  coordenadas_gps        GEOGRAPHY(POINT, 4326),
  observaciones_tecnicas TEXT,
  insumos_recomendados   JSONB NOT NULL DEFAULT '[]'::jsonb,
  estatus                field_inspection_estatus NOT NULL DEFAULT 'pending',
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_field_insp_empresa ON public.field_inspections(empresa_id);
CREATE INDEX idx_field_insp_perito_estatus ON public.field_inspections(perito_id, estatus);
CREATE INDEX idx_field_insp_productor ON public.field_inspections(productor_id);

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
  leido     BOOLEAN DEFAULT FALSE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mensajes_sala ON public.mensajes(sala_id, creado_en ASC);

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
  categoria        categoria_insumo NOT NULL,
  descripcion      TEXT,
  imagen_url       TEXT,
  disponibilidad   BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agri_inputs_perfil ON public.agricultural_inputs(perfil_id);
CREATE INDEX idx_agri_inputs_disponible ON public.agricultural_inputs(disponibilidad) WHERE disponibilidad = TRUE;
CREATE INDEX idx_agri_inputs_nombre ON public.agricultural_inputs USING gin (nombre_producto gin_trgm_ops);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peritos ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.agricultural_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_request_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_mensajes ENABLE ROW LEVEL SECURITY;

-- Helper RLS: evita 42P17 (recursión infinita) en políticas sobre perfiles
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

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_verified_transporter()
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
      AND p.rol = 'transporter'::rol_usuario
      AND p.kyc_estado = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.is_verified_transporter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_transporter() TO authenticated;

-- ---- ZAFRA_CEO: control total ----
CREATE POLICY "zafra_ceo_all" ON public.perfiles FOR ALL
  USING (public.is_zafra_ceo());

-- ---- perfiles ----
CREATE POLICY "perfil_ver_propio_o_verified" ON public.perfiles FOR SELECT
  USING (auth.uid() = id OR kyc_estado = 'verified');
CREATE POLICY "perfil_editar_propio" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id);
-- Registro en la app: el usuario recién autenticado crea su fila en perfiles.
CREATE POLICY "perfil_insert_registro" ON public.perfiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "perfil_select_freight_requester_nombre" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.estado IN ('abierta', 'con_postulaciones')
        AND public.is_verified_transporter()
    )
    OR EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.assigned_transportista_id = auth.uid()
    )
  );

-- ---- companies ----
CREATE POLICY "company_crud_propio" ON public.companies FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND (p.rol = 'company' AND p.id = perfil_id) OR p.rol = 'zafra_ceo'));
CREATE POLICY "companies_bunker_perito_read" ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.field_inspections fi
      INNER JOIN public.company_employees ce ON ce.company_id = fi.empresa_id AND ce.perfil_id = auth.uid() AND ce.activo = TRUE
      WHERE fi.empresa_id = companies.id
    )
  );

-- ---- company_affiliations ----
CREATE POLICY "affiliations_company" ON public.company_affiliations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.companies c JOIN public.perfiles p ON p.id = c.perfil_id WHERE c.id = company_id AND p.id = auth.uid()));

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
CREATE POLICY "field_insp_perito_rw" ON public.field_inspections FOR ALL
  USING (
    auth.uid() = perito_id
    AND EXISTS (
      SELECT 1 FROM public.company_employees ce
      WHERE ce.company_id = field_inspections.empresa_id AND ce.perfil_id = auth.uid() AND ce.activo = TRUE
    )
  );
CREATE POLICY "field_insp_producer_select" ON public.field_inspections FOR SELECT
  USING (auth.uid() = productor_id);

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
      LEFT JOIN public.peritos pe ON pe.perfil_id = auth.uid()
      LEFT JOIN public.companies c ON c.perfil_id = auth.uid()
      WHERE (p.rol = 'company' AND p.id = auth.uid()) OR (c.id = pe.company_id AND pe.perfil_id = auth.uid())
    )
  );
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND kyc_estado = 'verified')
  );

-- ---- vehiculos ----
CREATE POLICY "vehiculo_crud_propietario" ON public.vehiculos FOR ALL
  USING (auth.uid() = propietario_id);
CREATE POLICY "vehiculo_lectura_verified" ON public.vehiculos FOR SELECT
  USING (activo = TRUE AND EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND kyc_estado = 'verified'));

-- ---- fletes ----
CREATE POLICY "flete_crud_transportista" ON public.fletes FOR ALL
  USING (auth.uid() = transportista_id);
CREATE POLICY "flete_lectura_verified" ON public.fletes FOR SELECT
  USING (estado = 'available' AND EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND kyc_estado = 'verified'));

-- ---- kyc_docs ----
CREATE POLICY "kyc_solo_propio" ON public.kyc_docs FOR ALL
  USING (auth.uid() = perfil_id);

-- ---- chat ----
CREATE POLICY "chat_participantes" ON public.salas_chat FOR ALL
  USING (auth.uid() = comprador_id OR auth.uid() = agricultor_id);
CREATE POLICY "mensajes_participantes" ON public.mensajes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.salas_chat WHERE id = sala_id AND (comprador_id = auth.uid() OR agricultor_id = auth.uid())));

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

-- ---- alertas_clima ----
CREATE POLICY "alerta_clima_propietario" ON public.alertas_clima FOR ALL
  USING (auth.uid() = perfil_id);

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
            AND p_user.municipio IS NOT NULL
            AND p_user.municipio = p_tienda.municipio
        )
    )
  );

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

-- Seguridad: no se permite auto-asenso a zafra_ceo por correo.
DROP TRIGGER IF EXISTS trg_auto_zafra_ceo ON public.perfiles;
DROP FUNCTION IF EXISTS public.fn_auto_zafra_ceo();
DROP FUNCTION IF EXISTS fn_auto_zafra_ceo();


-- =============================================================================
-- SECCIÓN: MÓDULO EMPRESA (tras schema base)
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


-- ##############################################################################
-- PARTE 2 — PENDIENTES (mercado comprador, RLS perfiles, …)
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
-- PARTE 3 — vehículos RLS (transportista)
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
