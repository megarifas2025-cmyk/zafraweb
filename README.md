# 🌾 ZafraClic v2

Ecosistema agrícola nacional – 6 roles | Mercado Ciego | Waze Agrícola | KYC extremo

---

## 🗂 Estructura (features/shared)

```
src/
├── features/           # Módulos por rol
│   ├── auth/           # Login, Register, KYC
│   ├── super-admin/    # Control total, auditoría
│   ├── company/        # Empresa/Silo
│   ├── perito/         # Ingeniero de campo
│   ├── producer/       # Agricultor independiente
│   ├── buyer/          # Comprador/Procesadora
│   └── transporter/    # Transportista
├── shared/             # Código compartido
│   ├── components/     # WeatherTicker
│   ├── lib/            # Supabase client
│   ├── utils/          # theme
│   ├── services/       # auth, kyc, chat, storage, agronomo
│   ├── store/          # AuthContext
│   ├── screens/        # Chat, Perfil, Alertas
│   └── types/          # Tipos TypeScript
└── navigation/         # RoleNavigator
```

---

## 🚀 Iniciar (Expo Go — recomendado)

Este proyecto se desarrolla con **Expo Go** en el teléfono o emulador (no hace falta compilar APK salvo casos excepcionales).

```bash
cd Unicornio
npm install
npm run start
```

En la terminal, pulsa **`a`** (Android) o **`i`** (iOS) para abrir en el simulador/emulador con **Expo Go** instalado.

**Atajo (emulador Android + Metro + reverse en un paso):**

```bash
npm run android
```

Eso ejecuta `adb reverse` al puerto 8081 y arranca Expo con **`--localhost`** hacia el emulador. **No** genera APK.

**Pantalla azul en Expo Go / `java.io` / timeout en log:** suele ser **`expo-updates`** intentando bajar un manifiesto OTA y fallando por red (OkHttp/timeout). En este proyecto **`updates.enabled` está en `false`** en `app.json` para desarrollo con Metro; si más adelante usas **EAS Update**, vuelve a activarlo.

Si Expo CLI pregunta por actualizar Expo Go en el emulador, acepta o actualiza a la versión recomendada para tu SDK. Para evitar ese prompt en scripts automatizados existe `npm run android:go` (usa `EXPO_OFFLINE`; puede desactivar otras comprobaciones de red en la CLI).

Solo si en algún momento necesitas **build nativo** (cuando tú lo indiques): `npm run android:apk` (equivale a `expo run:android`).

---

## 📱 Emulador Android sin GPU

Si no tienes GPU:

1. Crear AVD en Android Studio → AVD Manager → Create Device
2. En **Emulated Performance** → Graphics: **Software - GLES 2.0**
3. O ejecutar manualmente:
   ```bash
   emulator -avd NOMBRE_AVD -gpu software
   ```
4. En otra terminal: `npm run start` y presiona `a`, o directamente `npm run android` (Expo Go).

### Metro en emulador (“Unable to load script” / “Could not load bundle”)

En el AVD, `localhost` es el propio emulador, no tu PC. Sin enrutar el puerto, **Expo Go** no alcanza a Metro en Windows.

- **Antes de abrir el proyecto en Expo Go**, ejecuta (o usa `npm run android`, que ya incluye el reverse):

  ```bash
  npm run adb:reverse
  ```

  Equivale a `adb reverse tcp:8081 tcp:8081` y enlaza el 8081 del emulador con Metro en el PC.

- Deja Metro corriendo (`npm run start` o `npm run android`) y recarga en Expo Go (**Reload** o `r` en la terminal de Expo).

---

## 🗄 Base de datos

1. Crear proyecto en [Supabase](https://supabase.com)
2. **Settings → API**: copia **Project URL** y **anon public** → en la raíz del repo:
   ```bash
   npm run env:supabase -- https://TU_REF.supabase.co eyJhbGciOiJIUzI1NiIs...
   ```
   (Reinicia Metro después.)
3. **Authentication → Providers**: habilita **Email**
4. **SQL Editor** — esquema completo y módulos:
   - **BD nueva:** un solo pegado **`database/SUPABASE-TODO-EN-UNO.sql`** (recomendado; incluye maquinaria, empresa, etc.).
   - **BD ya existente** o error «tipo ya existe»: **`database/SUPABASE-SOLO-DELTAS.sql`** y, si usas comprador/geo, **`database/migrate-buyer-market-geo.sql`** (no va dentro del todo-en-uno).
   - Para comprobar qué tablas faltan: **`database/verificar-tablas-clave.sql`** y la guía **`database/PENDIENTE-SUPABASE.md`**.
   - El archivo suelto `database/schema.sql` es el núcleo histórico; muchas features del repo viven en migraciones aparte.
   Si el **registro** falla por permisos en un proyecto viejo, ejecuta también `database/fix-perfiles-insert-rls.sql`.
5. **Storage** → crear buckets: `kyc-docs`, `cosecha-fotos`, `avatares`, `diario-fotos`, `vehiculo-docs`, `billetera-logistica`
6. Primera vez: **Regístrate** con un correo real o `@example.com` para pruebas.  
   **Nota:** ya no existe auto-elevación por correo para cuentas administrativas. Si necesitas una cuenta `zafra_ceo` en desarrollo, créala manualmente desde Supabase SQL/Auth y su fila en `perfiles`.

---

## 🔐 Variables de entorno

Lo mínimo para **login** es Supabase (ver arriba). Opcionalmente edita `.env`:

- `EXPO_PUBLIC_OPENWEATHER_KEY`
- `EXPO_PUBLIC_GEMINI_MODEL` (opcional)

La clave real de Gemini ya no va en el cliente: configúrala como secreto `GEMINI_API_KEY` en la Edge Function `process-gemini`.

---

## 👥 Roles

| Rol | Descripción |
|-----|-------------|
| ZAFRA_CEO | Auditoría, gobierno y control ejecutivo |
| COMPANY | Afiliaciones, peritos, flota |
| PERITO | Inspecciones offline |
| INDEPENDENT_PRODUCER | Fincas, cosechas, Waze |
| BUYER | Marketplace, radar zonal |
| TRANSPORTER | Flota, billetera logística |

---

## 📋 Mercado Ciego

- **Sin precio público** en cosechas
- Precio solo en chat privado cifrado
- COMPANY/PERITO pueden añadir % Humedad, % Impureza (lab)

---

## 🗺 Waze Agrícola

- PERITO reporta → alerta **VERIFICADA** (roja), push 15km
- PRODUCTOR reporta → **NO VERIFICADA** (naranja), 2 confirmaciones para pasar a roja
- IA sugiere diagnóstico; el humano decide publicar
