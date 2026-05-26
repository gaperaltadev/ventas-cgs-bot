# Estado de Implementación — Flujo Interactivo

> Actualizado: 2026-05-25  
> Próxima tarea: Paso 4 — reescritura de `handlers/pedido.js`

---

## Pasos completados

| Paso | Archivo | Estado | Notas |
|------|---------|--------|-------|
| 0 | `sql/09-presentations-prices.sql` | ✅ Aplicado en Supabase | Tablas nuevas verificadas |
| 1 | `lib/meta.js` | ✅ Completo | `sendInteractiveButtons`, `sendInteractiveList`, helper `postToMeta` |
| 1b | `lib/prices.js` | ✅ Completo | Caché 30 min, `getExchangeRate`, `formatPrice`, `toPyg` |
| 2 | `lib/worker.js` | ✅ Completo | `dispatch()` detecta `_type` y llama sender correcto; `FLOW_COMMANDS` actualizado |
| 3 | `lib/parser.js` | ✅ Completo | Detecta `__btn:*` y `__list:*`; `routeInteractive()` mapea IDs a commands |

---

## Pasos pendientes

| Paso | Archivo | Prioridad | Descripción |
|------|---------|-----------|-------------|
| 4 | `handlers/pedido.js` | 🔴 Alta | Reescritura completa con flujo interactivo. Ver flujo en `docs/comandos/ventas.md` |
| 4b | `lib/pedidos.js` | 🔴 Alta | Agregar `buscarPresentaciones(productId)` y ajustar `crearPedido` para nuevos campos |
| 5 | n8n workflow | 🟡 Media | Mapear `button_reply` y `list_reply` a `__btn:*` / `__list:*` antes de insertar en bot_queue |

---

## Cómo probar antes del Paso 4

Para verificar que la infraestructura (Pasos 1-3) funciona de punta a punta **antes** de reescribir el handler de pedido, podés agregar temporalmente en `commands.js` un comando de prueba:

```js
// En handleCommand, agregar caso temporal:
case '!test_btn':
  return {
    _type: 'buttons',
    body: '¿Funciona el botón?',
    buttons: [
      { id: 'confirm_yes', title: '✅ Sí funciona' },
      { id: 'confirm_no',  title: '❌ No funciona' }
    ],
    _session: { flowStep: 'pedido_confirmando', pedidoDraft: {} }
  };

case '!test_list':
  return {
    _type: 'list',
    body: 'Elegí una opción:',
    buttonText: 'Ver opciones',
    sections: [{
      title: 'Clientes de prueba',
      rows: [
        { id: 'cli_00000000-0', title: 'Consumidor Final', description: 'Sin RUC' },
        { id: 'cli_new',        title: 'Crear nuevo',      description: 'Alta de cliente' }
      ]
    }]
  };
```

Enviando `/test_btn` o `/test_list` por WhatsApp verificás que:
1. El worker detecta `_type` correctamente
2. Meta recibe y renderiza el mensaje interactivo
3. Al tocar un botón, n8n lo captura y lo encola con el prefijo `__btn:*`
4. El parser lo routea correctamente (visible en logs del worker)

**Eliminar los casos de prueba antes del Paso 4.**

---

## Decisiones de diseño registradas

| Decisión | Razón |
|----------|-------|
| `unit_price_pyg` no se almacena | Es dato derivado — se computa siempre desde `unit_price_usd × exchange_rate` |
| `total_monto` en pedidos en USD | Fuente de verdad única; PYG es siempre display |
| Caché de tasa en memoria (30 min) | Evita query a Supabase en cada mensaje; fallback a última tasa si falla |
| CONSUMIDOR FINAL como cliente con RUC `00000000-0` | Sin cambios al schema; filtrable en reportes; desacoplado |
| Prefijos `__btn:` y `__list:` en bot_queue | n8n transforma antes de encolar; parser no necesita saber el tipo Meta |

---

## Cambios requeridos en n8n (hacerlos antes de probar Paso 4)

Santiago (arquitecto) identificó **3 bugs y 1 mejora** en el workflow actual:

### Bug 1 — Path incorrecto en todos los campos

Primero verificar el path real activando una ejecución de prueba y mirando el panel de ejecución de n8n. Luego corregir:

| Campo | Path actual (bugueado) | Path correcto |
|-------|----------------------|---------------|
| `message_id` | `$json["body"]["entry"]["0"]...` | `$json["entry"][0]["changes"][0]["value"]["messages"][0]["id"]` |
| `phone_number` | idem | `$json["entry"][0]["changes"][0]["value"]["messages"][0]["from"]` |
| `customer_name` | idem | `$json["entry"][0]["changes"][0]["value"]["contacts"][0]["profile"]["name"]` |
| `message_body` | `JSON.stringify($json.messages[0])` ← **siempre NULL** | `{{ JSON.stringify($json["entry"][0]["changes"][0]["value"]["messages"][0]) }}` |

> **Nota:** si n8n sí envuelve en `body` (verificar en el panel), el path es `$json["body"]["entry"][0]...` con índice numérico `[0]`, no string `"0"`.

### Bug 2 — Status webhooks sin filtrar

Meta envía webhooks de `delivered`, `read`, `failed` que no tienen `messages[]`. Agregar nodo IF entre Webhook y Supabase:

```
Condición: {{ Array.isArray($json["entry"][0]["changes"][0]["value"]["messages"]) && $json["entry"][0]["changes"][0]["value"]["messages"].length > 0 }}
Rama true  → nodo Supabase (encolar)
Rama false → fin (Meta ya recibió 200)
```

### Decisión arquitectónica — message_body como JSON completo

`message_body` almacena `JSON.stringify(messages[0])` — el objeto completo de Meta.
El backend extrae `text` o `interactiveId` según `msg.type`. No se necesitan prefijos ni transformaciones en n8n.

## Dependencia crítica para el Paso 5 (n8n)

El workflow de n8n debe detectar si el mensaje entrante de Meta es de tipo `interactive` y transformarlo antes de insertar en `bot_queue`:

```
Meta payload tipo "button_reply":
  messages[0].interactive.button_reply.id = "confirm_yes"
  → bot_queue.message_body = "__btn:confirm_yes"

Meta payload tipo "list_reply":
  messages[0].interactive.list_reply.id = "cli_80012345-6"
  → bot_queue.message_body = "__list:cli_80012345-6"

Meta payload tipo "text" (sin cambios):
  messages[0].text.body = "hola"
  → bot_queue.message_body = "hola"
```

Hacer este cambio en n8n **antes** de probar el Paso 4 en producción.
