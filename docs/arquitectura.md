# Arquitectura del Sistema — CGS Bot

> Fuente de verdad técnica. Leer antes de tomar decisiones de implementación o arquitectura.
> Última actualización: 2026-05-26

---

## Stack

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Canal | WhatsApp Cloud API v23.0 (Meta) | Canal de entrada/salida con el usuario final |
| Automatización | n8n (self-hosted) | Recibe el webhook de Meta, responde 200 OK inmediato, encola en Supabase |
| Base de datos | Supabase (PostgreSQL) | Persistencia, búsqueda fuzzy via pg_trgm, RPCs transaccionales |
| Backend | Node.js + Express (Railway) | Worker que procesa la cola y envía respuestas vía Meta Cloud API |
| Monitoreo | Sentry | Captura de errores en producción |

---

## Pipeline de un mensaje entrante

```
Usuario (WhatsApp)
      │  mensaje (texto o interactivo)
      ▼
Meta Cloud API
      │  POST /webhook
      ▼
n8n (workflow activo)
      │  1. Nodo IF: filtra solo webhooks con messages[] (descarta status updates)
      │  2. INSERT en bot_queue con message_body = JSON.stringify(messages[0])
      │  3. n8n responde 200 OK a Meta automáticamente
      ▼
Supabase → tabla bot_queue
      │
      ▼  polling cada WORKER_INTERVAL_MS (default: 2000ms)
Worker (index.js → lib/worker.js)
      │  1. SELECT mensaje con status='pendiente'
      │  2. Marca status='procesando' (bloqueo optimista)
      │  3. extractPayload() → extrae text o interactiveId del JSON
      │  4. parseIntent() / parseInteractive() → { command, args }
      │  5. handleCommand() → result
      │  6. dispatch() → envía respuesta vía Meta Cloud API
      │  7. Marca status='completado' o 'error'
      ▼
Meta Cloud API → Usuario (WhatsApp)
```

---

## n8n Workflow

**ID:** `o0kGB960Kf16Q2rW`  
**Nombre:** CGS Bot — Meta WhatsApp Cloud API  
**Webhook path:** `/webhook/whatsapp`  
**Versión de webhook node:** v2 (payload en `$json["body"]`)

### Nodos

| Nodo | Tipo | Rol |
|------|------|-----|
| Webhook (Meta) | webhook v2 | Punto de entrada; responde 200 OK automáticamente |
| If | if v2.3 | Filtra: pasa solo si hay `messages[]` en el payload |
| Create a row | supabase v1 | Inserta en `bot_queue` |

### Configuración del nodo IF

```
Condición: {{ $json["body"]["entry"][0]["changes"][0]["value"]["messages"] }}
Operador:  is not empty  (tipo string, loose validation)
```

Rama **true** (hay mensaje) → Create a row  
Rama **false** (status update: delivered, read, etc.) → fin, ignorar

### Paths de campos en Supabase node

> Nota: el workflow usa índices string `"0"` en algunos campos e índices numéricos `[0]` en otros.
> Ambas formas funcionan en n8n v2. No mezclar dentro de un mismo campo.

| Campo bot_queue | Expresión n8n |
|----------------|---------------|
| `message_id` | `{{ $json["body"]["entry"]["0"]["changes"]["0"]["value"]["messages"]["0"]["id"] }}` |
| `phone_number` | `{{ $json["body"]["entry"]["0"]["changes"]["0"]["value"]["messages"]["0"]["from"] }}` |
| `message_body` | `{{ JSON.stringify($json["body"]["entry"][0]["changes"][0]["value"]["messages"][0]) }}` |
| `customer_name` | `{{ $json["body"]["entry"]["0"]["changes"]["0"]["value"]["contacts"]["0"]["profile"]["name"] }}` |

---

## Tabla: bot_queue

Cola central del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigint PK | Autoincremental |
| `message_id` | text | ID único del mensaje de Meta (para deduplicación) |
| `phone_number` | text | Número del remitente (identifica al vendedor) |
| `customer_name` | text | Nombre del perfil de WhatsApp |
| `message_body` | text | **JSON completo** de `messages[0]` de Meta (serializado con `JSON.stringify`) |
| `status` | text | `pendiente` → `procesando` → `completado` / `error` |
| `created_at` | timestamptz | Timestamp de inserción por n8n |
| `updated_at` | timestamptz | Última actualización por el worker |

### Formato de message_body

El campo contiene el objeto `messages[0]` completo serializado. El worker extrae el contenido en `extractPayload()`:

