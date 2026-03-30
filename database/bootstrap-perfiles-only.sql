-- ================================================================
-- INICIO RÁPIDO sin schema.sql completo (no usa PostGIS).
-- Crea solo public.perfiles + RLS para REGISTRO y LOGIN.
-- Pégalo entero en Supabase → SQL Editor → Run.
-- Luego: regístrate de nuevo en la app.
-- Cuando quieras fincas/chat/etc., ejecuta database/schema.sql
-- (activa extensión PostGIS en Database → Extensions si hace falta).
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE public.rol_usuario AS ENUM (
    'zafra_ceo', 'company', 'perito', 'independent_producer', 'buyer', 'transporter', 'agrotienda'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kyc_estado AS ENUM (
    'pendiente', 'en_revision', 'verified', 'rechazado', 'bloqueado'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.perfiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol          public.rol_usuario NOT NULL,
  nombre       TEXT NOT NULL,
  telefono     TEXT,
  estado_ve    TEXT NOT NULL DEFAULT 'Venezuela',
  municipio    TEXT,
  kyc_estado   public.kyc_estado NOT NULL DEFAULT 'pendiente',
  kyc_fecha    TIMESTAMPTZ,
  avatar_url   TEXT,
  reputacion   NUMERIC(3,2) DEFAULT 5.00 CHECK (reputacion BETWEEN 0 AND 5),
  total_tratos INTEGER DEFAULT 0,
  activo       BOOLEAN DEFAULT TRUE,
  bloqueado    BOOLEAN DEFAULT FALSE,
  creado_en    TIMESTAMPTZ DEFAULT NOW(),
  actualizado  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfil_ver_propio_o_verified" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_editar_propio" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_insert_registro" ON public.perfiles;
DROP POLICY IF EXISTS "zafra_ceo_all" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_select" ON public.perfiles;
DROP POLICY IF EXISTS "perfil_update_own" ON public.perfiles;

CREATE POLICY "perfil_select" ON public.perfiles FOR SELECT
  USING (auth.uid() = id OR kyc_estado = 'verified');

CREATE POLICY "perfil_insert_registro" ON public.perfiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "perfil_update_own" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id);
