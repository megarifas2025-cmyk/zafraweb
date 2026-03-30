/**
 * Aplica varios deltas idempotentes contra el proyecto enlazado (mismo flujo que supabase-run-sql.cjs).
 *
 * Uso:
 *   npm run supabase:apply-deltas
 *
 * Requisitos:
 *   npm run supabase:link   (una vez, con SUPABASE_ACCESS_TOKEN válido y opcional SUPABASE_DB_PASSWORD)
 *
 * Orden: nacional/comercial → arrival_events → RLS nombre solicitante fletes.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const envPath = path.join(root, '.env');
let childEnv = { ...process.env };
if (fs.existsSync(envPath)) {
  const fileEnv = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  if (fileEnv.SUPABASE_ACCESS_TOKEN) childEnv.SUPABASE_ACCESS_TOKEN = fileEnv.SUPABASE_ACCESS_TOKEN.trim();
  if (fileEnv.SUPABASE_DB_PASSWORD) childEnv.SUPABASE_DB_PASSWORD = fileEnv.SUPABASE_DB_PASSWORD.trim();
}

const files = [
  'database/delta-nacional-comercial.sql',
  'database/delta-arrival-events.sql',
  'database/delta-freight-requester-nombre-rls.sql',
  'database/delta-agricultural-inputs-precio.sql',
  'database/delta-app-runtime-logs.sql',
];

const localBin =
  process.platform === 'win32'
    ? path.join(root, 'node_modules', '.bin', 'supabase.cmd')
    : path.join(root, 'node_modules', '.bin', 'supabase');
const supabaseInv = fs.existsSync(localBin) ? `"${localBin}"` : 'npx supabase';

for (const rel of files) {
  const abs = path.resolve(root, rel);
  if (!fs.existsSync(abs)) {
    console.error('Falta el archivo:', abs);
    process.exit(1);
  }
  console.log('\n→', rel, '\n');
  const rawSql = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  const sanitizedSql = rawSql.replace(/\r\n/g, '\n');
  const tempSqlPath = path.join(os.tmpdir(), `supabase-apply-${path.basename(rel)}`);
  fs.writeFileSync(tempSqlPath, sanitizedSql, 'utf8');
  const cmd = `${supabaseInv} db query --linked -f "${tempSqlPath.replace(/"/g, '\\"')}"`;
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: childEnv });
  } finally {
    if (fs.existsSync(tempSqlPath)) fs.unlinkSync(tempSqlPath);
  }
}

console.log('\n✓ Deltas aplicados en orden.');
