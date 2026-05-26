# Comandos de Venta — /pedido y /mispedidos

> Stakeholders: Vendedor de calle, Vendedor de salón  
> Prioridad: CRÍTICA

---

## /pedido — Flujo rediseñado con interactivos Meta

### Datos que usa
- `clientes` + RPC `search_clientes_fuzzy` → buscar/crear cliente
- `products` + `product_presentations` → catálogo y variantes
- `get_exchange_rate('USD')` → conversión PYG en tiempo real
- RPC `crear_pedido` → escritura atómica en `pedidos` + `pedido_items`

---

### Flujo completo

#### PASO 1 — Trigger
```
Usuario: /pedido
Bot (texto): ¿Para qué cliente? Escribí el nombre o RUC:
Session: { flowStep: 'pedido_esperando_cliente' }
```

---

#### PASO 2A — Búsqueda por nombre (múltiples resultados)
```
Usuario: "lopez"

Bot (LIST MESSAGE):
  body: Encontré estos clientes:
  rows:
    · cli_80012345-6  │ Dist. López S.R.L    │ RUC: 80012345-6 · Asunción
    · cli_45678901-2  │ López & Hnos          │ RUC: 45678901-2 · S.Lorenzo
    · cli_new         │ ➕ Crear cliente nuevo │ El cliente no está en la lista
    · cli_cf          │ 👤 Consumidor final    │ Venta sin RUC

Session: { flowStep: 'pedido_seleccionar_cliente', lastClientResults: [...] }
```

#### PASO 2B — Búsqueda exacta por RUC
```
Usuario: "80012345-6"

Bot (BUTTONS):
  body: ✅ Cliente encontrado
        Dist. López S.R.L
        RUC: 80012345-6 · Asunción
  buttons:
    · confirm_yes  │ Continuar ▶
    · confirm_no   │ Buscar otro

Session: { flowStep: 'pedido_cliente_confirmado', pedidoDraft: { cliente } }
```

#### PASO 2C — RUC no encontrado
```
Bot (BUTTONS):
  body: No tengo registrado ese RUC (80012345-6).
        ¿Qué hacemos?
  buttons:
    · alta_nuevo  │ ➕ Dar de alta
    · cli_cf      │ 👤 Consumidor final
    · buscar_otro │ 🔍 Buscar otro

Session: { flowStep: 'pedido_ruc_no_encontrado', pedidoDraft: { rucNuevo } }
```

#### PASO 2D — Alta de cliente nuevo
```
Usuario tocó "➕ Dar de alta"

Bot (texto): Escribí el nombre o razón social del cliente:
Session: { flowStep: 'pedido_alta_nombre' }

Usuario: "Lubricentro El Roble SRL"

Bot (BUTTONS):
  body: ¿Confirmar nuevo cliente?
        RUC: 80012345-6
        Nombre: Lubricentro El Roble SRL
  buttons:
    · alta_confirm │ ✅ Registrar
    · alta_cancel  │ ❌ Cancelar

Session: { flowStep: 'pedido_alta_confirmando' }
```

---

#### PASO 3 — Cargar ítems (carrito)

Con cliente confirmado, el bot pide productos uno a uno.

```
Bot (texto): 
  Cliente: Dist. López S.R.L ✅
  
  ¿Qué productos? Escribí nombre o ID.
  Ej: "elaion 20w50" · "extravida balde" · "37"

Session: { flowStep: 'pedido_esperando_item', pedidoDraft: { cliente, carrito:[] } }
```

**Sub-flujo por cada ítem:**

```
── Caso A: búsqueda con un solo producto encontrado, múltiples presentaciones ──

Usuario: "elaion 20w50"

Bot (LIST MESSAGE):
  body: Elaion 20W50 — elegí la presentación:
  rows:
    · pres_12  │ Balde 20L   │ USD 45.00 = Gs 337.500
    · pres_13  │ Bidón 4L    │ USD 10.50 = Gs 78.750
    · pres_14  │ Botella 1L  │ USD 3.00  = Gs 22.500

Session: { flowStep: 'pedido_seleccionar_presentacion', pedidoDraft: { ...} }

Usuario toca "Balde 20L"

Bot (texto): ¿Cuántas unidades de Elaion 20W50 Balde 20L?
Session: { flowStep: 'pedido_esperando_cantidad', pedidoDraft: { itemEnCurso: {...} } }

Usuario: "4"

Bot (BUTTONS):
  body: ✅ Agregado al carrito
        4× Elaion 20W50 Balde 20L
        USD 180.00 = Gs 1.350.000
        
        Carrito: 1 producto · 4 uds · Gs 1.350.000
  buttons:
    · cart_add   │ ➕ Agregar otro
    · cart_done  │ 📋 Ver resumen

── Caso B: múltiples productos encontrados ──

Usuario: "extravida"

Bot (LIST MESSAGE):
  body: Encontré varios productos — ¿cuál?
  rows:
    · prod_20  │ Extravida 15W40  │ Semisintético · Camiones
    · prod_21  │ Extravida 20W50  │ Mineral · Camiones
    · prod_22  │ Extravida 80W90  │ Transmisión

→ Usuario elige → bot muestra presentaciones (Caso A)

── Caso C: ID directo ──

Usuario: "37"  (o usuario tocó "37" en el catálogo)

→ Si el producto tiene una sola presentación activa: salta directo a pedir cantidad
→ Si tiene varias: muestra LIST de presentaciones (Caso A)
```

