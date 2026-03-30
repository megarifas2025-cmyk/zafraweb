-- =============================================================================
-- UNICORNIO — Soporte de sublotes financiados
-- =============================================================================
-- Permite repartir una misma finca entre varias empresas por hectáreas, dejando
-- que el remanente se considere superficie propia del productor.
-- =============================================================================

ALTER TABLE public.lotes_financiados
  ADD COLUMN IF NOT EXISTS sub_lote_nombre TEXT,
  ADD COLUMN IF NOT EXISTS hectareas_asignadas NUMERIC(14,2);

ALTER TABLE public.lotes_financiados
  DROP CONSTRAINT IF EXISTS lotes_financiados_hectareas_asignadas_check;

ALTER TABLE public.lotes_financiados
  ADD CONSTRAINT lotes_financiados_hectareas_asignadas_check
  CHECK (hectareas_asignadas IS NULL OR hectareas_asignadas > 0);

COMMENT ON COLUMN public.lotes_financiados.sub_lote_nombre IS
  'Etiqueta opcional del sublote o bloque financiado dentro de la finca.';

COMMENT ON COLUMN public.lotes_financiados.hectareas_asignadas IS
  'Superficie financiada por esta empresa dentro de la finca. El remanente queda como superficie propia.';

WITH fincas_con_un_solo_vinculo AS (
  SELECT finca_id
  FROM public.lotes_financiados
  GROUP BY finca_id
  HAVING COUNT(*) = 1
)
UPDATE public.lotes_financiados lf
SET hectareas_asignadas = f.hectareas
FROM public.fincas f
JOIN fincas_con_un_solo_vinculo one_row ON one_row.finca_id = f.id
WHERE lf.finca_id = f.id
  AND lf.hectareas_asignadas IS NULL;

CREATE OR REPLACE FUNCTION public.fn_lotes_financiados_validar_superficie()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hectareas_finca NUMERIC(14,2);
  v_total_otras NUMERIC(14,2);
BEGIN
  IF NEW.hectareas_asignadas IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT hectareas
  INTO v_hectareas_finca
  FROM public.fincas
  WHERE id = NEW.finca_id;

  IF v_hectareas_finca IS NULL THEN
    RAISE EXCEPTION 'lotes_financiados: la finca % no tiene hectáreas configuradas', NEW.finca_id;
  END IF;

  SELECT COALESCE(SUM(hectareas_asignadas), 0)
  INTO v_total_otras
  FROM public.lotes_financiados
  WHERE finca_id = NEW.finca_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_total_otras + NEW.hectareas_asignadas > v_hectareas_finca THEN
    RAISE EXCEPTION
      'lotes_financiados: la superficie asignada (%.2f ha) supera las %.2f ha de la finca',
      v_total_otras + NEW.hectareas_asignadas,
      v_hectareas_finca;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lotes_financiados_validar_superficie ON public.lotes_financiados;
CREATE TRIGGER trg_lotes_financiados_validar_superficie
  BEFORE INSERT OR UPDATE OF finca_id, hectareas_asignadas
  ON public.lotes_financiados
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_lotes_financiados_validar_superficie();
