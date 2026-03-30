/**
 * Configura push fuera de la app en Supabase enlazado:
 * 1) Secretos Edge: EXPO_ACCESS_TOKEN, BUYER_PUSH_OUTBOX_SECRET (genera uno si falta)
 * 2) Vault: mismo valor que BUYER_PUSH_OUTBOX_SECRET en vault.decrypted_secrets (nombre buyer_push_outbox_secret)
 * 3) Migra la BD (incluye pg_cron que llama a la función cada 2 min)
 *
 * Requiere: .env con SUPABASE_ACCESS_TOKEN, y EXPO_ACCESS_TOKEN (Expo → Access Tokens).
 * Uso: node scripts/supabase-push-outbox-full-setup.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function pickToken(key, fileEnv) {
  const fromFile = (fileEnv[key] || '').trim();
  if (fromFile) return fromFile;
  return (process.env[key] || '').trim();
}

if (!fs.existsSync(envPath)) {
  console.error('Falta .env en la raíz.');
  process.exit(1);
}
if (!fs.existsSync(refPath)) {
  console.error('Falta enlace: npm run supabase:link');
  process.exit(1);
}

const ref = fs.readFileSync(refPath, 'utf8').trim();

const fileEnv = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
const access = pickToken('SUPABASE_ACCESS_TOKEN', fileEnv);
const expoToken = pickToken('EXPO_ACCESS_TOKEN', fileEnv);
let buyerSecret = pickToken('BUYER_PUSH_OUTBOX_SECRET', fileEnv);

if (!access) {
  console.error('Añade SUPABASE_ACCESS_TOKEN en .env (o supabase login).');
  process.exit(1);
}
if (!expoToken) {
  console.log(
    '\n[Aviso] Sin EXPO_ACCESS_TOKEN: fija el secret en Supabase para que la función envíe a Expo:\n' +
      '  npx supabase secrets set --env-file <.env con EXPO_ACCESS_TOKEN=...> --project-ref ' +
      ref +
      '\n  https://expo.dev/settings/access-tokens\n',
  );
}
if (!buyerSecret) {
  buyerSecret = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envPath, `\n# Generado por supabase-push-outbox-full-setup.cjs\nBUYER_PUSH_OUTBOX_SECRET=${buyerSecret}\n`);
  console.log('Se generó BUYER_PUSH_OUTBOX_SECRET y se añadió al final de .env');
}

const bin =
  process.platform === 'win32'
    ? path.join(root, 'node_modules', '.bin', 'supabase.cmd')
    : path.join(root, 'node_modules', '.bin', 'supabase');

const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: access };

/** Solo `secrets` / `functions` aceptan `--project-ref` al final en esta versión del CLI. */
function run(args, { withProjectRef = true } = {}) {
  const q = withProjectRef ? `"${bin}" ${args} --project-ref ${ref}` : `"${bin}" ${args}`;
  execSync(q, { cwd: root, stdio: 'inherit', shell: true, env: childEnv });
}

const os = require('os');
const tmpVault = path.join(os.tmpdir(), `unicornio-vault-push-${Date.now()}.sql`);
const escaped = buyerSecret.replace(/'/g, "''");

fs.writeFileSync(
  tmpVault,
    `-- Vault: mismo valor que BUYER_PUSH_OUTBOX_SECRET (header Authorization del cron)\n` +
    `DO $vault$\n` +
    `BEGIN\n` +
    `  PERFORM vault.create_secret('${escaped}', 'buyer_push_outbox_secret');\n` +
    `EXCEPTION WHEN OTHERS THEN\n` +
    `  RAISE NOTICE 'vault (puede existir): %', SQLERRM;\n` +
    `END $vault$;\n`,
  'utf8',
);

console.log('\n→ Edge secrets (Supabase)\n');
const tmpSecrets = path.join(os.tmpdir(), `unicornio-edge-push-${Date.now()}.env`);
const secretLines = [`BUYER_PUSH_OUTBOX_SECRET=${buyerSecret.replace(/\r?\n/g, '')}\n`];
if (expoToken) secretLines.unshift(`EXPO_ACCESS_TOKEN=${expoToken.replace(/\r?\n/g, '')}\n`);
fs.writeFileSync(tmpSecrets, secretLines.join(''));
try {
  run(`secrets set --env-file "${tmpSecrets.replace(/"/g, '\\"')}"`);
} finally {
  try {
    fs.unlinkSync(tmpSecrets);
  } catch {
    /* ignore */
  }
}

console.log('\n→ Vault (Postgres): buyer_push_outbox_secret para pg_cron\n');
try {
  run(`db query --linked -f "${tmpVault.replace(/"/g, '\\"')}"`, { withProjectRef: false });
} catch (e) {
  console.error(
    'Si falla por secreto duplicado, en SQL Editor ejecuta:\n' +
      "  DELETE FROM vault.secrets WHERE name = 'buyer_push_outbox_secret';\n" +
      'y vuelve a ejecutar este script, o crea el secreto manualmente.',
  );
  throw e;
} finally {
  try {
    fs.unlinkSync(tmpVault);
  } catch {
    /* ignore */
  }
}

console.log('\n→ Migraciones remotas (incluye pg_cron)\n');
run('db push --yes', { withProjectRef: false });

console.log('\n✓ Listo: la función se invoca cada ~2 min; comprueba Dashboard → Database → Cron Jobs o logs de Edge Functions.');
