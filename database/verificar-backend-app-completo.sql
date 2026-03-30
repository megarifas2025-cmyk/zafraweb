-- =============================================================================
-- UNICORNIO / ZafraClic — Verificación backend vs app (pre-APK)
-- =============================================================================
-- Ubicación: database/verificar-backend-app-completo.sql
-- Supabase → SQL Editor → copia TODO este archivo → Run (una sola consulta).
--
-- Comprueba: tablas public, vistas empresa, RPC, buckets Storage, extensiones.
-- No valida: Edge Functions, Realtime ni RLS fino.
-- Si storage_bucket sale FALTA: ejecuta database/crear-storage-buckets-app.sql
-- =============================================================================

WITH
expected_tables AS (
  SELECT unnest(ARRAY[
    'ad_campaigns',
    'agricultural_inputs',
    'alertas_clima',
    'alertas_waze',
    'alertas_waze_confirmaciones',
    'arrival_events',
    'buyer_push_outbox',
    'buyer_wishlist',
    'calificaciones',
    'companies',
    'company_affiliations',
    'company_employees',
    'company_farmers',
    'company_fleet_units',
    'cosechas',
    'early_warnings',
    'field_inspection_counters',
    'field_inspections',
    'field_logs',
    'fincas',
    'fletes',
    'freight_request_applications',
    'freight_request_notifications',
    'freight_requests',
    'inspecciones',
    'kyc_docs',
    'logistics_mensajes',
    'logistics_salas',
    'lotes_financiados',
    'machinery_rentals',
    'mensajes',
    'perfiles',
    'peritos',
    'requerimientos_compra',
    'salas_chat',
    'ticker_items',
    'vehiculo_docs',
    'vehiculos',
    'viaje_docs',
    'viajes'
  ]) AS name
),
tab_rows AS (
  SELECT
    1 AS orden,
    'tabla'::text AS grupo,
    e.name::text AS nombre,
    CASE WHEN t.tablename IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado,
    NULL::int AS n_ok,
    NULL::int AS n_total
  FROM expected_tables e
  LEFT JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = e.name
),
expected_views AS (
  SELECT unnest(ARRAY['registered_farms', 'active_harvests']) AS name
),
view_rows AS (
  SELECT
    2 AS orden,
    'vista'::text AS grupo,
    e.name::text AS nombre,
    CASE WHEN v.table_name IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado,
    NULL::int,
    NULL::int
  FROM expected_views e
  LEFT JOIN information_schema.views v
    ON v.table_schema = 'public' AND v.table_name = e.name
),
expected_rpc AS (
  SELECT unnest(ARRAY['market_ecosystem_nearby', 'cerrar_trato']) AS name
),
rpc_rows AS (
  SELECT
    3 AS orden,
    'rpc'::text AS grupo,
    e.name::text AS nombre,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = e.name
      ) THEN 'OK'
      ELSE 'FALTA'
    END AS estado,
    NULL::int,
    NULL::int
  FROM expected_rpc e
),
expected_buckets AS (
  SELECT unnest(ARRAY[
    'kyc-docs',
    'cosecha-fotos',
    'avatares',
    'diario-fotos',
    'vehiculo-docs',
    'billetera-logistica',
    'early-warnings',
    'field-inspection-photos'
  ]) AS id
),
bucket_rows AS (
  SELECT
    4 AS orden,
    'storage_bucket'::text AS grupo,
    e.id::text AS nombre,
    CASE WHEN b.id IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado,
    NULL::int,
    NULL::int
  FROM expected_buckets e
  LEFT JOIN storage.buckets b ON b.id = e.id
),
expected_ext AS (
  SELECT unnest(ARRAY['postgis', 'pg_trgm', 'uuid-ossp']) AS extname
),
ext_rows AS (
  SELECT
    5 AS orden,
    'extension'::text AS grupo,
    e.extname::text AS nombre,
    CASE WHEN x.extname IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado,
    NULL::int,
    NULL::int
  FROM expected_ext e
  LEFT JOIN pg_extension x ON x.extname = e.extname
),
all_checks AS (
  SELECT * FROM tab_rows
  UNION ALL SELECT * FROM view_rows
  UNION ALL SELECT * FROM rpc_rows
  UNION ALL SELECT * FROM bucket_rows
  UNION ALL SELECT * FROM ext_rows
),
counts AS (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'FALTA')::int AS total_falta
  FROM all_checks
)
SELECT orden, grupo, nombre, estado, NULL::int AS n_ok, NULL::int AS n_total
FROM all_checks
UNION ALL
SELECT
  9,
  'resumen'::text,
  'RESUMEN'::text,
  CASE WHEN c.total_falta = 0 THEN 'LISTO' ELSE 'REVISAR' END,
  (SELECT COUNT(*) FILTER (WHERE estado = 'OK') FROM all_checks)::int,
  (SELECT COUNT(*) FROM all_checks)::int
FROM counts c
ORDER BY orden, nombre NULLS LAST;
