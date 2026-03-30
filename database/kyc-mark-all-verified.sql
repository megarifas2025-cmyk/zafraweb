-- Opcional: alinear usuarios ya existentes en la BD (ejecutar en Supabase SQL Editor)
UPDATE public.perfiles
SET kyc_estado = 'verified'
WHERE kyc_estado IS DISTINCT FROM 'verified';
