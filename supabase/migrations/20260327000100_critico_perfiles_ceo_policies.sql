-- =============================================================================
-- CRÍTICO – Protección de campos sensibles en perfiles + 17 políticas CEO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- C1. Trigger para bloquear cambios de rol/kyc_estado por usuarios normales
--     RLS WITH CHECK no puede comparar OLD vs NEW directamente → usamos trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_proteger_campos_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.rol IS DISTINCT FROM OLD.rol OR NEW.kyc_estado IS DISTINCT FROM OLD.kyc_estado)
     AND NOT public.is_zafra_ceo()
  THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: No puedes modificar tu rol o estado KYC directamente.'
      USING HINT = 'Contacta al administrador para cambios de rol o verificación.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_campos_perfil ON public.perfiles;
CREATE TRIGGER trg_proteger_campos_perfil
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_proteger_campos_perfil();

-- -----------------------------------------------------------------------------
-- C2. Reemplazar las 17 políticas CEO que usan subquery por is_zafra_ceo()
--     Más rápido (función STABLE cacheada), consistente y sin riesgo de recursión
-- -----------------------------------------------------------------------------

-- ad_campaigns
DROP POLICY IF EXISTS "ad_campaigns_super" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns_ceo_all" ON public.ad_campaigns FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- agricultural_inputs  (había dos: agri_inputs_zafra_ceo y agri_inputs_super_admin)
DROP POLICY IF EXISTS "agri_inputs_zafra_ceo" ON public.agricultural_inputs;
DROP POLICY IF EXISTS "agri_inputs_super_admin" ON public.agricultural_inputs;
CREATE POLICY "agri_inputs_ceo_all" ON public.agricultural_inputs FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- buyer_wishlist
DROP POLICY IF EXISTS "buyer_wishlist_super" ON public.buyer_wishlist;
CREATE POLICY "buyer_wishlist_ceo_all" ON public.buyer_wishlist FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- company_employees
DROP POLICY IF EXISTS "company_employees_super" ON public.company_employees;
CREATE POLICY "company_employees_ceo_all" ON public.company_employees FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- company_farmers
DROP POLICY IF EXISTS "company_farmers_super" ON public.company_farmers;
CREATE POLICY "company_farmers_ceo_all" ON public.company_farmers FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- company_fleet_units
DROP POLICY IF EXISTS "company_fleet_super" ON public.company_fleet_units;
CREATE POLICY "company_fleet_ceo_all" ON public.company_fleet_units FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- early_warnings
DROP POLICY IF EXISTS "early_warn_super" ON public.early_warnings;
CREATE POLICY "early_warn_ceo_all" ON public.early_warnings FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- field_logs
DROP POLICY IF EXISTS "field_logs_super" ON public.field_logs;
CREATE POLICY "field_logs_ceo_all" ON public.field_logs FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- freight_request_applications
DROP POLICY IF EXISTS "freight_app_super_admin" ON public.freight_request_applications;
CREATE POLICY "freight_app_ceo_all" ON public.freight_request_applications FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- freight_requests
DROP POLICY IF EXISTS "freight_req_super_admin" ON public.freight_requests;
DROP POLICY IF EXISTS "freight_req_zafra_ceo" ON public.freight_requests;
CREATE POLICY "freight_req_ceo_all" ON public.freight_requests FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- logistics_mensajes
DROP POLICY IF EXISTS "logistics_msg_super_admin" ON public.logistics_mensajes;
CREATE POLICY "logistics_msg_ceo_all" ON public.logistics_mensajes FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- logistics_salas
DROP POLICY IF EXISTS "logistics_sala_super_admin" ON public.logistics_salas;
CREATE POLICY "logistics_sala_ceo_all" ON public.logistics_salas FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- lotes_financiados
DROP POLICY IF EXISTS "lotes_fin_zafra_ceo" ON public.lotes_financiados;
CREATE POLICY "lotes_fin_ceo_all" ON public.lotes_financiados FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- machinery_rentals
DROP POLICY IF EXISTS "machinery_super" ON public.machinery_rentals;
CREATE POLICY "machinery_ceo_all" ON public.machinery_rentals FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- peritos
DROP POLICY IF EXISTS "peritos_super_admin" ON public.peritos;
CREATE POLICY "peritos_ceo_all" ON public.peritos FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());

-- requerimientos_compra (había dos duplicadas: req_compra_zafra_ceo y req_compra_super_admin)
DROP POLICY IF EXISTS "req_compra_zafra_ceo" ON public.requerimientos_compra;
DROP POLICY IF EXISTS "req_compra_super_admin" ON public.requerimientos_compra;
CREATE POLICY "req_compra_ceo_all" ON public.requerimientos_compra FOR ALL
  USING (public.is_zafra_ceo()) WITH CHECK (public.is_zafra_ceo());
