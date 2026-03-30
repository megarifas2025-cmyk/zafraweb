CREATE TABLE IF NOT EXISTS public.transporter_company_links (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transporter_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transporter_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_transporter_links_company
  ON public.transporter_company_links(company_id, status, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_transporter_links_transporter
  ON public.transporter_company_links(transporter_id, status, creado_en DESC);

ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS vehiculo_id UUID REFERENCES public.vehiculos(id),
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS driver_document TEXT,
  ADD COLUMN IF NOT EXISTS driver_has_app BOOLEAN,
  ADD COLUMN IF NOT EXISTS driver_has_gps BOOLEAN,
  ADD COLUMN IF NOT EXISTS driver_notes TEXT;

ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS driver_has_gps_phone BOOLEAN,
  ADD COLUMN IF NOT EXISTS driver_app_ready BOOLEAN,
  ADD COLUMN IF NOT EXISTS device_notes TEXT;

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

DROP TRIGGER IF EXISTS trg_transporter_company_link_notify ON public.transporter_company_links;
CREATE TRIGGER trg_transporter_company_link_notify
  AFTER INSERT OR UPDATE ON public.transporter_company_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_transporter_company_link_notify();

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
      actualizado_en = NOW()
  WHERE id = p_freight_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_freight_execution(uuid, uuid, text, text, text, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_freight_execution(uuid, uuid, text, text, text, boolean, boolean, text) TO authenticated;

ALTER TABLE public.transporter_company_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_transporter_link_read" ON public.companies;
DROP POLICY IF EXISTS "perfil_transporter_link_company_read" ON public.perfiles;
DROP POLICY IF EXISTS "transporter_links_company_all" ON public.transporter_company_links;
DROP POLICY IF EXISTS "transporter_links_transporter_insert" ON public.transporter_company_links;
DROP POLICY IF EXISTS "transporter_links_transporter_select" ON public.transporter_company_links;
DROP POLICY IF EXISTS "transporter_links_transporter_retry" ON public.transporter_company_links;

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
