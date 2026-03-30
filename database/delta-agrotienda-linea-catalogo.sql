DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'linea_catalogo_agrotienda'
  ) THEN
    CREATE TYPE public.linea_catalogo_agrotienda AS ENUM ('insumos', 'repuestos');
  END IF;
END $$;

ALTER TABLE public.agricultural_inputs
  ADD COLUMN IF NOT EXISTS linea_catalogo public.linea_catalogo_agrotienda NOT NULL DEFAULT 'insumos',
  ADD COLUMN IF NOT EXISTS subcategoria TEXT;

CREATE INDEX IF NOT EXISTS idx_agri_inputs_linea ON public.agricultural_inputs(linea_catalogo);

UPDATE public.agricultural_inputs
SET linea_catalogo = 'insumos'
WHERE linea_catalogo IS NULL;

DROP POLICY IF EXISTS "req_compra_buyer_own" ON public.requerimientos_compra;
CREATE POLICY "req_compra_buyer_own" ON public.requerimientos_compra FOR ALL
  USING (
    comprador_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('buyer'::public.rol_usuario, 'independent_producer'::public.rol_usuario)
    )
  )
  WITH CHECK (
    comprador_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('buyer'::public.rol_usuario, 'independent_producer'::public.rol_usuario)
    )
  );
