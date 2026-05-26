# Estado de Implementación — Flujo Interactivo /pedido

> Actualizado: 2026-05-26  
> Estado general: **✅ COMPLETO — en producción y probado**

---

## Todos los pasos completados

| Paso | Archivo | Estado | Notas |
|------|---------|--------|-------|
| 0 | SQL: tablas y RPCs | ✅ Aplicado | `product_presentations`, `pedido_items` ampliado, `crear_pedido`, `get_exchange_rate` |
| 1 | `lib/meta.js` | ✅ Completo | `sendInteractiveButtons`, `sendInteractiveList` |
| 1b | `lib/prices.js` | ✅ Completo | Caché 30 min, `getExchangeRate`, `formatPrice`, `toPyg`, `formatTotal` |
| 2 | `lib/worker.js` | ✅ Completo | `extractPayload`, `dispatch` con `_type`, `FLOW_COMMANDS` con los 14 comandos de flujo |
| 3 | `lib/parser.js` | ✅ Completo | `parseIntent` con flowSteps, `parseInteractive` → `routeInteractive` |
| 4 | `handlers/pedido.js` | ✅ Completo | 15 handlers — flujo interactivo completo de extremo a extremo |
| 4b | `lib/pedidos.js` | ✅ Completo | `buscarProductosPorNombre`, `buscarProductoPorId`, `buscarPresentaciones`, `crearPedido` |
| 5 | n8n workflow | ✅ Completo | IF filtra messages[], message_body = JSON.stringify(messages[0]) |

---

## Arquitectura del flujo /pedido (estado final)

```
/pedido
  └─► buscar cliente (texto libre)
        ├─► lista de clientes encontrados [cli_<ruc>]
        │     └─► cliente seleccionado → pedido_esperando_item
        ├─► [cli_cf] Consumidor Final → pedido_esperando_item
        └─► [cli_new] Alta de cliente
              ├─► ingresa RUC (texto)
              ├─► ingresa nombre (texto) → flowStep: pedido_alta_nombre
              └─► [alta_confirm] confirmar alta → pedido_esperando_item

pedido_esperando_item
  └─► busca producto (texto libre)
        └─► lista de productos [prod_<id>]
              └─► selección de presentación [pres_<id>]
                    └─► ingresa cantidad → flowStep: pedido_esperando_cantidad
                          └─► resumen del ítem + opciones carrito
                                ├─► [cart_add] agregar otro → pedido_esperando_item
                                └─► [cart_done] ver resumen
                                      └─► [confirm_yes] → RPC crear_pedido → ✅
                                          [confirm_no]  → pedido cancelado
```

---

## Handlers en handlers/pedido.js

| Handler exportado | Comando interno | flowStep que genera |
|------------------|----------------|---------------------|
| `handlePedido` | `!pedido` | `pedido_esperando_cliente` |
| `handlePedidoBuscarCliente` | `__pedido_buscar_cliente__` | `pedido_cliente_confirmado` (si 1 resultado) |
| `handlePedidoSelectCliente` | `__pedido_select_cliente__` | `pedido_esperando_item` |
| `handlePedidoConsumidorFinal` | `__pedido_consumidor__` | `pedido_esperando_item` |
| `handlePedidoAltaRuc` | `__pedido_alta_ruc__` | `pedido_alta_ruc` (espera texto) |
| `handlePedidoAltaNombre` | `__pedido_alta_nombre__` | `pedido_alta_nombre` (espera texto) |
| `handlePedidoAltaConfirm` | `__pedido_alta_confirm__` | `pedido_esperando_item` |
| `handlePedidoAltaCancel` | `__pedido_alta_cancel__` | `pedido_esperando_cliente` |
| `handlePedidoEsperandoItem` | `__pedido_esperando_item__` | `pedido_esperando_cantidad` (tras selección de pres.) |
| `handlePedidoSelectProducto` | `__pedido_select_prod__` | muestra presentaciones |
| `handlePedidoSelectPresentacion` | `__pedido_select_pres__` | `pedido_esperando_cantidad` |
| `handlePedidoEsperandoCantidad` | `__pedido_esperando_cantidad__` | `pedido_confirmando` o `pedido_esperando_item` |
| `handlePedidoCartAdd` | `__pedido_cart_add__` | `pedido_esperando_item` |
| `handlePedidoCartDone` | `__pedido_cart_done__` | `pedido_confirmando` |
| `handlePedidoConfirmar` | `__pedido_confirmar__` | null (cierra flujo) o estado anterior |

