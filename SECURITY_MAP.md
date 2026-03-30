# Mapa de seguridad RLS — Mercado Ciego (ZafraClic)

Documento derivado del análisis de los archivos SQL en `database/` (principalmente `schema.sql`, `SUPABASE-TODO-EN-UNO.sql`, `SUPABASE-SOLO-DELTAS.sql`, `supabase-APLICAR-DELTAS-RECENTES.sql`, `supabase-ACTUALIZAR-DEMANDAS-REQUERIMIENTOS.sql`, `delta-requerimientos-rls-lectura-empresa-agrotienda.sql`).  
**No** hay definiciones RLS adicionales en `supabase/` (solo Edge Functions).

## Convenciones

| Término en este doc | Valor en PostgreSQL (`rol_usuario`) |
|---------------------|-------------------------------------|
| **producer**        | `independent_producer`              |
| **buyer**           | `buyer`                             |
| **company**         | `company` (perfil vinculado a `companies`) |
| **agrotienda**      | `agrotienda`                        |
| **transporter**     | `transporter`                       |

- **S / I / U / D** = SELECT / INSERT / UPDATE / DELETE permitidos por **alguna** política aplicable (las políticas se combinan con **OR**).
- **`kyc ✓`** = el perfil del actor cumple `kyc_estado = 'verified'` cuando la política lo exige.
- **`zafra_ceo`** conserva el acceso administrativo superior; no está en la matriz principal de roles operativos.

## Prerrequisitos de esquema

- **`requerimientos_compra`** y políticas asociadas no están en el núcleo mínimo antiguo: entran con deltas tipo `supabase-APLICAR-DELTAS-RECENTES.sql` y la política ampliada de mercado con `supabase-ACTUALIZAR-DEMANDAS-REQUERIMIENTOS.sql` (incluye `company` y `agrotienda` en `req_compra_select_mercado`).
- **`agri_inputs_select_nacional_producer_buyer`** añade SELECT nacional de insumos para productor y comprador (además de `agri_inputs_select_mismo_municipio` y `agri_inputs_crud_dueno`).

---

## Matriz: permisos efectivos por tabla y rol

> Si una celda dice **«—»**, no hay política que conceda ese tipo de acceso a ese rol (RLS deniega salvo excepciones administrativas tipo `zafra_ceo`).

### 1. `public.cosechas`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|-----|--------|--------|--------|--------|
| **producer** | **S:** filas propias (`cosecha_crud_agricultor`); **S:** cosechas `estado = 'publicada'` de terceros si `kyc ✓` (`cosecha_ver_marketplace`). | **I:** propio (`agricultor_id = auth.uid()`). | **U:** propio; **U:** laboratorio vinculado empresa/perito (`cosecha_edit_lab_company_perito`). | **D:** propio. |
| **buyer** | **S:** solo `publicada` + `kyc ✓` (`cosecha_ver_marketplace`). | — | — | — |
| **company** | **S:** `publicada` + `kyc ✓` (`cosecha_ver_marketplace`); **S:** cosechas de productores afiliados (`company_farmers`) sin exigir `publicada` (`cosecha_bunker_company_read`). | — | **U:** política laboratorio (`cosecha_edit_lab_company_perito`). | — |
| **agrotienda** | **S:** `publicada` + `kyc ✓` (`cosecha_ver_marketplace`). | — | — | — |
| **transporter** | — | — | — | — |

**Políticas citadas:** `cosecha_crud_agricultor`, `cosecha_edit_lab_company_perito`, `cosecha_ver_marketplace`, `cosecha_bunker_company_read` (en bundle / `SUPABASE-SOLO-DELTAS`).

---

### 2. `public.requerimientos_compra` (tras `ACTUALIZAR-DEMANDAS` + delta empresa/agrotienda)

