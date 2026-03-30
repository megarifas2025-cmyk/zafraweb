DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'rol_usuario'
      AND e.enumlabel = 'super_admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'rol_usuario'
      AND e.enumlabel = 'zafra_ceo'
  ) THEN
    ALTER TYPE public.rol_usuario RENAME VALUE 'super_admin' TO 'zafra_ceo';
  END IF;
END $$;

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
      AND p.rol = 'zafra_ceo'::public.rol_usuario
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_zafra_ceo();
$$;

REVOKE ALL ON FUNCTION public.is_zafra_ceo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_zafra_ceo() TO authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  actor_role   public.rol_usuario NOT NULL,
  action       TEXT NOT NULL,
  target_table TEXT,
  target_id    UUID,
  target_label TEXT,
  reason       TEXT,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON public.admin_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all" ON public.perfiles;
DROP POLICY IF EXISTS "zafra_ceo_all" ON public.perfiles;
CREATE POLICY "zafra_ceo_all" ON public.perfiles FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());

DROP POLICY IF EXISTS "admin_audit_zafra_ceo_select" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "admin_audit_zafra_ceo_insert" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_zafra_ceo_select" ON public.admin_audit_logs FOR SELECT
  USING (public.is_zafra_ceo());
CREATE POLICY "admin_audit_zafra_ceo_insert" ON public.admin_audit_logs FOR INSERT
  WITH CHECK (public.is_zafra_ceo() AND actor_id = auth.uid() AND actor_role = 'zafra_ceo'::public.rol_usuario);

CREATE OR REPLACE FUNCTION public.fn_guardar_perfil_autoservicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.rol = 'zafra_ceo'::public.rol_usuario AND auth.role() <> 'service_role' THEN
    NEW.id := OLD.id;
    NEW.rol := OLD.rol;
    NEW.activo := TRUE;
    NEW.bloqueado := FALSE;
    NEW.creado_en := OLD.creado_en;
  END IF;

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
