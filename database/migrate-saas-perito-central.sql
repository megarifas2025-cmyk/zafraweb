-- ================================================================
-- SaaS: solo zafra_ceo vincula peritos nuevos (company_employees INSERT).
-- Empresa: solo lectura de peritos / company_employees.
-- Fotos de inspección en Storage (bucket + columna opcional).
-- ================================================================

-- ---- company_employees: empresa ya no INSERT/UPDATE/DELETE ----
DROP POLICY IF EXISTS "company_employees_company_all" ON public.company_employees;

CREATE POLICY "company_employees_company_select" ON public.company_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_employees.company_id AND c.perfil_id = auth.uid()
    )
  );

-- ---- peritos: empresa solo lectura ----
DROP POLICY IF EXISTS "perito_company" ON public.peritos;

CREATE POLICY "perito_company_read" ON public.peritos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = peritos.company_id AND c.perfil_id = auth.uid()
    )
  );

CREATE POLICY "perito_own_read" ON public.peritos FOR SELECT
  USING (perfil_id = auth.uid());

CREATE POLICY "peritos_zafra_ceo" ON public.peritos FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

-- ---- Fotos en inspecciones (URLs tras subir a Storage) ----
ALTER TABLE public.field_inspections
  ADD COLUMN IF NOT EXISTS fotos_urls TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.field_inspections ADD COLUMN IF NOT EXISTS fase_fenologica TEXT;
ALTER TABLE public.field_inspections ADD COLUMN IF NOT EXISTS malezas_reportadas TEXT;
ALTER TABLE public.field_inspections ADD COLUMN IF NOT EXISTS plagas_reportadas TEXT;
ALTER TABLE public.field_inspections ADD COLUMN IF NOT EXISTS recomendacion_insumos TEXT;

-- ---- Storage: bucket privado para fotos de campo ----
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
        SELECT 1 FROM public.field_inspections fi
        JOIN public.companies c ON c.id = fi.empresa_id AND c.perfil_id = auth.uid()
        WHERE fi.fotos_urls IS NOT NULL AND name = ANY (fi.fotos_urls)
      )
    )
  );
