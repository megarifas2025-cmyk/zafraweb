DROP POLICY IF EXISTS "field_insp_perito_rw" ON public.field_inspections;
DROP POLICY IF EXISTS "field_insp_perito_update" ON public.field_inspections;

CREATE POLICY "field_insp_perito_rw" ON public.field_inspections FOR SELECT
  USING (
    auth.uid() = perito_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.company_employees ce
        WHERE ce.company_id = field_inspections.empresa_id
          AND ce.perfil_id = auth.uid()
          AND ce.activo = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.peritos pe
        WHERE pe.company_id = field_inspections.empresa_id
          AND pe.perfil_id = auth.uid()
          AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "field_insp_perito_update" ON public.field_inspections FOR UPDATE
  USING (
    auth.uid() = perito_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.company_employees ce
        WHERE ce.company_id = field_inspections.empresa_id
          AND ce.perfil_id = auth.uid()
          AND ce.activo = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.peritos pe
        WHERE pe.company_id = field_inspections.empresa_id
          AND pe.perfil_id = auth.uid()
          AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (auth.uid() = perito_id);

DROP POLICY IF EXISTS "cosecha_edit_lab_company_perito" ON public.cosechas;
CREATE POLICY "cosecha_edit_lab_company_perito" ON public.cosechas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND (
          p.rol = 'company'
          OR (
            p.rol = 'perito'
            AND EXISTS (
              SELECT 1
              FROM public.peritos pe
              WHERE pe.perfil_id = auth.uid()
                AND COALESCE(pe.activo, TRUE) = TRUE
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "cosecha_ver_marketplace" ON public.cosechas;
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.kyc_estado = 'verified'
        AND p.rol IN (
          'independent_producer'::rol_usuario,
          'buyer'::rol_usuario,
          'company'::rol_usuario,
          'agrotienda'::rol_usuario,
          'perito'::rol_usuario
        )
    )
  );

ALTER TABLE public.field_inspections
  ADD COLUMN IF NOT EXISTS finca_id UUID REFERENCES public.fincas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_inspeccion TEXT NOT NULL DEFAULT 'seguimiento_tecnico',
  ADD COLUMN IF NOT EXISTS estado_acta TEXT NOT NULL DEFAULT 'borrador_local',
  ADD COLUMN IF NOT EXISTS resumen_dictamen TEXT,
  ADD COLUMN IF NOT EXISTS porcentaje_dano NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS estimacion_rendimiento_ton NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS area_verificada_ha NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precision_gps_m NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fuera_de_lote BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fotos_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS evidencias_fotos JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS firma_perito JSONB,
  ADD COLUMN IF NOT EXISTS firma_productor JSONB,
  ADD COLUMN IF NOT EXISTS firmado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fase_fenologica TEXT,
  ADD COLUMN IF NOT EXISTS malezas_reportadas TEXT,
  ADD COLUMN IF NOT EXISTS plagas_reportadas TEXT,
  ADD COLUMN IF NOT EXISTS recomendacion_insumos TEXT;

CREATE INDEX IF NOT EXISTS idx_field_insp_finca ON public.field_inspections(finca_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('field-inspection-photos', 'field-inspection-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "field_insp_photos_perito_insert" ON storage.objects;
DROP POLICY IF EXISTS "field_insp_photos_perito_select" ON storage.objects;

CREATE POLICY "field_insp_photos_perito_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'field-inspection-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "field_insp_photos_perito_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'field-inspection-photos'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo')
      OR EXISTS (
        SELECT 1
        FROM public.field_inspections fi
        JOIN public.companies c ON c.id = fi.empresa_id AND c.perfil_id = auth.uid()
        WHERE fi.fotos_urls IS NOT NULL
          AND name = ANY (fi.fotos_urls)
      )
    )
  );

DROP POLICY IF EXISTS "finca_field_insp_perito_read" ON public.fincas;
CREATE POLICY "finca_field_insp_perito_read" ON public.fincas FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.field_inspections fi
      WHERE fi.finca_id = fincas.id
        AND fi.perito_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "perfil_field_inspection_counterparts_read" ON public.perfiles;
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
