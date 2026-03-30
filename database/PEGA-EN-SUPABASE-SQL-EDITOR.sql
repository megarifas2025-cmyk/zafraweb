-- =============================================================================
-- UNICORNIO AGRO — SUPABASE SQL EDITOR (2 ejecuciones RUN)
-- =============================================================================
-- Error 55P04: el valor nuevo del enum no puede usarse en la misma transacción.
-- Solución: PASO 1 → RUN. Luego nueva pestaña/query → PASO 2 → RUN.
-- =============================================================================

-- ========================================================================= --
--  PASO 1  —  Copia SOLO desde la línea siguiente hasta "-- FIN PASO 1"       --
--            Pega en SQL Editor → Run. Tiene que terminar en Success.        --
-- ========================================================================= --

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'rol_usuario' AND e.enumlabel = 'agrotienda'
  ) THEN
    ALTER TYPE rol_usuario ADD VALUE 'agrotienda';
  END IF;
END $$;

-- FIN PASO 1

-- ========================================================================= --
--  PASO 2  —  NUEVA query. Copia desde "INICIO PASO 2" hasta el final.       --
-- ========================================================================= --

-- INICIO PASO 2

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE categoria_insumo AS ENUM ('quimicos', 'semillas', 'maquinaria');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS doc_prefijo TEXT CHECK (doc_prefijo IS NULL OR doc_prefijo IN ('V','E','J','G')),
  ADD COLUMN IF NOT EXISTS doc_numero TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;

CREATE TABLE IF NOT EXISTS public.agricultural_inputs (
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

CREATE INDEX IF NOT EXISTS idx_agri_inputs_perfil ON public.agricultural_inputs(perfil_id);
CREATE INDEX IF NOT EXISTS idx_agri_inputs_disponible ON public.agricultural_inputs(disponibilidad) WHERE disponibilidad = TRUE;
CREATE INDEX IF NOT EXISTS idx_agri_inputs_nombre ON public.agricultural_inputs USING gin (nombre_producto gin_trgm_ops);

ALTER TABLE public.agricultural_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agri_inputs_zafra_ceo" ON public.agricultural_inputs;
DROP POLICY IF EXISTS "agri_inputs_crud_dueno" ON public.agricultural_inputs;
DROP POLICY IF EXISTS "agri_inputs_select_mismo_municipio" ON public.agricultural_inputs;

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

DROP POLICY IF EXISTS "perfil_insert_registro" ON public.perfiles;
CREATE POLICY "perfil_insert_registro" ON public.perfiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- FIN PASO 2
