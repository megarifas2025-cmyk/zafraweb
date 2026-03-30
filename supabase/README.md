# Supabase (ZafraClic)

**CLI (enlace, SQL remoto, deploy de funciones):** ver [`database/SUPABASE-CLI.md`](../database/SUPABASE-CLI.md).

---

## Reproducir backend remoto (orden recomendado)

1. **Enlace y token:** `npm run supabase:link` (requiere `SUPABASE_ACCESS_TOKEN` y `EXPO_PUBLIC_SUPABASE_URL` en `.env`; opcional `SUPABASE_DB_PASSWORD` para `db query`).
2. **Esquema versionado:** `npm run supabase:db:push` — aplica `supabase/migrations/*.sql` (incluye RLS, RPC, cron, **Storage buckets** `20260331000000_storage_buckets_app.sql`).
3. **Deltas históricos en `database/`** (si el proyecto aún depende de ellos): `npm run supabase:apply-deltas`.
4. **Edge Functions + secretos desde `.env`:** `npm run supabase:fn:deploy-all` — despliega `create-perito-account`, `process-buyer-push-outbox`, `ingest-app-log`, `process-gemini` y sube `EXPO_ACCESS_TOKEN`, `BUYER_PUSH_OUTBOX_SECRET`, `GEMINI_API_KEY` si están definidos.
5. **Push outbox + Vault + migraciones en un paso:** `npm run supabase:push:setup` (alternativa a 2+4 parcial; genera `BUYER_PUSH_OUTBOX_SECRET` si falta).
6. **Manual (Dashboard):** Authentication → URL Configuration (`zafraclick://…`, URLs Expo); comprobar que existan los secretos que la app no puede fijar por CLI.

**Secretos Edge típicos:** `EXPO_ACCESS_TOKEN`, `BUYER_PUSH_OUTBOX_SECRET`, `GEMINI_API_KEY` (S.O.S fitosanitario vía `process-gemini`). Supabase inyecta `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` en las funciones.

**Storage:** buckets y políticas `zafraclic_*` quedan en migración; políticas adicionales por módulo (p. ej. inspecciones de campo, chat) pueden existir en SQL sueltos bajo `database/` — no las borres al alinear.

---

## SQL

- Esquema base y merges: `database/schema.sql`
- Mercado comprador (anuncios, wishlist, mapa RPC, cola push): `database/migrate-buyer-market-geo.sql`

## Edge Function: `process-buyer-push-outbox`

La cola `buyer_push_outbox` usa la columna `buyer_id` como **ID del destinatario** (perfil que recibe el push), no solo compradores. Se llena cuando:

- Una cosecha pasa a `publicada` y coincide con `buyer_wishlist` (ver `database/migrate-buyer-market-geo.sql`).
- Hay un mensaje nuevo en `mensajes` (chat mercado) o en `logistics_mensajes` (chat logística) — migración `20260327120000_chat_push_triggers.sql`.

La función lee filas `procesado = false`, envía a Expo Push API y marca `procesado`.

1. Crear token en [Expo Access Tokens](https://expo.dev/settings/access-tokens).
2. Definir un secreto aleatorio para cron: `BUYER_PUSH_OUTBOX_SECRET` (misma cadena en headers `Authorization: Bearer …` o `x-cron-secret` al invocar la función).
3. `supabase secrets set EXPO_ACCESS_TOKEN=tu_token` y `supabase secrets set BUYER_PUSH_OUTBOX_SECRET=tu_secreto`
4. `supabase functions deploy process-buyer-push-outbox --no-verify-jwt`
5. Aplicar migraciones: `npx supabase db push` (o SQL Editor con el archivo de migración).
6. **Automático (recomendado):** `npm run supabase:push:setup` — fija secretos Edge, crea el secreto en Vault para `pg_cron` y aplica migraciones (incluye `20260327150000_pg_cron_push_outbox.sql`: invoca la función cada 2 min).

   **Manual:** Dashboard → Edge Functions → Schedules, o `pg_cron` + `net.http_post` como en [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

La app guarda `expo_push_token` en `perfiles` (plugin `expo-notifications` + `PushRegistrationBootstrap`) cuando el usuario acepta notificaciones.

## Database Webhook (alternativa)

Puedes configurar un webhook en INSERT en `cosechas` que invoque una función similar sin cola; la cola + cron es más resiliente ante caídas de red.
