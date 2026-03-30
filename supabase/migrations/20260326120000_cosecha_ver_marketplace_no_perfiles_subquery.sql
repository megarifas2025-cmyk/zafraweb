-- Breaks perfiles ↔ cosechas RLS cycle:
-- perfil_cosecha_marketplace_public does EXISTS (SELECT FROM cosechas ...).
-- cosecha_ver_marketplace used get_my_* which SELECT from perfiles → 42P17.

DROP POLICY IF EXISTS "cosecha_ver_marketplace" ON public.cosechas;
CREATE POLICY "cosecha_ver_marketplace" ON public.cosechas FOR SELECT
  USING (
    estado = 'publicada'
    AND COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') IN (
      'independent_producer',
      'buyer',
      'company',
      'agrotienda',
      'perito'
    )
  );

-- UPDATE policy: avoid reading perfiles inside cosechas policy (same class of issue under nested checks).
DROP POLICY IF EXISTS "cosecha_edit_lab_company_perito" ON public.cosechas;
CREATE POLICY "cosecha_edit_lab_company_perito" ON public.cosechas FOR UPDATE
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'company'
    OR (
      COALESCE((auth.jwt() -> 'user_metadata' ->> 'rol'), '') = 'perito'
      AND EXISTS (
        SELECT 1
        FROM public.peritos pe
        WHERE pe.perfil_id = auth.uid()
          AND COALESCE(pe.activo, TRUE) = TRUE
      )
    )
  );
