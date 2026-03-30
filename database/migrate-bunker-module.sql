-- ================================================================
-- MÓDULO BÚNKER – Afiliación + field_inspections (órdenes de campo)
-- Ejecutar en Supabase SQL Editor
-- ================================================================

-- ---- 1) companies: datos fiscales ----
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS telefono_contacto TEXT,
  ADD COLUMN IF NOT EXISTS correo_contacto TEXT;

UPDATE public.companies SET
  direccion_fiscal = COALESCE(
    NULLIF(btrim(direccion_fiscal), ''),
    NULLIF(btrim(direccion), ''),
    'Pendiente'
  ),
  telefono_contacto = COALESCE(NULLIF(btrim(telefono_contacto), ''), ''),
  correo_contacto = COALESCE(NULLIF(btrim(correo_contacto), ''), '')
WHERE direccion_fiscal IS NULL OR direccion_fiscal = ''
   OR telefono_contacto IS NULL
   OR correo_contacto IS NULL;

ALTER TABLE public.companies ALTER COLUMN direccion_fiscal SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN telefono_contacto SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN correo_contacto SET NOT NULL;

UPDATE public.companies SET logo_url = COALESCE(logo_url, '') WHERE logo_url IS NULL;
ALTER TABLE public.companies ALTER COLUMN logo_url SET DEFAULT '';
ALTER TABLE public.companies ALTER COLUMN logo_url SET NOT NULL;

-- ---- 2) company_employees ----
CREATE TABLE IF NOT EXISTS public.company_employees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  perfil_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, perfil_id)
);
CREATE INDEX IF NOT EXISTS idx_company_employees_company ON public.company_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_company_employees_perfil ON public.company_employees(perfil_id);

-- ---- 3) company_farmers ----
CREATE TABLE IF NOT EXISTS public.company_farmers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, producer_id)
);
CREATE INDEX IF NOT EXISTS idx_company_farmers_company ON public.company_farmers(company_id);
CREATE INDEX IF NOT EXISTS idx_company_farmers_producer ON public.company_farmers(producer_id);

INSERT INTO public.company_employees (company_id, perfil_id, activo)
SELECT DISTINCT p.company_id, p.perfil_id, COALESCE(p.activo, TRUE)
FROM public.peritos p
ON CONFLICT (company_id, perfil_id) DO NOTHING;

INSERT INTO public.company_farmers (company_id, producer_id, activo)
SELECT DISTINCT a.company_id, a.producer_id, COALESCE(a.activo, TRUE)
FROM public.company_affiliations a
ON CONFLICT (company_id, producer_id) DO NOTHING;

-- ---- 4) field_inspections ----
DO $$ BEGIN
  CREATE TYPE public.field_inspection_estatus AS ENUM ('pending', 'in_progress', 'synced', 'approved');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.field_inspection_counters (
  empresa_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.field_inspections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_control         TEXT NOT NULL UNIQUE,
  empresa_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  perito_id              UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  productor_id           UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  fecha_programada       DATE NOT NULL,
  coordenadas_gps        GEOGRAPHY(POINT, 4326),
  observaciones_tecnicas TEXT,
  insumos_recomendados   JSONB NOT NULL DEFAULT '[]'::jsonb,
  estatus                public.field_inspection_estatus NOT NULL DEFAULT 'pending',
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_insp_empresa ON public.field_inspections(empresa_id);
CREATE INDEX IF NOT EXISTS idx_field_insp_perito_estatus ON public.field_inspections(perito_id, estatus);
CREATE INDEX IF NOT EXISTS idx_field_insp_productor ON public.field_inspections(productor_id);

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

DROP TRIGGER IF EXISTS trg_field_insp_numero ON public.field_inspections;
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

DROP TRIGGER IF EXISTS trg_field_insp_touch ON public.field_inspections;
CREATE TRIGGER trg_field_insp_touch
  BEFORE UPDATE ON public.field_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_field_insp_touch();

-- Sincronizar nuevos peritos → company_employees
CREATE OR REPLACE FUNCTION public.fn_sync_perito_employee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.company_employees (company_id, perfil_id, activo)
  VALUES (NEW.company_id, NEW.perfil_id, COALESCE(NEW.activo, TRUE))
  ON CONFLICT (company_id, perfil_id) DO UPDATE SET activo = EXCLUDED.activo;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_perito_employee ON public.peritos;
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

DROP TRIGGER IF EXISTS trg_sync_affiliation_farmer ON public.company_affiliations;
CREATE TRIGGER trg_sync_affiliation_farmer
  AFTER INSERT OR UPDATE ON public.company_affiliations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_affiliation_farmer();

-- ---- 5) RLS ----
ALTER TABLE public.company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_employees_super" ON public.company_employees;
DROP POLICY IF EXISTS "company_employees_company_all" ON public.company_employees;
DROP POLICY IF EXISTS "company_employees_perito_select" ON public.company_employees;

