# Arquitectura del Sistema — CGS Bot

> Fuente de verdad técnica. Leer antes de tomar decisiones de implementación o arquitectura.

---

## Stack

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Canal | WhatsApp Cloud API (Meta) | Canal de entrada/salida con el usuario final |
| Automatización | n8n (self-hosted) | Recibe el webhook de Meta, responde 200 OK inmediato, encola en Supabase |
| Base de datos | Supabase (PostgreSQL) | Persistencia, búsqueda fuzzy via pg_trgm, RPCs transaccionales |
| Backend | Node.js + Express (Railway) | Worker que procesa la cola y envía respuestas vía Meta Cloud API |
| Monitoreo | Sentry | Captura de errores en producción |

---

## Pipeline de un mensaje entrante

```
Usuario (WhatsApp)
      │  mensaje
      ▼
Meta Cloud API
      │  POST webhook
      ▼
n8n (workflow activo)
      │  1. Responde 200 OK a Meta (evita reintento)
      │  2. INSERT en bot_queue {phone_number, message_body, status='pendiente'}
      ▼
Supabase → tabla bot_queue
      │
      ▼  polling cada WORKER_INTERVAL_MS (default: 2000ms)
Worker (index.js → lib/worker.js)
      │  1. SELECT mensajes con status='pendiente'
      │  2. Marca status='procesando'
      │  3. Procesa mensaje → handleCommand()
      │  4. Envía respuesta vía Meta Cloud API
      │  5. Marca status='completado' o 'error'
      ▼
Meta Cloud API
      │  respuesta
      ▼
Usuario (WhatsApp)
```

---

## Tabla: bot_queue

Cola central del sistema. **No es deprecated.**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigint | PK autoincremental |
| `message_id` | text | ID único del mensaje de Meta (para deduplicación) |
| `phone_number` | text | Número del remitente (identifica al vendedor) |
| `customer_name` | text | Nombre del perfil de WhatsApp |
| `message_body` | text | Texto del mensaje recibido |
| `status` | text | `pendiente` → `procesando` → `completado` / `error` |
| `created_at` | timestamptz | Timestamp de inserción por n8n |
| `updated_at` | timestamptz | Última actualización por el worker |

---

## Router de comandos (commands.js)

El worker parsea el mensaje y llama a `handleCommand(command, args, supabase, session, waPhone)`.

### Prefijo de comandos
Los comandos usan `!` como prefijo interno (ej: `!pedido`, `!buscar`). El parser convierte el input del usuario al formato interno.

### Comandos activos

| Comando interno | Alias usuario | Handler | Estado |
|----------------|--------------|---------|--------|
| `!catalogo` | `/catalogo`, `/c` | `commands.js` | ✅ Activo |
| `!producto` | `/[ID]`, `/p` | `commands.js` | ✅ Activo |
| `!categoria` | `/auto`, `/moto`, `/camion` | `commands.js` | ✅ Activo |
| `!buscar` | `/buscar`, `/b` | `handlers/buscar.js` | ✅ Activo |
| `!guia` | `/guia`, `/g` | `handlers/guia.js` | ✅ Activo |
| `!pedido` | `/pedido` | `handlers/pedido.js` | ✅ Activo |
| `!mispedidos` | `/mispedidos` | `handlers/mispedidos.js` | ✅ Activo |
| `!ventas` | `/ventas` | `commands.js` | ✅ Activo |
| `!top` | `/ranking` | `commands.js` | ✅ Activo |
| `!ayuda` | `/ayuda`, `/a` | `commands.js` | ✅ Activo |
| `!salir` | `/salir` | `commands.js` | ✅ Activo |

### Comandos internos (no visibles al usuario)

| Comando interno | Propósito |
|----------------|-----------|
| `__select__` | Selección numérica en listas activas |
| `__pedido_buscar_cliente__` | Paso 1 del flujo /pedido |
| `__pedido_alta_cliente__` | Paso 2: alta de cliente nuevo |
| `__pedido_items__` | Paso 3: carga de ítems |
| `__pedido_confirmar__` | Paso 4: confirmación final |

---

## Sesiones

El worker mantiene sesión por número de teléfono. La sesión persiste el estado conversacional entre mensajes para flujos multi-paso (ej: `/pedido`).

Campos clave de sesión:
- `flowStep` — paso actual del flujo (`null` si no hay flujo activo)
- `lastResults` — últimos resultados de búsqueda (para selección numérica)
- `lastAction` — contexto de la última acción (`ficha`, `pedido`, etc.)

---

## Tablas activas y su propósito

