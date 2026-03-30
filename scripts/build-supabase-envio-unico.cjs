/**
 * Regenera los bundles UTF-8 para Supabase (evita mojibake de PowerShell).
 * Uso: node scripts/build-supabase-envio-unico.cjs
 */
const fs = require('fs');
const path = require('path');

const db = path.join(__dirname, '..', 'database');

const read = (name) => fs.readFileSync(path.join(db, name), 'utf8');

const headerNueva = `-- =============================================================================
-- ZafraClic — ENVÍO ÚNICO A SUPABASE (un solo documento / un solo Run)
-- Generado por: node scripts/build-supabase-envio-unico.cjs
-- =============================================================================
--
-- CUÁNDO USAR ESTE ARCHIVO
--   • Proyecto Supabase con base NUEVA o casi vacía (sin tablas de la app).
--   • Dashboard → SQL Editor → pega TODO el archivo → Run.
--
-- CUÁNDO NO USARLO (error típico: tipo «rol_usuario» ya existe / 42710)
--   • Si tu BD YA tiene el schema: usa en su lugar:
--       database/SUPABASE-ENVIO-UNICO-COMPLETO-SIN-SCHEMA-BASE.sql
--
-- CONTENIDO (en orden)
--   1) SUPABASE-TODO-EN-UNO.sql
--   2) SUPABASE-PENDIENTES-UN-SOLO-RUN.sql
--   3) delta-vehiculos-rls-propietario.sql
--
-- DESPUÉS: database/verificar-tablas-clave.sql | Storage | Auth redirects
-- =============================================================================

`;

const headerExistente = `-- =============================================================================
-- ZafraClic — ENVÍO ÚNICO (base YA existente — sin schema completo)
-- Generado por: node scripts/build-supabase-envio-unico.cjs
-- =============================================================================
--
-- CUÁNDO USAR
--   • Tu Supabase YA tiene tablas/enums (no es BD vacía).
--   • Si el archivo «COMPLETO» falla con «rol_usuario ya existe», usa ESTE.
--
-- CONTENIDO (en orden)
--   1) SUPABASE-SOLO-DELTAS.sql
--   2) SUPABASE-PENDIENTES-UN-SOLO-RUN.sql
--   3) delta-vehiculos-rls-propietario.sql
--
-- DESPUÉS: database/verificar-tablas-clave.sql
-- =============================================================================

`;

const sep = (n) =>
  `\n\n-- ##############################################################################\n-- ${n}\n-- ##############################################################################\n\n`;

const out1 =
  headerNueva +
  read('SUPABASE-TODO-EN-UNO.sql') +
  sep('PARTE 2 — PENDIENTES (mercado comprador, RLS perfiles, …)') +
  read('SUPABASE-PENDIENTES-UN-SOLO-RUN.sql') +
  sep('PARTE 3 — vehículos RLS (transportista)') +
  read('delta-vehiculos-rls-propietario.sql');

const out2 =
  headerExistente +
  read('SUPABASE-SOLO-DELTAS.sql') +
  sep('PARTE 2 — PENDIENTES') +
  read('SUPABASE-PENDIENTES-UN-SOLO-RUN.sql') +
  sep('PARTE 3 — vehículos RLS') +
  read('delta-vehiculos-rls-propietario.sql');

fs.writeFileSync(path.join(db, 'SUPABASE-ENVIO-UNICO-COMPLETO.sql'), out1, 'utf8');
fs.writeFileSync(path.join(db, 'SUPABASE-ENVIO-UNICO-COMPLETO-SIN-SCHEMA-BASE.sql'), out2, 'utf8');

console.log('OK:', path.join(db, 'SUPABASE-ENVIO-UNICO-COMPLETO.sql'));
console.log('OK:', path.join(db, 'SUPABASE-ENVIO-UNICO-COMPLETO-SIN-SCHEMA-BASE.sql'));
