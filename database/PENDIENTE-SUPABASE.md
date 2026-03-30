# Qué subir / aplicar en Supabase (desde el repo)

**Importante:** desde Cursor **no hay acceso** a tu proyecto Supabase. Tú (o quien tenga el Dashboard) debe ejecutar el SQL en **Supabase → SQL Editor**. Este documento resume **qué archivos hay** y **qué suele faltar** si la base creció por partes.

---

## 1) Verificación en 1 minuto

1. Abre **SQL Editor** en Supabase.
2. Pega y ejecuta **`verificar-tablas-clave.sql`** (en esta carpeta).
3. Cualquier fila con **`estado = FALTA`** indica un módulo que **aún no** está en la base (o nombre distinto).

### Si la app o PostgREST devuelven `42P17` / «infinite recursion» en `perfiles`

Ejecuta **`fix-perfiles-rls-recursion.sql`** (reemplaza la política `zafra_ceo_all` por una que usa la función `is_zafra_ceo()` sin recursión). El `schema.sql` y `SUPABASE-TODO-EN-UNO.sql` del repo ya incluyen este patrón en versiones nuevas.

---

## 2) Rutas “todo de golpe” (elegir UNA según tu situación)

| Situación | Archivo | Notas |
|-----------|---------|--------|
| Base **nueva o vacía** | `SUPABASE-TODO-EN-UNO.sql` | Un solo **Run** grande. Incluye núcleo + empresa + panel productor (incluye `machinery_rentals`) + upgrade maquinaria. |
| Base **ya con** `schema` / tablas antiguas (error tipo enum ya existe) | `SUPABASE-SOLO-DELTAS.sql` | Fletes + empresa + panel productor + upgrade maquinaria + **nacional/comercial** (ver `delta-nacional-comercial.sql`). **No** recrea el schema completo. |

Ninguno de los dos incluye **por sí solo** el bloque completo del **mercado comprador geo** (`ad_campaigns`, `buyer_wishlist`, …). Eso va en **`migrate-buyer-market-geo.sql`** (ver abajo).

### Un solo pegado “pendientes” después de la base

Si **ya** aplicaste `SUPABASE-TODO-EN-UNO.sql` o `SUPABASE-SOLO-DELTAS.sql` (+ deltas recientes si toca), el archivo **`SUPABASE-PENDIENTES-UN-SOLO-RUN.sql`** agrupa en un solo **Run** lo que suele faltar: fix RLS `perfiles`, **mercado comprador geo**, **RLS demandas** (empresa + agrotienda) y **arrival_events** opcional. Lee el encabezado del archivo antes de ejecutar.

---

## 3) Módulos que suelen quedar “pendientes” si solo corriste un `schema.sql` viejo

Ejecuta **solo** lo que te falte (orden recomendado):

| Prioridad | Archivo | Qué aporta |
|-----------|---------|------------|
| A | `migrate-freight-requests-board.sql` | Pizarra fletes (si no vino en tu schema). *Incluido en SOLO-DELTAS.* |
| B | `SUPABASE-MODULO-EMPRESA-COMPLETO.sql` o `migrate-company-ui-module.sql` | Vistas empresa, flota, RPC. *Parcialmente en TODO-EN-UNO / SOLO-DELTAS.* |
| C | `migrate-producer-master-panel.sql` | `early_warnings`, `field_logs`, **`machinery_rentals`**, políticas. *Incluido al final de TODO-EN-UNO / SOLO-DELTAS.* |
| D | `migrate-machinery-daterange-upgrade.sql` | Solo si tenías `machinery_rentals` con columnas viejas inicio/fin. |
| E | **`migrate-buyer-market-geo.sql`** | **`ad_campaigns`**, **`buyer_wishlist`**, **`buyer_push_outbox`**, RPC mapa, columnas `ubicacion_point`, `expo_push_token`. **No está dentro de TODO-EN-UNO.** |
| F | `migrate-bunker-module.sql` | Búnker incremental (companies, peritos, affiliations…) si partiste de schema sin eso. |
| G | `migrate-saas-perito-central.sql` | Políticas SaaS perito (empresa solo lectura, zafra_ceo crea peritos, columnas inspección). |
| H | `PEGA-EN-SUPABASE-SQL-EDITOR.sql` o `migrate-agrotienda.sql` | Rol `agrotienda`, `agricultural_inputs`, campos perfil. **Dos RUN** si el enum da 55P04 (instrucciones en el archivo). |
| I | **`delta-nacional-comercial.sql`** | `cosechas.ubicacion_estado`, **`requerimientos_compra`**, **`lotes_financiados`**, RLS `agricultural_inputs` (lectura nacional productor/comprador). *Incluido al final de* **`SUPABASE-SOLO-DELTAS.sql`**. |

Scripts **destructivos** (`reset-*.sql`) no son “pendientes de producción”; úsalos solo en dev a propósito.

---

## 4) Post-setup (Dashboard, no solo SQL)

- **Storage:** buckets que use la app (`kyc-docs`, `cosecha-fotos`, `avatares`, `early-warnings`, etc.) — ver `README.md` del repo.
- **Auth:** proveedor email, URLs de redirect si aplica.
- **Edge Functions:** si desplegáis funciones, `npm run supabase:fn:deploy-all` desde el proyecto (requiere CLI login).

---

## 5) Resumen honesto

- El repo **ya contiene** el SQL necesario; lo que “falta” es **aplicarlo** en tu instancia Supabase y **volver a ejecutar** `verificar-tablas-clave.sql` hasta que todo esté `OK`.
- Si quieres **una sola lista** de comandos locales: `database/SUPABASE-CLI.md` (link / supabase link), pero el SQL sigue siendo en el **SQL Editor** salvo que migres todo a migraciones CLI.
