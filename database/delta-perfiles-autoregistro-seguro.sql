-- =============================================================================
-- Perfiles: auto-registro seguro para fase de prueba
-- - Mantiene KYC operativo como "verified" para altas normales de la app
-- - Bloquea escaladas a zafra_ceo/perito desde cliente
-- - Protege columnas sensibles en UPDATE propio
-- - Añade disponibilidad_flete si aún no existe
-- =============================================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS disponibilidad_flete BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "perfil_editar_propio" ON public.perfiles;
CREATE POLICY "perfil_editar_propio" ON public.perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "perfil_insert_registro" ON public.perfiles;
CREATE POLICY "perfil_insert_registro" ON public.perfiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND rol IN ('company', 'independent_producer', 'buyer', 'transporter', 'agrotienda')
  );

DROP TRIGGER IF EXISTS trg_auto_zafra_ceo ON public.perfiles;
DROP FUNCTION IF EXISTS public.fn_auto_zafra_ceo();
DROP FUNCTION IF EXISTS fn_auto_zafra_ceo();

CREATE OR REPLACE FUNCTION public.fn_guardar_perfil_autoservicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.rol = 'zafra_ceo'::rol_usuario AND auth.role() <> 'service_role' THEN
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