| Rol | SELECT | INSERT | UPDATE | DELETE |
|-----|--------|--------|--------|--------|
| **producer** | **S:** solo filas con `categoria_destino = 'Cosecha a Granel'` si `kyc ✓` (`req_compra_select_mercado`). | — | — | — |
| **buyer** | **S/I/U/D:** filas con `comprador_id = auth.uid()` (`req_compra_buyer_own`). | **I/U/D:** propias (solo rol buyer). | Igual. | Igual. |
| **company** | **S:** solo filas con `categoria_destino = 'Volumen Procesado / Silos'` si `kyc ✓` (`req_compra_select_mercado`). | — | — | — |
| **agrotienda** | **S:** solo filas con `categoria_destino = 'Insumos y Maquinaria'` si `kyc ✓` (`req_compra_select_mercado`). | — | — | — |
| **transporter** | — | — | — | — |

**Políticas citadas:** `req_compra_super_admin`, `req_compra_buyer_own`, `req_compra_select_mercado`.

---

### 3. `public.freight_requests`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|-----|--------|--------|--------|--------|
| **producer** | **S:** propias (`freight_req_select_own`); no ve las de otros salvo que apliquen otras tablas. | **I:** si `requester_id = auth.uid()` y rol permitido (`freight_req_insert_generadores`). | **U:** propio solicitante (`freight_req_update_requester`). | — (no hay política DELETE explícita para generadores; efecto práctico: sin DELETE). |
| **buyer** | Igual que producer (generador). | Igual. | Igual. | — |
| **company** | Igual (generador). | Igual. | Igual. | — |
| **agrotienda** | Igual (generador). | Igual. | Igual. | — |
| **transporter** | **S:** solicitudes `estado IN ('abierta','con_postulaciones')` si rol transportista + `kyc ✓` (`freight_req_select_transporter_abierta`); **S:** asignado a él (`freight_req_select_asignado`). | — | — | — |

**Políticas citadas:** `freight_req_super_admin`, `freight_req_insert_generadores`, `freight_req_select_own`, `freight_req_select_transporter_abierta`, `freight_req_select_asignado`, `freight_req_update_requester`.

---

### 4. `public.agricultural_inputs`

| Rol | SELECT | INSERT | UPDATE | DELETE |
|-----|--------|--------|--------|--------|
| **producer** | **S:** `disponibilidad = true` y `kyc ✓` y rol en (`independent_producer`,`buyer`) (`agri_inputs_select_nacional_producer_buyer`); **S:** mismo municipio que tienda `agrotienda` verificada (`agri_inputs_select_mismo_municipio`). | **I/U/D:** solo filas con `perfil_id = auth.uid()` (`agri_inputs_crud_dueno`) — en la práctica el dueño del catálogo es rol agrotienda. | Igual si es dueño. | Igual si es dueño. |
| **buyer** | **S:** nacional (`agri_inputs_select_nacional_producer_buyer`) + municipio (`agri_inputs_select_mismo_municipio`). | — | — | — |
| **company** | — | — | — | — |
| **agrotienda** | **S:** propias + municipio; **I/U/D:** propias (`agri_inputs_crud_dueno`). | **I:** propio `perfil_id`. | **U/D:** propio. | **D:** propio. |
| **transporter** | — | — | — | — |

**Políticas citadas:** `agri_inputs_super_admin`, `agri_inputs_crud_dueno`, `agri_inputs_select_mismo_municipio`, `agri_inputs_select_nacional_producer_buyer` (delta nacional).

---

### 5. `public.salas_chat` (chat cosecha / comprador–agricultor)

| Rol | SELECT | INSERT | UPDATE | DELETE |
|-----|--------|--------|--------|--------|
| **producer** | **S/I/U/D:** si `auth.uid() = agricultor_id` (`chat_participantes`). | Igual. | Igual. | Igual. |
| **buyer** | **S/I/U/D:** si `auth.uid() = comprador_id` (`chat_participantes`). | Igual. | Igual. | Igual. |
| **company** | — | — | — | — |
| **agrotienda** | — | — | — | — |
| **transporter** | — | — | — | — |

**Políticas citadas:** `chat_participantes`.  
**Nota:** `mensajes` usa `mensajes_participantes` (misma idea: solo si la sala es accesible).

