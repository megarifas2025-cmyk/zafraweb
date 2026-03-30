-- Disponibilidad en pizarra (transportista): persistida en perfiles.
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS disponibilidad_flete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.perfiles.disponibilidad_flete IS 'Transportista: visible como disponible para nuevas cargas (UI toggle).';