CREATE POLICY "company_employees_super" ON public.company_employees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "company_employees_company_all" ON public.company_employees FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_employees.company_id AND c.perfil_id = auth.uid()
    )
  );

CREATE POLICY "company_employees_perito_select" ON public.company_employees FOR SELECT
  USING (auth.uid() = perfil_id AND activo = TRUE);

DROP POLICY IF EXISTS "company_farmers_super" ON public.company_farmers;
DROP POLICY IF EXISTS "company_farmers_company_all" ON public.company_farmers;
DROP POLICY IF EXISTS "company_farmers_producer_select" ON public.company_farmers;

CREATE POLICY "company_farmers_super" ON public.company_farmers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "company_farmers_company_all" ON public.company_farmers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_farmers.company_id AND c.perfil_id = auth.uid()
    )
  );

CREATE POLICY "company_farmers_producer_select" ON public.company_farmers FOR SELECT
  USING (auth.uid() = producer_id AND activo = TRUE);

DROP POLICY IF EXISTS "field_insp_super" ON public.field_inspections;
DROP POLICY IF EXISTS "field_insp_company_all" ON public.field_inspections;
DROP POLICY IF EXISTS "field_insp_perito_rw" ON public.field_inspections;
DROP POLICY IF EXISTS "field_insp_producer_select" ON public.field_inspections;

CREATE POLICY "field_insp_super" ON public.field_inspections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'zafra_ceo'));

CREATE POLICY "field_insp_company_all" ON public.field_inspections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = field_inspections.empresa_id AND c.perfil_id = auth.uid()
    )
  );

CREATE POLICY "field_insp_perito_rw" ON public.field_inspections FOR ALL
  USING (
    auth.uid() = perito_id
    AND EXISTS (
      SELECT 1 FROM public.company_employees ce
      WHERE ce.company_id = field_inspections.empresa_id
        AND ce.perfil_id = auth.uid()
        AND ce.activo = TRUE
    )
  );

CREATE POLICY "field_insp_producer_select" ON public.field_inspections FOR SELECT
  USING (auth.uid() = productor_id);

-- Empresa: solo fincas de productores vinculados en company_farmers
DROP POLICY IF EXISTS "finca_bunker_company_read" ON public.fincas;
CREATE POLICY "finca_bunker_company_read" ON public.fincas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      JOIN public.company_farmers cf ON cf.company_id = c.id AND cf.activo = TRUE
      WHERE c.perfil_id = auth.uid() AND cf.producer_id = fincas.propietario_id
    )
  );

-- Empresa: leer perfiles de empleados y agricultores vinculados
DROP POLICY IF EXISTS "perfil_bunker_company_read" ON public.perfiles;
CREATE POLICY "perfil_bunker_company_read" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.perfil_id = auth.uid()
        AND (
          EXISTS (
            SELECT 1 FROM public.company_employees ce
            WHERE ce.company_id = c.id AND ce.perfil_id = perfiles.id AND ce.activo = TRUE
          )
          OR EXISTS (
            SELECT 1 FROM public.company_farmers cf
            WHERE cf.company_id = c.id AND cf.producer_id = perfiles.id AND cf.activo = TRUE
          )
        )
    )
  );

-- Empresa: lectura limitada por peritos con orden de campo asignada
DROP POLICY IF EXISTS "companies_bunker_perito_read" ON public.companies;
CREATE POLICY "companies_bunker_perito_read" ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.field_inspections fi
      INNER JOIN public.company_employees ce ON ce.company_id = fi.empresa_id AND ce.perfil_id = auth.uid() AND ce.activo = TRUE
      WHERE fi.empresa_id = companies.id
    )
  );
