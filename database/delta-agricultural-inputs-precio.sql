-- Precio de referencia opcional en catálogo agrotienda (acordar / USD según negocio).
ALTER TABLE public.agricultural_inputs ADD COLUMN IF NOT EXISTS precio NUMERIC(14,2);

COMMENT ON COLUMN public.agricultural_inputs.precio IS 'Referencia opcional; no sustituye acuerdo fuera de la app.';
