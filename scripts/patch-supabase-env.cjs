/**
 * Escribe URL y anon key de Supabase en .env sin tocar el resto de variables.
 *
 * Uso:
 *   npm run env:supabase -- https://TU_REF.supabase.co eyJhbGciOiJIUzI1NiIs...
 *
 * Las claves las copias en Supabase → Settings → API.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

const url = process.argv[2];
const anon = process.argv[3];

if (!url || !anon) {
  console.error('\nFaltan argumentos.\n');
  console.error('  npm run env:supabase -- <EXPO_PUBLIC_SUPABASE_URL> <EXPO_PUBLIC_SUPABASE_ANON_KEY>\n');
  console.error('Ejemplo:');
  console.error('  npm run env:supabase -- https://abcd1234.supabase.co eyJhbGciOiJIUzI1NiIs...\n');
  process.exit(1);
}

if (!/^https:\/\/.+\.supabase\.co\/?$/i.test(url.trim())) {
  console.warn('Advertencia: la URL debería ser https://<ref>.supabase.co\n');
}

function setLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const trimmed = content.replace(/\s*$/, '');
  return `${trimmed}\n${line}\n`;
}

let content;
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, 'utf8');
} else if (fs.existsSync(examplePath)) {
  content = fs.readFileSync(examplePath, 'utf8');
} else {
  content =
    'EXPO_PUBLIC_SUPABASE_URL=\nEXPO_PUBLIC_SUPABASE_ANON_KEY=\nEXPO_PUBLIC_OPENWEATHER_KEY=\n';
}

content = setLine(content, 'EXPO_PUBLIC_SUPABASE_URL', url.trim());
content = setLine(content, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', anon.trim());

fs.writeFileSync(envPath, content, 'utf8');
console.log('Listo: actualizado .env → EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY');
console.log('Reinicia Metro (cierra expo start y vuelve a ejecutar npm run android:go o npm run start).');
