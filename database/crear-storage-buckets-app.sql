-- =============================================================================
-- ZafraClic — Buckets de Storage + políticas (listo para SQL Editor de Supabase)
-- Réplica en migraciones: supabase/migrations/20260331000000_storage_buckets_app.sql
-- =============================================================================
-- 1) Crea los buckets que usa la app (mismos IDs que src/shared/services/storageService.ts)
-- 2) Políticas RLS: cada usuario solo lee/escribe rutas cuyo primer segmento es su uid
-- 3) Lectura pública (anon) en buckets marcados public = true (avatares, fotos, etc.)
--
-- Ejecuta el bloque completo. Luego: verificar-backend-app-completo.sql → storage OK.
-- =============================================================================

-- ----- Buckets -----
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('kyc-docs', 'kyc-docs', false),
  ('cosecha-fotos', 'cosecha-fotos', true),
  ('avatares', 'avatares', true),
  ('diario-fotos', 'diario-fotos', true),
  ('vehiculo-docs', 'vehiculo-docs', false),
  ('billetera-logistica', 'billetera-logistica', false),
  ('early-warnings', 'early-warnings', true),
  ('chat-media', 'chat-media', true),
  ('field-inspection-photos', 'field-inspection-photos', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- ----- Políticas (idempotente: quita versiones anteriores del script) -----
DROP POLICY IF EXISTS "zafraclic_public_select_buckets" ON storage.objects;
DROP POLICY IF EXISTS "zafraclic_auth_own_all" ON storage.objects;

-- Lectura anónima solo en buckets públicos (getPublicUrl sin sesión)
CREATE POLICY "zafraclic_public_select_buckets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN (
  'avatares',
  'cosecha-fotos',
  'diario-fotos',
  'early-warnings',
  'chat-media'
));

-- Usuario autenticado: todo sobre objetos en su carpeta (primer path = auth.uid())
-- Rutas de la app: userId/..., userId/cosechaId/..., peritoId/... en inspecciones
CREATE POLICY "zafraclic_auth_own_all"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id IN (
    'kyc-docs',
    'cosecha-fotos',
    'avatares',
    'diario-fotos',
    'vehiculo-docs',
    'billetera-logistica',
    'early-warnings',
    'chat-media',
    'field-inspection-photos'
  )
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id IN (
    'kyc-docs',
    'cosecha-fotos',
    'avatares',
    'diario-fotos',
    'vehiculo-docs',
    'billetera-logistica',
    'early-warnings',
    'chat-media',
    'field-inspection-photos'
  )
  AND split_part(name, '/', 1) = auth.uid()::text
);
