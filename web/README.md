# ZafraClic — portal web (Vite + React)

Misma API que la app móvil: variables `VITE_SUPABASE_*` apuntan al proyecto Supabase.

## Local

```bash
cd web
npm install
cp .env.example .env
# Editar .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY del .env raíz (mismos valores, renombrados a VITE_*)
npm run dev
```

Abre `http://localhost:5173`.

## Cloudflare Pages

### Si pide `wrangler.toml` o no encuentra Wrangler

Hay **dos** archivos (por si Cloudflare solo mira la **raíz del repo** o la carpeta **`web/`**):

- **`/wrangler.toml`** (raíz del monorepo) — mínimo válido para Wrangler.
- **`/web/wrangler.toml`** — incluye `pages_build_output_dir = "dist"`.

Hacé **`git pull`** / deploy con el último código y volvé a intentar.

**Importante:** al crear el proyecto en Cloudflare, **conectá el repositorio**  
`https://github.com/megarifas2025-cmyk/zafra`  
y en **Directorio raíz** escribí solo: **`web`** (una palabra). **No** pegues la URL del navegador tipo `https://github.com/.../tree/main/web`.

---

### Si ves: `Falló npx expo export -p web`

Ese comando es para **Expo Web en la raíz del monorepo**. Este portal **no** usa Expo: vive en **`web/`** y compila con **Vite**. Cloudflare a veces **auto-detecta Expo** y pone el comando equivocado.

**Corregí en el proyecto Pages → Configuración → Compilaciones:**

| Campo | Valor correcto |
|--------|-----------------|
| **Directorio raíz** | `web` |
| **Comando de compilación** | `npm run build` (**no** `npx expo export -p web`) |
| **Directorio de salida** | `dist` |
| **Preset / marco** | Ninguno / Vite — **no** el preset Expo |

Opcional: variable **`NODE_VERSION`** = `20`.

---

1. **Conectar** el repositorio (monorepo completo; la raíz del build es `web/`).
2. **Configuración de build:**
   - **Root directory:** `web`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Variables de entorno** (Production y, si quieres, Preview):
   - `VITE_SUPABASE_URL` = tu URL `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon public (Settings → API en Supabase)
4. **Supabase → Authentication → URL configuration:** añade la URL pública del sitio, p. ej. `https://tudominio.com` y `https://tudominio.com/**` si el dashboard lo permite.

## Nota

Las variables de Vite deben empezar por `VITE_` para incluirse en el bundle del cliente.
