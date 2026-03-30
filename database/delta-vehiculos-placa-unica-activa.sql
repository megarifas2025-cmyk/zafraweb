-- =============================================================================
-- ZafraClic - unicidad de placa activa en flota transportista
-- Evita que dos cuentas mantengan la misma placa activa al mismo tiempo.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vehiculos
    WHERE activo = TRUE
    GROUP BY UPPER(REGEXP_REPLACE(placa, '[^A-Z0-9]', '', 'g'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen placas activas duplicadas en public.vehiculos. Corrige esas filas antes de aplicar el índice único.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.vehiculos_placa_activa_unique_idx;

CREATE UNIQUE INDEX vehiculos_placa_activa_unique_idx
  ON public.vehiculos (UPPER(REGEXP_REPLACE(placa, '[^A-Z0-9]', '', 'g')))
  WHERE activo = TRUE;
