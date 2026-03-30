-- =============================================================================
-- UNICORNIO AGRO — Comprobar TODAS las tablas esperadas en public (pre-APK)
-- Para checklist completo (vistas empresa, RPC, Storage, extensiones) usa:
--   database/verificar-backend-app-completo.sql
-- =============================================================================
-- Supabase → SQL Editor → pega y Run. Una sola consulta.
-- grupo = tabla → nombre = tabla, estado = OK/FALTA
-- grupo = resumen → nombre = RESUMEN, estado = LISTO o REVISAR, tablas_ok / tablas_faltantes
-- grupo = extension → solo postgis, pg_trgm, uuid-ossp (OK si está instalada, FALTA si no)
-- Nota: en pg_extension pueden existir otras extensiones (p. ej. de Supabase); no se listan
--       aquí porque la app no las exige. Si tablas_faltantes = 0 y LISTO, la BD está bien.
-- =============================================================================

WITH expected AS (
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
detail AS (
  SELECT
    e.name AS tabla,
    CASE WHEN t.tablename IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
  FROM expected e
  LEFT JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = e.name
),
agg AS (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'OK')::int AS tablas_ok,
    COUNT(*) FILTER (WHERE estado = 'FALTA')::int AS tablas_faltantes
  FROM detail
),
expected_ext AS (
  SELECT unnest(ARRAY['postgis', 'pg_trgm', 'uuid-ossp']) AS extname
),
ext_detail AS (
  SELECT
    e.extname,
    CASE WHEN x.extname IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
  FROM expected_ext e
  LEFT JOIN pg_extension x ON x.extname = e.extname
)
SELECT 1 AS orden, 'tabla'::text AS grupo, d.tabla::text AS nombre, d.estado::text AS estado,
  NULL::int AS tablas_ok, NULL::int AS tablas_faltantes
FROM detail d
UNION ALL
SELECT 2, 'resumen', 'RESUMEN',
  CASE WHEN a.tablas_faltantes = 0 THEN 'LISTO' ELSE 'REVISAR' END,
  a.tablas_ok, a.tablas_faltantes
FROM agg a
UNION ALL
SELECT 3, 'extension', ex.extname, ex.estado, NULL::int, NULL::int
FROM ext_detail ex
ORDER BY orden, nombre NULLS LAST;
