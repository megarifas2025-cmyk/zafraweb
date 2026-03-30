# Supabase CLI – enlace y SQL desde la terminal

Con esto el asistente (o tú) puede aplicar `.sql` y desplegar Edge Functions **sin pegar en el SQL Editor**, una vez hecho el login y el link.

## 1. Una sola vez en tu PC

```powershell
cd C:\Users\10\Desktop\Unicornio
npx supabase login
```

Se abre el navegador y autorizas al CLI.

## 2. Enlazar el proyecto remoto

Tu `.env` ya tiene `EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`. El script lee el **project ref** de ahí.

```powershell
npm run supabase:link
```

- Si pide **contraseña de la base de datos**, puedes ponerla en `.env` como `SUPABASE_DB_PASSWORD=...` (Settings → Database → Database password en Supabase). **No subas ese valor al repo** (`.env` está en `.gitignore`).

## 3. Ejecutar un archivo SQL contra el proyecto enlazado

```powershell
npm run supabase:sql -- database/migrate-saas-perito-central.sql
```

Cualquier migración en `database/` se puede pasar igual.

### Aplicar en bloque los deltas recientes (nacional/comercial + arrival + RLS fletes)

Orden fijo (idempotente):

```powershell
npm run supabase:apply-deltas
```

Equivale a ejecutar, uno tras otro: `delta-nacional-comercial.sql`, `delta-arrival-events.sql`, `delta-freight-requester-nombre-rls.sql`.

**Si el CLI falla** (`401 Unauthorized`, «Access token», «login role»): el token de **Supabase** en `.env` (`SUPABASE_ACCESS_TOKEN`) está caducado o es inválido. Crea uno nuevo en [Account → Access Tokens](https://supabase.com/dashboard/account/tokens), pégalo en `.env`, y vuelve a ejecutar `npm run supabase:link` y luego `npm run supabase:apply-deltas`.

**Sin CLI:** Supabase → **SQL Editor** → pega el archivo **`database/supabase-APLICAR-DELTAS-RECENTES.sql`** → **Run** (una vez). Ese archivo se **genera** desde los deltas (`npm run supabase:gen-deltas-bundle`); no lo edites a mano.

## 4. Desplegar Edge Functions

Todo en un paso (usa `SUPABASE_ACCESS_TOKEN` en `.env`):

```powershell
npm run supabase:fn:deploy-all
```

O por separado:

```powershell
npm run supabase:fn:create-perito
npm run supabase:fn:buyer-push
```

Supabase inyecta por defecto `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en las funciones. Para **`process-buyer-push-outbox`** hace falta **`EXPO_ACCESS_TOKEN`** (token de [expo.dev](https://expo.dev) → Access tokens): ponlo en `.env` y vuelve a ejecutar `supabase:fn:deploy-all` (el script lo sube como secret vía `--env-file`), o configúralo en Dashboard → Edge Functions → Secrets.

## 5. Redirect URLs (Auth / ZafraClic)

Sigue siendo necesario en **Dashboard → Authentication → URL Configuration** añadir, por ejemplo:

- `zafraclick://reset-password`
- La URL `exp://...` que genere Expo en desarrollo (ver `.env.example`).

El CLI no sustituye por completo esa pantalla.

## Archivos añadidos en el repo

| Ruta | Uso |
|------|-----|
| `supabase/config.toml` | Config local del CLI (`npx supabase init`) |
| `supabase/migrations/` | Historial reproducible (`npm run supabase:db:push`), incluye buckets en `20260331000000_storage_buckets_app.sql` |
| `database/crear-storage-buckets-app.sql` | Misma lógica que la migración anterior, para pegar en SQL Editor si hace falta |
| `supabase/seed.sql` | Evita error en `db reset` local vacío |
| `scripts/supabase-link.cjs` | `npm run supabase:link` |
| `scripts/supabase-run-sql.cjs` | `npm run supabase:sql -- archivo.sql` |
| `scripts/supabase-deploy-functions.cjs` | `npm run supabase:fn:deploy-all` |

Orden completo recomendado: [`supabase/README.md`](../supabase/README.md) (sección «Reproducir backend remoto»).
