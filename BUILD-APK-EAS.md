# EAS / expo.dev — arranque desde cero

El historial de builds en **expo.dev** no vive en este repo: para “borrar” APKs viejos hay que **archivar o eliminar el proyecto** en [expo.dev](https://expo.dev) (o ignorar builds antiguos). Aquí dejamos el proyecto **sin** `projectId` fijado ni variables embebidas en `eas.json`.

## 1. Limpieza local (una vez)

En la raíz del repo (PowerShell):

```powershell
Remove-Item -Recurse -Force .expo, android\app\build, android\build, android\.gradle, dist, web-build -ErrorAction SilentlyContinue
```

## 2. Sesión y proyecto nuevo en Expo

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

- Si usas **`app.config.js`** y EAS no escribe el `projectId`, copia el UUID que muestre la consola y añádelo en **`app.config.js`** dentro de `expo.extra.eas.projectId` (o deja que `eas init` actualice `app.json` si migras a config estática).

## 3. Variables del build (obligatorio para Supabase/Gemini en la nube)

El `.env` local **no** sube al build. Configura en el dashboard del proyecto: **Environment variables** → entornos **preview** / **production**, o usa:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://....supabase.co" --type string
```

(Repite por cada `EXPO_PUBLIC_*` que necesites.)

## 4. Generar APK

```bash
npm run eas:build:apk
```

Equivale a `eas build -p android --profile preview`.

## Si ves `Entity not authorized`

Suele ser un `projectId` de otra cuenta o caché vieja. Borra **`.expo`**, vuelve a **`eas init`** y asegúrate de que `extra.eas.projectId` coincida con **tu** proyecto en expo.dev.

**Token en PowerShell:** el valor va entre comillas: `$env:EXPO_TOKEN = "..."`.
