-- Política UPDATE para que el CEO pueda modificar kyc_estado, bloqueado y activo
-- en perfiles de otros usuarios (no CEO). Antes solo existía perfiles_update_own.

CREATE POLICY "perfiles_update_ceo_governance"
  ON public.perfiles
  FOR UPDATE
  TO authenticated
  USING (
    is_zafra_ceo()
    AND auth.uid() <> id          -- El CEO no se modifica a sí mismo por esta vía
  )
  WITH CHECK (
    is_zafra_ceo()
    AND auth.uid() <> id
  );
