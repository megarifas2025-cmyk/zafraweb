-- Migración incremental: rol agrotienda + campos perfil + agricultural_inputs
-- Guía con 2 RUN (evita error 55P04 del enum): database/PEGA-EN-SUPABASE-SQL-EDITOR.sql
--
-- Si usas ESTE archivo solo: ejecuta PRIMERO el bloque DO $$ ... ADD VALUE ... $$;
-- en una query y RUN; LUEGO el resto en otra query (no todo junto).

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

-- ⚠️ Para la siguiente sentencia en adelante: NUEVA transacción (nueva query en Supabase).

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