---

## Riesgos y brechas respecto al “Mercado Ciego”

Definición de producto (README): **sin precio público en cosechas**; precio negociado en **chat privado**. La seguridad debe alinear filas visibles y columnas con ese modelo.

| # | Área | Riesgo |
|---|------|--------|
| 1 | **`cosechas` · `cosecha_ver_marketplace`** | La visibilidad queda reducida a roles comerciales del mercado (`producer`, `buyer`, `company`, `agrotienda`). Sigue siendo importante no guardar campos internos sensibles en la misma fila pública. |
| 2 | **`cosechas` · `cosecha_bunker_company_read`** | **Company** puede leer cosechas de productores afiliados **sin** exigir `estado = 'publicada'`. Puede ser intencional (B2B), pero **no** es “mercado ciego” hacia la empresa: ve borradores / no publicadas. |
| 3 | **`requerimientos_compra` · `req_compra_select_mercado`** | La política debe filtrar por `categoria_destino` para que cada rol vea solo el mercado que realmente le corresponde. |
| 4 | **`agricultural_inputs`** | La política por municipio debe limitar quién puede leer catálogo ajeno; `company` y `transporter` no deberían entrar solo por coincidir en municipio. |
| 5 | **`salas_chat`** | Bien acotado a **dos participantes**; campos como `precio_acordado` solo son accesibles a comprador y agricultor de esa sala. **No** hay brecha de participación para company/agrotienda/transporter salvo que compartan literalmente ese `auth.uid()` (no habitual). |
| 6 | **`freight_requests`** | **Transporter** ve origen/destino/fecha de cargas **abiertas** en pizarra: esperable para logística; no es “mercado ciego” de grano, pero **sí** exposición de intención logística. |

---

## Recomendaciones (priorizadas)

1. **Columnas y vistas**: Para `cosechas` “mercado”, exponer solo columnas no sensibles vía **VISTA** o **RLS con expresiones** (o mover datos internos a otra tabla con políticas más estrictas).
2. **`req_compra_select_mercado`**: Mantener la restricción por `categoria_destino` y añadir filtros por estado/segmento cuando el negocio lo pida.
3. **`cosecha_bunker_company_read`**: Revisar si la empresa debe seguir viendo borradores de productores vinculados o solo estados comerciales.
4. **`agricultural_inputs`**: Mantener excluidos a **transporter/company** del catálogo ajeno por municipio salvo que el negocio cambie.
5. **Auditoría**: Documentar qué columnas son “públicas mercado” vs “solo chat” vs “solo bunker” y revisar que la app no proyecte campos prohibidos.

---

## Verificación en Supabase (alinear doc ↔ base real)

No hace falta adivinar si prod coincide con el repo: inspección en caliente.

1. Abre **Supabase** → **SQL Editor** → nueva consulta.
2. Pega y ejecuta **`database/verify-rls-mercado-ciego.sql`**.
3. Revisa:
   - **Primer `SELECT`**: todas las políticas de `cosechas`, `requerimientos_compra`, `freight_requests`, `agricultural_inputs`, `salas_chat`. Compara `policyname`, `comando_sql` y expresiones `USING` / `WITH CHECK` con las secciones de este documento.
   - **Segundo bloque**: políticas de `mensajes` (chat).
   - **Tercer bloque**: `rls_activo = true` en cada tabla; si es `false`, RLS no está aplicado en esa tabla.
4. Al final del script SQL hay un **comentario** con la lista de nombres de políticas **esperadas** tras el bundle completo del repositorio. Si falta alguna (p. ej. `agri_inputs_select_nacional_producer_buyer`), ejecuta el delta correspondiente o actualiza este `SECURITY_MAP.md` si el proyecto sigue otra política a propósito.

**Exportar para archivo:** en el editor de resultados, usa export CSV si quieres archivar un snapshot junto a un release.

---

*Última revisión: estado del repositorio; la verificación en vivo es la fuente de verdad en cada entorno.*
