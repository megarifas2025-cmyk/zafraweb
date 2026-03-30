/**
 * Despliega Edge Functions al proyecto enlazado.
 * Lee SUPABASE_ACCESS_TOKEN y (opcional) EXPO_ACCESS_TOKEN desde .env raíz.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const refPath = path.join(root, 'supabase', '.temp', 'project-ref');

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

if (!fs.existsSync(envPath)) {
  console.error('Falta .env en la raíz del proyecto.');
  process.exit(1);
}
if (!fs.existsSync(refPath)) {
  console.error('Falta enlace: ejecuta primero npm run supabase:link');
  process.exit(1);
}

const fileEnv = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
/** Preferir valor en `.env`; si está vacío, usar variable ya exportada en el shell (CI / PowerShell). */
function pickToken(key) {
  const fromFile = (fileEnv[key] || '').trim();
  if (fromFile) return fromFile;
  return (process.env[key] || '').trim();
}
const env = fileEnv;
const access = pickToken('SUPABASE_ACCESS_TOKEN');
if (!access) {
  console.error('Añade SUPABASE_ACCESS_TOKEN en .env (o ejecuta supabase login).');
  process.exit(1);
}

const ref = fs.readFileSync(refPath, 'utf8').trim();
const bin =
  process.platform === 'win32'
    ? path.join(root, 'node_modules', '.bin', 'supabase.cmd')
    : path.join(root, 'node_modules', '.bin', 'supabase');
if (!fs.existsSync(bin)) {
  console.error('Instala el CLI: npm install supabase --save-dev');
  process.exit(1);
}

const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: access };

function run(args) {
  const q = `"${bin}" ${args} --project-ref ${ref}`;
  execSync(q, { cwd: root, stdio: 'inherit', shell: true, env: childEnv });
}

console.log('→ deploy create-perito-account\n');
run('functions deploy create-perito-account');

console.log('\n→ deploy process-buyer-push-outbox (--no-verify-jwt)\n');
run('functions deploy process-buyer-push-outbox --no-verify-jwt');

console.log('\n→ deploy ingest-app-log\n');
run('functions deploy ingest-app-log');

console.log('\n→ deploy process-gemini\n');
run('functions deploy process-gemini');

const expo = pickToken('EXPO_ACCESS_TOKEN');
if (expo) {
  const tmp = path.join(os.tmpdir(), `unicornio-expo-secret-${Date.now()}.env`);
  fs.writeFileSync(tmp, `EXPO_ACCESS_TOKEN=${expo.replace(/\r?\n/g, '')}\n`, 'utf8');
  try {
    console.log('\n→ secrets: EXPO_ACCESS_TOKEN (desde .env)\n');
    run(`secrets set --env-file "${tmp.replace(/"/g, '\\"')}"`);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
} else {
  console.log(
    '\n(Opcional) Sin EXPO_ACCESS_TOKEN en .env: la función process-buyer-push-outbox fallará hasta que fijes el secret en Dashboard o añadas EXPO_ACCESS_TOKEN al .env y vuelvas a ejecutar este script.\n',
  );
}

const buyerPushSecret = pickToken('BUYER_PUSH_OUTBOX_SECRET');
if (buyerPushSecret) {
  const tmpPush = path.join(os.tmpdir(), `unicornio-buyer-push-secret-${Date.now()}.env`);
  fs.writeFileSync(tmpPush, `BUYER_PUSH_OUTBOX_SECRET=${buyerPushSecret.replace(/\r?\n/g, '')}\n`, 'utf8');
  try {
    console.log('\n→ secrets: BUYER_PUSH_OUTBOX_SECRET (desde .env)\n');
    run(`secrets set --env-file "${tmpPush.replace(/"/g, '\\"')}"`);
  } finally {
    try {
      fs.unlinkSync(tmpPush);
    } catch {
      /* ignore */
    }
  }
} else {
  console.log(
    '\n(Opcional) Sin BUYER_PUSH_OUTBOX_SECRET: la Edge Function process-buyer-push-outbox rechazará invocaciones hasta que fijes el secret (Dashboard o .env y vuelve a ejecutar este script).\n',
  );
}

const gemini = pickToken('GEMINI_API_KEY');
if (gemini) {
  const tmpGem = path.join(os.tmpdir(), `unicornio-gemini-secret-${Date.now()}.env`);
  fs.writeFileSync(tmpGem, `GEMINI_API_KEY=${gemini.replace(/\r?\n/g, '')}\n`, 'utf8');
  try {
    console.log('\n→ secrets: GEMINI_API_KEY (desde .env)\n');
    run(`secrets set --env-file "${tmpGem.replace(/"/g, '\\"')}"`);
  } finally {
    try {
      fs.unlinkSync(tmpGem);
    } catch {
      /* ignore */
    }
  }
} else {
  console.log(
    '\n(Opcional) Sin GEMINI_API_KEY en .env: process-gemini responderá 500 hasta que fijes el secret en Dashboard o en .env y vuelvas a ejecutar este script.\n',
  );
}

console.log('\n✓ Despliegue de funciones terminado.');
