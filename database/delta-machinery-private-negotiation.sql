ALTER TABLE public.machinery_rentals
  ALTER COLUMN precio_referencial_hectarea DROP NOT NULL;

ALTER TABLE public.machinery_rentals
  DROP CONSTRAINT IF EXISTS machinery_rentals_precio_referencial_hectarea_check;

ALTER TABLE public.machinery_rentals
  ADD CONSTRAINT machinery_rentals_precio_referencial_hectarea_check
  CHECK (
    precio_referencial_hectarea IS NULL
    OR precio_referencial_hectarea >= 0
  );

COMMENT ON COLUMN public.machinery_rentals.precio_referencial_hectarea IS
  'Campo legado opcional. La negociación comercial de maquinaria se realiza en privado; no se usa como precio público.';