```js
// Mensaje de texto:
{ "type": "text", "text": { "body": "hola" }, "from": "595...", "id": "...", "timestamp": "..." }
// → text = "hola", interactiveId = null

// Mensaje interactivo (botón):
{ "type": "interactive", "interactive": { "type": "button_reply", "button_reply": { "id": "confirm_yes", "title": "✅ Confirmar" } }, ... }
// → text = "", interactiveId = "confirm_yes"

// Mensaje interactivo (lista):
{ "type": "interactive", "interactive": { "type": "list_reply", "list_reply": { "id": "cli_80012345-6", "title": "..." } }, ... }
// → text = "", interactiveId = "cli_80012345-6"
```

---

## Schema de base de datos

### bot_queue
`id` (bigint PK), `message_id` (text), `phone_number` (text), `customer_name` (text), `message_body` (text), `status` (text), `created_at` (timestamptz), `updated_at` (timestamptz)

### vendedores
`telefono` (text PK), `nombre` (text), `categorias` (ARRAY), `ciudades` (ARRAY), `activo` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz)

### products
`id` (bigint PK), `name` (text), `category` (text), `technology` (text), `description` (text), `specs` (text), `viscosity` (text), `presentations` (ARRAY), `applications` (ARRAY), `vehicle_type` (text), `image` (text), `featured` (boolean), `badge` (text), `sort_order` (integer), `created_at` (timestamptz), `updated_at` (timestamptz), `search_terms` (text)

### product_presentations
`id` (integer PK), `product_id` (integer FK→products), `label` (text), `price_usd` (numeric), `active` (boolean), `sort_order` (integer), `created_at` (timestamptz), `updated_at` (timestamptz)

> ⚠️ La columna se llama `active`, NO `is_active`.

### clientes
`ruc` (text PK), `razon_social` (text), `ciudad` (text), `contacto` (text), `telefono` (text), `notas` (text), `search_terms` (text), `created_by` (text FK→vendedores.telefono), `created_at` (timestamptz), `updated_at` (timestamptz)

### pedidos
`id` (bigint PK), `cliente_ruc` (text FK→clientes), `vendedor_telefono` (text FK→vendedores), `estado` (text), `notas` (text), `total_unidades` (integer), `total_monto` (numeric), `created_at` (timestamptz), `confirmed_at` (timestamptz)

> `total_monto` se almacena en USD.

### pedido_items
`id` (bigint PK), `pedido_id` (bigint FK→pedidos), `product_id` (integer FK→products), `product_name` (text), `quantity` (integer), `unit_price` (numeric), `subtotal` (numeric), `presentation_id` (integer FK→product_presentations), `presentation_label` (text), `unit_price_usd` (numeric), `unit_price_pyg` (numeric), `exchange_rate` (numeric)

### pedidos_resumen *(VIEW)*
`id`, `estado`, `created_at`, `confirmed_at`, `cliente_ruc`, `razon_social`, `ciudad`, `vendedor_telefono`, `vendedor_nombre`, `total_unidades`, `notas`, `num_items`

### exchange_rates
`currency` (text PK), `rate_pyg` (numeric), `source` (text), `updated_at` (timestamptz)

### vehicle_guide
`id` (integer PK), `brand`, `model`, `year_from`, `year_to`, `engine_type`, `recommended_product_id` (FK→products), `alternative_product_id` (FK→products), `notes`, `search_terms`, `created_at`

### sales *(deprecated)*
`id`, `product_id`, `product_name`, `category`, `quantity`, `registered_by`, `created_at`
> Tabla de ventas antigua. No usar para nuevas funcionalidades. Reemplazada por `pedidos` + `pedido_items`.

---

## Tablas activas y su propósito

| Tabla | Estado | Descripción |
|-------|--------|-------------|
| `bot_queue` | ✅ Core | Cola de mensajes del pipeline |
| `vendedores` | ✅ Core | Registro del equipo; el teléfono es el identificador del vendedor |
| `products` | ✅ Core | Catálogo de lubricantes YPF |
| `product_presentations` | ✅ Core | Variantes vendibles por producto con precio USD. Columna `active`. |
| `exchange_rates` | ⚠️ Sin uso | No se usa — tasa obtenida desde open.er-api.com en tiempo real |
| `clientes` | ✅ Core | Base de clientes con RUC. RUC `00000000-0` = CONSUMIDOR FINAL |
| `pedidos` | ✅ Core | Órdenes de venta. `total_monto` en USD |
| `pedido_items` | ✅ Core | Ítems con snapshot: presentación, precio USD, precio PYG, tasa aplicada |
| `pedidos_resumen` | ✅ Core | VIEW para listados y reportes |
| `vehicle_guide` | ✅ Secundaria | Guía de lubricación por vehículo |
| `sales` | ⚠️ Deprecated | Reemplazada por `pedidos` + `pedido_items` |