---

#### PASO 4 — Resumen y confirmación

```
Usuario tocó "📋 Ver resumen"

Bot (BUTTONS):
  body: 📋 PEDIDO — Dist. López S.R.L
        
        • 4× Elaion 20W50 Balde 20L
        • 2× Extravida 15W40 Bidón 4L
        
        Total: 6 unidades
        USD 201.00 = Gs 1.507.500
        
        (Tipo de cambio: 1 USD = Gs 7.500)
  buttons:
    · confirm_yes  │ ✅ Confirmar pedido
    · confirm_no   │ ❌ Cancelar

Session: { flowStep: 'pedido_confirmando', pedidoDraft: { cliente, carrito } }

Usuario toca "✅ Confirmar pedido"

Bot (texto):
  ✅ Pedido #247 registrado
  Cliente: Dist. López S.R.L
  6 unidades · Gs 1.507.500
  🕐 14:32
  
  👉 /mispedidos para ver tus pedidos del día
```

---

### FlowSteps del flujo rediseñado

| flowStep | Qué espera del usuario |
|----------|------------------------|
| `pedido_esperando_cliente` | Texto libre (nombre o RUC) |
| `pedido_seleccionar_cliente` | Interactive list reply (`__list:cli_*`) |
| `pedido_ruc_no_encontrado` | Interactive button reply (`__btn:alta_nuevo` / `__btn:cli_cf` / `__btn:buscar_otro`) |
| `pedido_alta_nombre` | Texto libre (razón social) |
| `pedido_alta_confirmando` | Interactive button reply (`__btn:alta_confirm` / `__btn:alta_cancel`) |
| `pedido_cliente_confirmado` | Interactive button reply (`__btn:confirm_yes` / `__btn:confirm_no`) |
| `pedido_esperando_item` | Texto libre (nombre, ID) o interactive button (`__btn:cart_done`) |
| `pedido_seleccionar_producto` | Interactive list reply (`__list:prod_*`) |
| `pedido_seleccionar_presentacion` | Interactive list reply (`__list:pres_*`) |
| `pedido_esperando_cantidad` | Texto libre (número) |
| `pedido_confirmando` | Interactive button reply (`__btn:confirm_yes` / `__btn:confirm_no`) |

---

### Reglas de precios

- Precio base en USD en `product_presentations.price_usd`
- Conversión: `get_exchange_rate('USD')` → PYG vigente
- Si el rate tiene >48h o no existe → mostrar solo USD, continuar igual
- Snapshot al momento del pedido: `unit_price_usd`, `unit_price_pyg`, `exchange_rate` en `pedido_items`
- Si la presentación no tiene precio → mostrar "Sin precio cargado", igual se puede registrar el pedido

---

### Archivos a implementar / reescribir

| Archivo | Acción |
|---------|--------|
| `lib/meta.js` | Agregar `sendInteractiveButtons()` y `sendInteractiveList()` |
| `lib/worker.js` | Detectar `result._type` y despachar al sender correcto |
| `lib/parser.js` | Agregar parsing de `__btn:*` y `__list:*` → routear por flowStep |
| `lib/pedidos.js` | Agregar `buscarPresentaciones()` y `getPrecioConTasa()` |
| `handlers/pedido.js` | Reescritura completa con el nuevo flujo |
| `commands.js` | Actualizar `FLOW_COMMANDS` con los nuevos flowSteps |
| n8n workflow | Mapear `button_reply` y `list_reply` a `__btn:*` / `__list:*` en bot_queue |

---

## /mispedidos

Sin cambios al flujo — ya funciona correctamente.  
Mejora pendiente: agregar emoji de estado más visual y monto total del pedido.

```
Bot (texto):
  📦 Tus últimos pedidos:
  
  #247 · 25/05 14:32
     Dist. López S.R.L · Asunción
     2 productos · 6 uds · Gs 1.507.500 · ⏳ pendiente
  
  #244 · 24/05 10:15
     Ferretería ABC · S.Lorenzo
     3 productos · 12 uds · Gs 3.200.000 · ✅ confirmado
```
