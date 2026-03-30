-- Stop 42P17 on perfiles: Postgres ORs ALL permissive policies for each row check.
-- Even when (auth.uid() = id) is true, policies that call get_my_* / is_zafra_ceo /
-- is_verified_transporter still run; those read perfiles under RLS → recursion.
-- Fix: policies on public.perfiles must NOT call functions that SELECT perfiles.
-- Role checks use auth.jwt() -> 'user_metadata' (app sets rol on signUp).

DROP POLICY IF EXISTS "zafra_ceo_all" ON public.perfiles;
CREATE POLICY "zafra_ceo_all" ON public.perfiles FOR ALL
  USING (COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'zafra_ceo')
  WITH CHECK (COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'zafra_ceo');

DROP POLICY IF EXISTS "perfil_cosecha_marketplace_public" ON public.perfiles;
CREATE POLICY "perfil_cosecha_marketplace_public" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cosechas c
      WHERE c.agricultor_id = perfiles.id
        AND c.estado = 'publicada'
    )
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') IN (
      'independent_producer',
      'buyer',
      'company',
      'agrotienda'
    )
  );

DROP POLICY IF EXISTS "perfil_select_freight_requester_nombre" ON public.perfiles;
CREATE POLICY "perfil_select_freight_requester_nombre" ON public.perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.estado IN ('abierta', 'con_postulaciones')
        AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'transporter'
    )
    OR EXISTS (
      SELECT 1
      FROM public.freight_requests fr
      WHERE fr.requester_id = perfiles.id
        AND fr.assigned_transportista_id = auth.uid()
    )
  );
