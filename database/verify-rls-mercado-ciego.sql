-- =============================================================================
-- ZafraClic — Verificación RLS (Mercado Ciego / SECURITY_MAP.md)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (solo lectura; no modifica datos).
-- Compara el resultado con las políticas documentadas en /SECURITY_MAP.md
-- y con los scripts: SUPABASE-TODO-EN-UNO.sql, supabase-APLICAR-DELTAS-RECENTES.sql,
-- supabase-ACTUALIZAR-DEMANDAS-REQUERIMIENTOS.sql, etc.
-- =============================================================================

-- 1) Políticas activas en tablas del mapa de seguridad
SELECT
  pol.schemaname,
  pol.tablename,
  pol.policyname,
  pol.permissive,
  pol.roles,
  pol.cmd AS comando_sql, -- SELECT | INSERT | UPDATE | DELETE | ALL
  pol.qual AS using_expression,
  pol.with_check AS with_check_expression
FROM pg_policies AS pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN (
    'cosechas',
    'requerimientos_compra',
    'freight_requests',
    'agricultural_inputs',
    'salas_chat'
  )
ORDER BY pol.tablename, pol.policyname;

-- 2) Chat: mensajes (referenciado en SECURITY_MAP.md)
SELECT
  pol.tablename,
  pol.policyname,
  pol.cmd
FROM pg_policies AS pol
WHERE pol.schemaname = 'public'
  AND pol.tablename = 'mensajes'
ORDER BY pol.policyname;

-- 3) RLS habilitado en esas tablas (debe ser true)
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_activo,
  c.relforcerowsecurity AS forzar_para_propietario
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'cosechas',
    'requerimientos_compra',
    'freight_requests',
    'agricultural_inputs',
    'salas_chat',
    'mensajes'
  )
ORDER BY c.relname;

-- =============================================================================
-- Lista de referencia (nombres esperados tras aplicar el bundle completo del repo)
-- — si falta alguno o sobra uno, revisar qué script no se ejecutó en ese proyecto.
-- =============================================================================
-- cosechas:
--   cosecha_crud_agricultor, cosecha_edit_lab_company_perito, cosecha_ver_marketplace,
--   cosecha_bunker_company_read
-- requerimientos_compra:
--   req_compra_zafra_ceo, req_compra_buyer_own, req_compra_select_mercado
-- freight_requests:
--   freight_req_zafra_ceo, freight_req_insert_generadores, freight_req_select_own,
--   freight_req_select_transporter_abierta, freight_req_select_asignado, freight_req_update_requester
-- agricultural_inputs:
--   agri_inputs_zafra_ceo, agri_inputs_crud_dueno, agri_inputs_select_mismo_municipio,
--   agri_inputs_select_nacional_producer_buyer  (esta última: delta nacional)
-- salas_chat:
--   chat_participantes
-- mensajes:
--   mensajes_participantes
-- =============================================================================
