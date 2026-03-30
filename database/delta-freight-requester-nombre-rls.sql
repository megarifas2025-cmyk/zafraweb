-- =============================================================================
-- Delta: nombre del solicitante en pizarra (embed perfiles(nombre) en freight_requests)
-- =============================================================================
-- Problema: el SELECT en cliente hace .select('*, perfiles(nombre)'). RLS en
-- public.perfiles solo permitía leer filas propias o todas las verified (según
-- política base); los solicitantes con KYC pendiente no exponían nombre al join.
--
-- Solución: permitir SELECT al perfil del requester cuando un transportista
-- verificado puede ver la solicitud en pizarra, o cuando eres el transportista
-- asignado (coordinación).
--
-- Idempotente. Supabase → SQL Editor → Run (una vez).
-- No requiere recursión en políticas de perfiles: la comprobación de rol usa
-- función SECURITY DEFINER (mismo patrón que is_zafra_ceo).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_verified_transporter()
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
      AND p.rol = 'transporter'::rol_usuario
      AND p.kyc_estado = 'verified'
  );
$$;

COMMENT ON FUNCTION public.is_verified_transporter() IS
  'Evita recursión RLS: transportista verificado para políticas que referencian perfiles.';

REVOKE ALL ON FUNCTION public.is_verified_transporter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_transporter() TO authenticated;

DROP POLICY IF EXISTS "perfil_select_freight_requester_nombre" ON public.perfiles;

CREATE POLICY "perfil_select_freight_requester_nombre" ON public.perfiles FOR SELECT
  USING (
    -- Pizarra: solicitud abierta y el lector es transportista verificado
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.estado IN ('abierta', 'con_postulaciones')
        AND public.is_verified_transporter()
    )
    OR
    -- Coordinación: asignado a este flete
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.assigned_transportista_id = auth.uid()
    )
  );