### Modelo de precios

```
products (catálogo base)
    └── product_presentations (variante + price_usd)
            └── pedido_items (snapshot: presentation_label + unit_price_usd + unit_price_pyg + exchange_rate)

open.er-api.com (HTTP, sin API key)
    └── lib/prices.js → caché en memoria 30 min → tasa PYG vigente (null si nunca cargó)
```

**Regla:** Si la tasa no está disponible, el bot muestra el precio solo en USD. Nunca rompe el flujo.  
**price_usd = 0** se trata como "sin precio cargado" (falsy en JS) — mismo comportamiento que NULL.  
**La tabla `exchange_rates` no se usa.** Tasa obtenida directo desde la API externa; snapshot guardado en `pedido_items.exchange_rate` en el momento de cada venta.

### Cliente CONSUMIDOR FINAL
RUC fijo `00000000-0`. Usar cuando el cliente no tiene RUC o no quiere identificarse. Permite filtrar en reportes con `WHERE cliente_ruc != '00000000-0'`.

---

## Router de comandos (commands.js)

El worker parsea el mensaje y llama a `handleCommand(command, args, supabase, session, waPhone)`.

### Comandos activos

| Comando interno | Activador usuario | Handler | Estado |
|----------------|-----------------|---------|--------|
| `!catalogo` | `/catalogo`, `catalogo`, `lista` | `commands.js` | ✅ Activo |
| `!p` | `/[ID]`, número solo | `commands.js` | ✅ Activo |
| `!cat` | `auto`, `moto`, `camion`, etc. | `commands.js` | ✅ Activo |
| `!buscar` | `buscar X`, texto libre | `handlers/buscar.js` | ✅ Activo |
| `!guia` | `guia X`, `recomendacion` | `handlers/guia.js` | ✅ Activo |
| `!pedido` | `pedido` | `handlers/pedido.js` | ✅ Activo |
| `!mispedidos` | `mis pedidos`, `pedidos` | `handlers/mispedidos.js` | ✅ Activo |
| `!ventas` | `ventas`, `ventas hoy`, `ventas semana` | `commands.js` | ✅ Activo |
| `!top` | `ranking`, `top`, `mas vendidos` | `commands.js` | ✅ Activo |
| `!ayuda` | `ayuda`, `hola`, `menu` | `commands.js` | ✅ Activo |
| `!salir` | `salir`, `cancelar`, `chau` | `commands.js` | ✅ Activo |

### Comandos internos del flujo /pedido

| Comando interno | flowStep activo | Origen |
|----------------|----------------|--------|
| `__pedido_buscar_cliente__` | `pedido_esperando_cliente` | Texto libre |
| `__pedido_select_cliente__` | — | Interactivo `cli_<ruc>` |
| `__pedido_consumidor__` | — | Interactivo `cli_cf` |
| `__pedido_alta_ruc__` | — | Interactivo `cli_new` / `alta_nuevo` |
| `__pedido_alta_nombre__` | `pedido_alta_nombre` | Texto libre (nombre del cliente) |
| `__pedido_alta_confirm__` | — | Interactivo `alta_confirm` |
| `__pedido_alta_cancel__` | — | Interactivo `alta_cancel` |
| `__pedido_esperando_item__` | `pedido_esperando_item` | Texto libre (búsqueda de producto) |
| `__pedido_select_prod__` | — | Interactivo `prod_<id>` |
| `__pedido_select_pres__` | — | Interactivo `pres_<id>` |
| `__pedido_esperando_cantidad__` | `pedido_esperando_cantidad` | Texto libre (cantidad) |
| `__pedido_cart_add__` | — | Interactivo `cart_add` |
| `__pedido_cart_done__` | — | Interactivo `cart_done` |
| `__pedido_confirmar__` | `pedido_confirmando` / `pedido_alta_confirmando` / `pedido_cliente_confirmado` | Texto o interactivo `confirm_yes/no` |

---

## Sesiones

El worker mantiene sesión por número de teléfono en memoria. TTL: 15 minutos.

Campos clave de sesión:
- `flowStep` — paso actual del flujo (`null` si no hay flujo activo)
- `lastResults` — últimos resultados de búsqueda (para selección numérica)
- `lastAction` — contexto de la última acción
- `pedidoDraft` — estado acumulado del pedido en construcción (cliente, carrito, etc.)

### flowSteps del flujo /pedido

