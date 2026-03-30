-- Seguridad: restringir public_company_directory a usuarios autenticados únicamente.
-- Antes era accesible a anon, permitiendo scraping de RIF y razones sociales sin autenticación.

REVOKE EXECUTE ON FUNCTION public.public_company_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.public_company_directory() TO authenticated;
