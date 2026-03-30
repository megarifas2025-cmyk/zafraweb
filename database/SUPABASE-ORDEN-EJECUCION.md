# Orden recomendado en Supabase (SQL Editor)

**No tenemos acceso remoto a tu proyecto Supabase** (solo al código del repo). Para ver qué tablas faltan: ejecuta en el Dashboard **`verificar-tablas-clave.sql`** y lee **`PENDIENTE-SUPABASE.md`** (mapa de módulos y archivos que suelen quedar sin aplicar).

## Un solo envío

| Situación | Archivo |
|-----------|---------|
| **BD nueva o vacía** (sin enums/tablas de la app) | **`SUPABASE-TODO-EN-UNO.sql`** — núcleo + empresa + productor + upgrade maquinaria. **No** incluye el módulo mercado comprador geo (`migrate-buyer-market-geo.sql`). |
| **BD que ya tiene el schema** (error `42710` / tipo `rol_usuario` ya existe) | **`SUPABASE-SOLO-DELTAS.sql`** — pizarra fletes (si faltaba) + empresa + productor + upgrade maquinaria; **no** recrea `rol_usuario` ni el schema completo. **Tampoco** incluye `migrate-buyer-market-geo.sql`. |

Si al pegar `TODO-EN-UNO` falla con **«tipo rol_usuario ya existe»**, no reintentes ese archivo: usa **`SUPABASE-SOLO-DELTAS.sql`** (o los `migrate-*.sql` sueltos de la tabla siguiente).

## Por archivos (proyecto ya existente o parches)

Ejecuta **cada archivo en una query nueva** cuando toque (si algo ya lo aplicaste, puedes saltarlo; los scripts usan `IF NOT EXISTS` / `DROP POLICY IF EXISTS` donde aplica).

| # | Archivo | Para qué |
|---|---------|----------|
| 1 | `PEGA-EN-SUPABASE-SQL-EDITOR.sql` | Solo si tu `schema` **no** incluye aún `agrotienda` + catálogo (sigue PASO 1 y PASO 2 del propio archivo). En `schema.sql` actual del repo ya va incluido. |
| 2 | `schema.sql` **o** tus migrates base | Proyecto nuevo: schema completo. Proyecto vivo: solo lo que falte. |
| 3 | `migrate-bunker-module.sql` | Búnker incremental: columnas `companies`, sync `peritos`/`affiliations`, RLS extra (si partiste de un schema viejo sin esto). |
| 4 | `migrate-freight-requests-board.sql` | Freight incremental (si el schema base no lo tenía). |
| 5 | **`SUPABASE-MODULO-EMPRESA-COMPLETO.sql`** | Vistas empresa, flota, RPC perito, políticas cosechas/transportistas. |
| 6 | `migrate-producer-master-panel.sql` | Panel agricultor: `early_warnings`, `field_logs`, maquinaria, trust… |
| 7 | `migrate-machinery-daterange-upgrade.sql` | Solo si `machinery_rentals` tenía fechas viejas (inicio/fin) y pasas a `daterange`. |
| 8 | `migrate-buyer-market-geo.sql` | Mercado comprador: `ad_campaigns`, `buyer_wishlist`, `buyer_push_outbox`, RPC `market_ecosystem_nearby`, trigger wishlist → cola push. **Suele faltar** si solo aplicaste TODO-EN-UNO o SOLO-DELTAS. |
| 9 | `migrate-saas-perito-central.sql` | Políticas perito/empresa (SaaS): empresa solo lectura en peritos, `zafra_ceo` gestiona altas; columnas extra en `field_inspections`. |
| 10 | `migrate-agrotienda.sql` | Mismo contenido útil que `PEGA-EN-SUPABASE-SQL-EDITOR.sql` (rol `agrotienda` + `agricultural_inputs`). Requiere **dos queries** si aparece error **55P04** del enum. |
| 11 | **`delta-nacional-comercial.sql`** | `cosechas.ubicacion_estado`, `requerimientos_compra`, `lotes_financiados`, RLS `agricultural_inputs` (lectura nacional productor/comprador). **Incluido al final** de `SUPABASE-SOLO-DELTAS.sql`. |

**Copiar-pega rápido solo empresa (app ya en producción con bunker + freight):**  
→ `SUPABASE-MODULO-EMPRESA-COMPLETO.sql`

**Storage:** bucket `early-warnings` si usas S.O.S con fotos (Dashboard Storage).

El archivo duplicado lógico `migrate-company-ui-module.sql` coincide con el bloque de empresa; mantén **`SUPABASE-MODULO-EMPRESA-COMPLETO.sql`** como referencia “un solo RUN” para no buscar en varios sitios.