`handlePedidoConfirmar` es dual-use: actúa según el `session.flowStep`:
- `pedido_cliente_confirmado` → confirmar selección de cliente
- `pedido_alta_confirmando` → confirmar datos del cliente nuevo (delega a AltaConfirm/AltaCancel)
- default → confirmación final del pedido → RPC `crear_pedido`

---

## n8n — Diseño final implementado

**Diferencia clave vs diseño original:**

El diseño inicial planteaba que n8n transformaría los mensajes interactivos a prefijos `__btn:*` y `__list:*` antes de insertar en bot_queue. **Esto NO se implementó.**

El diseño final (en producción) es más simple:
- n8n almacena siempre `JSON.stringify(messages[0])` — el objeto crudo de Meta
- El worker extrae el contenido en `extractPayload()` (lib/worker.js)
- Para `msg.type === 'interactive'`: extrae `button_reply.id` o `list_reply.id`
- El parser recibe el ID limpio directamente (ej: `"confirm_yes"`, `"cli_80012345-6"`)

Este enfoque elimina lógica condicional en n8n y centraliza el parsing en el backend.

---

## Bugs conocidos y pendientes

### 🔴 Bug: Validación de vendedor muy tarde en el flujo

**Síntoma:** El bot permite hacer todo el flujo /pedido y recién al confirmar el pedido el RPC lanza `vendedor_no_autorizado` si el número está deshabilitado en la tabla `vendedores`.

**Causa:** `isAllowed()` en worker.js se llama al inicio de cada job (correcto), pero si el vendedor está activo al inicio del flujo y luego se deshabilita, o si hay desincronización, el error aparece al final.

**Impacto actual:** Bajo — los vendedores rara vez se deshabilitan durante un flujo activo. El error es claro y el job queda como `error` en la cola.

**Fix planeado:** Agregar validación de `isAllowed()` también dentro del primer handler del flujo (`handlePedido`), antes de iniciar el flujo interactivo.

---

## Datos pendientes de carga (no son bugs de código)

| Dato | Tabla | Estado | Acción requerida |
|------|-------|--------|-----------------|
| Precios de presentaciones | `product_presentations.price_usd` | ⚠️ Todos en 0 | Cargar precios reales en USD |
| Tipo de cambio USD→PYG | `exchange_rates` | ⚠️ Sin dato | Cargar tasa inicial; luego n8n lo actualizará |

Mientras `price_usd = 0` y no hay tasa cargada, el bot funciona pero muestra "Sin precio cargado" en vez de los precios reales.

---

## Decisiones de diseño registradas

| Decisión | Razón |
|----------|-------|
| `message_body` = JSON completo, no prefijos | Centraliza parsing en backend; n8n sin lógica condicional |
| `unit_price_pyg` no se calcula en el bot | La columna existe en el schema; el RPC puede popularlo; el bot la usa si está disponible |
| `total_monto` en pedidos en USD | Fuente de verdad única; PYG es siempre display |
| Caché de tasa en memoria (30 min) | Evita query a Supabase en cada mensaje; fallback a última tasa si falla |
| CONSUMIDOR FINAL como cliente con RUC `00000000-0` | Sin cambios al schema; filtrable en reportes |
| `price_usd = 0` equivale a sin precio cargado | Permite UPDATEs sin NULL; bot trata 0 como falsy (mismo comportamiento) |
