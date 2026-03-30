# Checklist de pruebas por rol

## Objetivo

Validar que la app responde correctamente por rol, persiste sesión, navega al shell correcto y deja rastro operativo cuando algo falla.

## Validaciones transversales

- Arranque en frío con sesión cerrada: muestra `Welcome`.
- Login correcto: entra al shell correcto según rol.
- Login fallido: muestra error claro y deja rastro en `app_runtime_logs`.
- Logout: vuelve a `Welcome`.
- Arranque en frío con sesión persistida: recupera sesión y shell correcto.
- Cambio de red: la app no se rompe y los módulos con sync reaccionan de forma controlada.
- `npm run validate` antes y después de la ronda de pruebas.

## Productor (`independent_producer`)

- Login exitoso.
- Carga `ProducerRoleTabs`.
- Abre `ProducerDashboard`.
- Refresca dashboard sin crash.
- Revisa `Perfil` y la Shared Entity propia del productor.
- Valida herramientas clave:
  - Diario
  - Mis fincas
  - Publicar cosecha
  - Maquinaria
- Si falla una carga parcial, revisar `app_runtime_logs` por scopes `producer.dashboard.*`.

## Empresa (`company`)

- Login exitoso.
- Carga `CompanyTabNavigator`.
- Navega a `AffiliatedFarmersList`.
- Toca un productor vinculado y abre `SharedProducerProfile`.
- Verifica que la vista sea de contexto `company_view`.
- Revisa pestañas:
  - Panel
  - Seguimiento
  - Chat
  - Perfil

## Perito (`perito`)

- Login exitoso.
- Carga `PeritoStack`.
- Revisa órdenes/carga inicial.
- Simula reconexión y observa sync.
- Verifica que errores de sync aparezcan en `app_runtime_logs` con scopes `field_inspection.*`.

## Comprador (`buyer`)

- Login exitoso.
- Carga shell comprador.
- Revisa campañas, cosechas, proveedores cercanos, insumos.
- Cambia filtros y pestañas.
- Verifica que fallos parciales queden en `app_runtime_logs` con scopes `buyer.dashboard.*`.

## Transporte (`transporter`)

- Login exitoso.
- Carga shell transporte.
- Revisa flota.
- Cambia disponibilidad.
- Entra a rutas.
- Si aplica, probar permisos de ubicación y tracking.
- Verifica logs `freight.bg.*` y `transporter.dashboard.*`.

## Agrotienda (`agrotienda`)

- Login exitoso.
- Carga shell agrotienda.
- Revisa catálogo/tablero.
- Abre perfil.

## CEO (`zafra_ceo`)

- Login exitoso.
- Carga shell ejecutivo.
- Revisa panel, auditoría y pantallas críticas.
- Confirmar lectura de `app_runtime_logs` si se expone en fase posterior.

## Evidencia mínima por rol

- Captura de pantalla del shell.
- Confirmación de pantalla inicial correcta.
- Confirmación de logout.
- Confirmación de sesión persistida.
- Consulta de `app_runtime_logs` si hubo error o warning.
