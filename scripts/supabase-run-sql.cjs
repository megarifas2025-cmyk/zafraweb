/**
 * Ejecuta un .sql contra el proyecto enlazado (Management API).
 * Requisitos: proyecto enlazado + SUPABASE_ACCESS_TOKEN o sesión `supabase login` en .env
 *
 * Uso: npm run supabase:sql -- database/migrate-saas-perito-central.sql
 */
const fs = require('fs');
const path = require('path');
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
}
const rel = process.argv[2];
if (!rel) {
  console.error('Uso: npm run supabase:sql -- <ruta/al/archivo.sql>');
  process.exit(1);
}
const abs = path.resolve(root, rel);
const { existsSync } = require('fs');
if (!existsSync(abs)) {
  console.error('No existe el archivo:', abs);
  process.exit(1);
}

const localBin =
  process.platform === 'win32'
    ? path.join(root, 'node_modules', '.bin', 'supabase.cmd')
    : path.join(root, 'node_modules', '.bin', 'supabase');
const supabaseInv = fs.existsSync(localBin) ? `"${localBin}"` : 'npx supabase';
const cmd = `${supabaseInv} db query --linked -f "${abs.replace(/"/g, '\\"')}"`;
console.log(cmd, '\n');
try {
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: childEnv });
} catch {
  process.exit(1);
}
