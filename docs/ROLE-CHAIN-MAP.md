# Mapa de cadenas entre roles

Estado esperado tras aplicar `database/delta-rls-role-chain-hardening.sql`.

## 1. Ventas de cosecha

- `independent_producer`: crea, edita, publica y elimina sus propias `cosechas`.
- `buyer`: ve `cosechas` publicadas.
- `company`: ve `cosechas` publicadas del mercado y, adicionalmente, las de productores ya vinculados en cartera.
- `agrotienda`: ve `cosechas` publicadas para detectar demanda comercial.
- `transporter`: no debe entrar al mercado de ventas; opera por pizarra de transporte.

## 2. Requerimientos de compra

- `buyer`: crea, edita y elimina sus propios `requerimientos_compra`.
- `independent_producer`: ve solo requerimientos con `categoria_destino = 'Cosecha a Granel'`.
- `company`: ve solo requerimientos con `categoria_destino = 'Volumen Procesado / Silos'`.
- `agrotienda`: ve solo requerimientos con `categoria_destino = 'Insumos y Maquinaria'`.
- `transporter`: no participa en este módulo.

## 3. Solicitudes de transporte

- `independent_producer`, `buyer`, `company`, `agrotienda`: pueden crear `freight_requests`.
- El creador ve y gestiona solo sus propias solicitudes.
- `transporter`: ve solo solicitudes `abierta` o `con_postulaciones`, y también las asignadas a él.
- El creador puede ver nombre, reputación y teléfono de transportistas que aplicaron o quedaron asignados a sus propias solicitudes.
- El `transporter` puede ver el nombre del solicitante cuando la carga está abierta o asignada.

## 4. Chat

- `buyer` y `independent_producer`: solo ven salas donde participan.
- Cada participante puede ver el perfil básico de su contraparte dentro de esa sala.
- `company`, `agrotienda` y `transporter` no deben entrar a `salas_chat` de compraventa si no son participantes.

## 5. Cartera empresa <-> agricultor

- `company`: ve empleados y agricultores vinculados a su propia empresa.
- `independent_producer`: ve su propia afiliación y la empresa que lo financia o vincula.
- La relación debe vivir en `company_affiliations` y sincronizar `company_farmers` solo cuando queda activa.

## 6. Insumos agrotienda

- `agrotienda`: gestiona sus propios insumos.
- `independent_producer` y `buyer`: ven catálogo nacional y también por municipio cuando aplica.
- `company` y `transporter`: no deben ver catálogo ajeno solo por compartir municipio.