| Tabla | Estado | Descripción |
|-------|--------|-------------|
| `bot_queue` | ✅ Core | Cola de mensajes del pipeline |
| `vendedores` | ✅ Core | Registro del equipo; el teléfono es el identificador del vendedor |
| `products` | ✅ Core | Catálogo de lubricantes YPF |
| `product_presentations` | ✅ Core | Variantes vendibles por producto: "Balde 20L", "Bidón 4L", etc. con precio USD |
| `exchange_rates` | ✅ Core | Tipo de cambio USD→PYG actualizado vía n8n. RPC `get_exchange_rate()` |
| `clientes` | ✅ Core | Base de clientes con RUC. RUC `00000000-0` = CONSUMIDOR FINAL |
| `pedidos` | ✅ Core | Órdenes de venta con total en PYG |
| `pedido_items` | ✅ Core | Ítems de cada pedido con snapshot de presentación, precio USD, precio PYG y tasa aplicada |
| `pedidos_resumen` | ✅ Core | VIEW agregada para listados y reportes |
| `vehicle_guide` | ✅ Secundaria | Guía de lubricación por vehículo |
| `sales` | ⚠️ Deprecated | Tabla de ventas antigua; reemplazada por `pedidos`+`pedido_items` |

### Modelo de precios

```
products (catálogo base)
    └── product_presentations (variante + precio_usd)
            └── pedido_items (snapshot: presentation_label + price_usd + price_pyg + exchange_rate)

exchange_rates
    └── get_exchange_rate('USD') → rate PYG vigente (NULL si >48h sin actualizar)
```

**Regla:** Si `get_exchange_rate()` devuelve NULL, el bot muestra el precio solo en USD. Nunca rompe el flujo.

### Cliente CONSUMIDOR FINAL
RUC fijo `00000000-0`. Seed aplicado en `09-presentations-prices.sql`. Usar cuando el cliente no tiene RUC o no quiere identificarse. Permite filtrar en reportes con `WHERE cliente_ruc != '00000000-0'`.

---

## Mensajes interactivos de Meta (WhatsApp Cloud API)

El bot soporta tres tipos de salida:

| Tipo | Cuándo usarlo | Estructura |
|------|--------------|------------|
| `text` | Preguntas abiertas, confirmaciones simples, errores | `string` |
| `buttons` | 2-3 opciones mutuamente excluyentes (confirmar, cancelar, elegir) | `{ _type:'buttons', body, buttons:[{id,title}] }` |
| `list` | 4-10 opciones (selección de cliente, producto, presentación) | `{ _type:'list', body, buttonText, sections:[{title,rows:[{id,title,description}]}] }` |

### Respuestas interactivas del usuario

Cuando el usuario toca un botón o elige de una lista, Meta envía un payload diferente al texto. n8n lo convierte y almacena en `bot_queue.message_body` con prefijos:

| Tipo Meta | Formato en bot_queue |
|-----------|---------------------|
| `button_reply` | `__btn:confirm_yes` |
| `list_reply` | `__list:cli_80012345-6` |

El parser detecta estos prefijos y los routea al flowStep activo.

### IDs de interactivos — convenciones

| Prefijo del ID | Qué referencia |
|---------------|---------------|
| `cli_<ruc>` | Cliente existente (ej: `cli_80012345-6`) |
| `cli_new` | Crear cliente nuevo |
| `cli_cf` | Consumidor final |
| `pres_<id>` | Presentación de producto (ej: `pres_42`) |
| `prod_<id>` | Producto sin presentación específica |
| `confirm_yes` | Confirmar acción |
| `confirm_no` | Cancelar acción |
| `cart_add` | Agregar otro producto al carrito |
| `cart_done` | Ir al resumen/confirmación |

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
3. **Si se necesita nueva tabla o RPC** → documentar en `docs/modelo-datos.md` antes de implementar
4. **El flujo conversacional** → documentar en `docs/comandos/<nombre>.md` antes de codear
5. **Nunca usar** la tabla `sales` para nuevas funcionalidades

---

## Decisiones de diseño tomadas

| Decisión | Razón |
|----------|-------|
| n8n recibe el webhook, no Express | Express no necesita estar expuesto públicamente; n8n garantiza el 200 OK inmediato a Meta |
| Worker por polling, no push | Simplifica el deploy en Railway; no requiere WebSockets ni canales Realtime de Supabase |
| Prefijo `!` internamente | Separa el espacio de comandos del parser del input crudo del usuario |
| `vendedor_telefono` como identificador | El número de WhatsApp es el identificador natural del vendedor en campo |
| `pedidos` reemplaza `sales` | Modelo más rico: tiene cliente, estado, ítems, vendedor y permite flujos multi-paso |