| flowStep | Estado conversacional |
|----------|----------------------|
| `pedido_esperando_cliente` | Esperando texto de búsqueda de cliente |
| `pedido_cliente_confirmado` | Cliente seleccionado; se usó para confirmar la selección |
| `pedido_alta_nombre` | Esperando nombre del cliente nuevo |
| `pedido_alta_confirmando` | Esperando confirmación del alta de cliente |
| `pedido_esperando_item` | Esperando búsqueda de producto |
| `pedido_esperando_cantidad` | Producto y presentación seleccionados; esperando cantidad |
| `pedido_confirmando` | Carrito listo; esperando confirmación del pedido |

---

## Mensajes interactivos de Meta (WhatsApp Cloud API)

El bot soporta tres tipos de salida:

| Tipo | Cuándo usarlo | Estructura devuelta por el handler |
|------|--------------|----------------------------------|
| `text` | Preguntas abiertas, errores, confirmaciones simples | `string` o `{ text, _session }` |
| `buttons` | 2-3 opciones mutuamente excluyentes | `{ _type:'buttons', body, buttons:[{id,title}], _session? }` |
| `list` | 4-10 opciones (clientes, productos, presentaciones) | `{ _type:'list', body, buttonText, sections:[{title,rows:[{id,title,description}]}], _session? }` |

El campo `_session` en el resultado indica al worker que actualice la sesión antes de enviar.

### IDs de interactivos — convenciones

| Prefijo del ID | Qué referencia |
|---------------|---------------|
| `cli_<ruc>` | Selección de cliente existente (ej: `cli_80012345-6`) |
| `cli_new` | Iniciar alta de cliente nuevo |
| `cli_cf` | Seleccionar Consumidor Final |
| `pres_<id>` | Selección de presentación (ej: `pres_42`) |
| `prod_<id>` | Selección de producto sin presentación |
| `confirm_yes` | Confirmar acción actual |
| `confirm_no` | Cancelar acción actual |
| `cart_add` | Agregar otro producto al carrito |
| `cart_done` | Ir al resumen y confirmar pedido |
| `alta_confirm` | Confirmar datos del cliente nuevo |
| `alta_cancel` | Cancelar alta de cliente |
| `alta_nuevo` | Volver a intentar alta con otro RUC |
| `buscar_otro` | Buscar cliente con otro término |

---

## Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Clave de servicio (bypasa RLS) |
| `META_PHONE_NUMBER_ID` | ID del número de WhatsApp en Meta |
| `META_ACCESS_TOKEN` | Token de acceso a Meta Cloud API |
| `SENTRY_DSN` | DSN de Sentry (opcional, activa monitoreo) |
| `WORKER_INTERVAL_MS` | Intervalo de polling del worker (default: 2000ms) |
| `PORT` | Puerto HTTP para Express (default: 3000) |

---

## Protocolo para nuevas features

Antes de implementar cualquier comando o modificación al pipeline:

1. **Leer este doc** y `docs/comandos/README.md`
2. **Verificar** que los datos necesarios existen en las tablas activas
3. **Si se necesita nueva tabla o RPC** → documentar aquí antes de implementar
4. **El flujo conversacional** → documentar en `docs/comandos/<nombre>.md` antes de codear
5. **Nunca usar** la tabla `sales` para nuevas funcionalidades

---

## Decisiones de diseño tomadas

| Decisión | Razón |
|----------|-------|
| n8n recibe el webhook, no Express | Express no necesita estar expuesto públicamente; n8n garantiza el 200 OK inmediato a Meta |
| Worker por polling, no push | Simplifica el deploy en Railway; no requiere WebSockets ni canales Realtime |
| `message_body` = JSON completo de `messages[0]` | El backend extrae `text` o `interactiveId` del JSON; n8n no necesita lógica condicional |
| Prefijo `!` internamente | Separa el espacio de comandos del parser del input crudo del usuario |
| `vendedor_telefono` como identificador | El número de WhatsApp es el identificador natural del vendedor en campo |
| `pedidos` reemplaza `sales` | Modelo más rico: tiene cliente, estado, ítems, vendedor y permite flujos multi-paso |
| `total_monto` en USD | Fuente de verdad única; PYG es siempre display |
| Caché de tasa en memoria (30 min) | Evita query a Supabase en cada mensaje; fallback a última tasa si falla |
| CONSUMIDOR FINAL = RUC `00000000-0` | Sin cambios al schema; filtrable en reportes; desacoplado |
| `price_usd = 0` equivale a sin precio | Permite UPDATEs sin NULL; el bot muestra "Sin precio cargado" si `price_usd` es falsy |
