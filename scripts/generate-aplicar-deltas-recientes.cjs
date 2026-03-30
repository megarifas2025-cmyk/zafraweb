/**
 * Genera database/supabase-APLICAR-DELTAS-RECENTES.sql concatenando los deltas canónicos.
 * Evita desincronización: edita solo delta-*.sql y vuelve a generar.
 *
 *   npm run supabase:gen-deltas-bundle
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'database', 'supabase-APLICAR-DELTAS-RECENTES.sql');
const sources = [
  'database/delta-nacional-comercial.sql',
  'database/delta-arrival-events.sql',
  'database/delta-freight-requester-nombre-rls.sql',
  'database/delta-agricultural-inputs-precio.sql',
];

let out = `-- =============================================================================
-- GENERADO — NO EDITAR A MANO
-- Origen: ${sources.join(', ')}
-- Regenerar: npm run supabase:gen-deltas-bundle
-- =============================================================================

`;

for (const rel of sources) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error('Falta:', abs);
    process.exit(1);
  }
  const body = fs.readFileSync(abs, 'utf8').trimEnd();
  out += `\n-- ========== ${rel} ==========\n\n${body}\n`;
}

fs.writeFileSync(outPath, out.replace(/\r\n/g, '\n'), 'utf8');
console.log('Escrito:', outPath);
