/**
 * Enlaza el proyecto remoto leyendo EXPO_PUBLIC_SUPABASE_URL desde .env
 * Requisito previo (una vez): npx supabase login
 *
 * Opcional en .env:
 *   SUPABASE_ACCESS_TOKEN — token de supabase.com/dashboard/account/tokens (evita `supabase login`)
 *   SUPABASE_DB_PASSWORD — contraseña Postgres si el link la pide
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

if (!fs.existsSync(envPath)) {
  console.error('No existe .env en la raíz del proyecto. Copia .env.example → .env y rellena EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
const url = (env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
if (!m) {
  console.error(
    'EXPO_PUBLIC_SUPABASE_URL debe ser https://<project-ref>.supabase.co (sin barra final). Valor actual inválido o vacío.',
  );
  process.exit(1);
}
const ref = m[1];
const dbPassword = (env.SUPABASE_DB_PASSWORD || '').trim();

const accessToken = (env.SUPABASE_ACCESS_TOKEN || '').trim();
const childEnv = { ...process.env };
if (accessToken) childEnv.SUPABASE_ACCESS_TOKEN = accessToken;
if (dbPassword) childEnv.SUPABASE_DB_PASSWORD = dbPassword;

console.log(`Project ref detectado: ${ref}`);
if (accessToken) console.log('Usando SUPABASE_ACCESS_TOKEN desde .env');
console.log('Ejecutando: npx supabase link ...\n');

let cmd = `npx supabase link --project-ref ${ref}`;
if (dbPassword) {
  const safe = dbPassword.replace(/"/g, '\\"');
  cmd += ` -p "${safe}"`;
}

try {
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: childEnv });
  console.log('\n✓ Enlace listo. Puedes ejecutar: npm run supabase:sql -- database/tu-archivo.sql');
} catch {
  console.error(
    '\nSi ves «Access token not provided», ejecuta primero: npm run supabase:login\n' +
      '(o exporta SUPABASE_ACCESS_TOKEN con un token de supabase.com/dashboard/account/tokens)\n',
  );
  process.exit(1);
}
