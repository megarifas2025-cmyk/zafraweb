# SQL y Supabase — mapa del repo

## Fuente de verdad (evitar copias divergentes)

| Qué | Dónde editar |
|-----|----------------|
| Parche incremental idempotente (BD ya existente) | `delta-*.sql` sueltos |
| Instalación “desde cero” (referencia) | `schema.sql` |
| Bundle “un solo pegado” Dashboard | **Generado** — `npm run supabase:gen-deltas-bundle` → `supabase-APLICAR-DELTAS-RECENTES.sql` |
| Pizarra fletes + empresa + panel productor + maquinaria (sin nacional) | `SUPABASE-SOLO-DELTAS.sql` — **después** aplica `delta-nacional-comercial.sql` o `supabase:apply-deltas` |

No mantengas el mismo bloque SQL en tres sitios: el bloque nacional **salió** de `SUPABASE-SOLO-DELTAS.sql` y vive solo en `delta-nacional-comercial.sql`; el bundle se **regenera**.

## Archivos que se solapan por diseño (no son errores)

- **`migrate-company-ui-module.sql`** vs **`SUPABASE-MODULO-EMPRESA-COMPLETO.sql`**: mismo bloque empresa; usa uno u otro según `SUPABASE-ORDEN-EJECUCION.md`.
- **`PEGA-EN-SUPABASE-SQL-EDITOR.sql`** vs **`migrate-agrotienda.sql`**: agrotienda incremental; documentado en `PENDIENTE-SUPABASE.md`.
- **`SUPABASE-TODO-EN-UNO.sql`**: monolito histórico; puede quedar por detrás de `schema.sql` + deltas. Para BD nueva, preferir `schema.sql` + migrates necesarios, o ejecutar deltas tras TODO-EN-UNO.

## Scripts npm (raíz del proyecto)

| Script | Acción |
|--------|--------|
| `npm run supabase:gen-deltas-bundle` | Regenera `supabase-APLICAR-DELTAS-RECENTES.sql` |
| `npm run supabase:apply-deltas` | Aplica deltas recientes al proyecto **enlazado** (CLI) |
| `npm run supabase:sql -- database/archivo.sql` | Un archivo SQL remoto |

Parche recomendado para esta fase de pruebas: `delta-perfiles-autoregistro-seguro.sql` (corrige `perfiles`, quita el auto-super-admin por correo y deja el auto-registro estable con KYC operativo en modo prueba).

Detalle: `SUPABASE-CLI.md`.
