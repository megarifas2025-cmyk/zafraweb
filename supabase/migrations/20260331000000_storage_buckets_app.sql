-- =============================================================================
-- ZafraClic — Storage: buckets + políticas base (reproducible con `supabase db push`)
-- Duplica la intención de database/crear-storage-buckets-app.sql; mantener ambos alineados.
-- =============================================================================

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

DROP POLICY IF EXISTS "zafraclic_public_select_buckets" ON storage.objects;
DROP POLICY IF EXISTS "zafraclic_auth_own_all" ON storage.objects;

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
