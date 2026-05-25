> ⚠️ **SUPERSEDIDO** — El Context Blueprint canónico está en
> `projects/ARCHITECTURE_AND_CONTEXT.md`. Este archivo conserva detalles
> de interfaz conversacional, parser y catálogo de errores que complementan el blueprint.

# Diseño Técnico — Bot WhatsApp CGS Paraguay
**Autor:** Santiago (@architect) — Tech Lead
**Fecha:** 2026-05-20 | **Actualizado:** 2026-05-25
**Token:** `[DESIGN-APPROVED] @architect — cgs-bot v3 — 2026-05-25`

---

## 0. Arquitectura de Integración (FASE 3 — Async Queue)

> **Cambio desde v2:** el flujo dejó de ser síncrono. Ya no existe un `POST /webhook`
> que n8n llama y espera respuesta. Ahora n8n solo inserta en una cola y muere.
> El worker de Express consume esa cola de forma independiente.

### Diagrama de flujo

```
WhatsApp / Meta
      │
      │  POST webhook (evento entrante)
      ▼
    n8n
      │  1. Responde 200 OK a Meta de inmediato (< 50ms)
      │  2. Inserta en bot_queue (Supabase)
      │  3. Flujo de n8n termina
      ▼
  Supabase
  bot_queue
      │  status='pendiente'
      │
      │  polling cada 2s (setInterval)
      ▼
  Express Worker (lib/worker.js)
      │  1. SELECT más antiguo WHERE status='pendiente'
      │  2. UPDATE status='procesando'  ← lock optimista
      │  3. parseIntent → handleCommand → sendToMeta
      │  4. UPDATE status='completado' | 'error'
      ▼
  Meta Cloud API
      │
      ▼
  WhatsApp del vendedor
```

### Por qué este diseño (ADR-06)

| Problema (v2 síncrono) | Solución (v3 async) |
|------------------------|---------------------|
| Meta cancela webhooks > 20s | n8n responde < 50ms siempre |
| Mensajes duplicados por retry de Meta | `message_id UNIQUE` en bot_queue — idempotente |
| n8n acoplado al tiempo de proceso de IA | n8n solo inserta; desacoplado del backend |
| Race condition si dos workers procesan el mismo mensaje | Lock optimista: UPDATE WHERE status='pendiente' |

### Tabla bot_queue

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK auto-generada |
| `message_id` | TEXT UNIQUE | wamid de Meta — garantiza idempotencia |
| `phone_number` | TEXT | Número del vendedor (solo dígitos) |
| `message_body` | TEXT | Texto crudo del mensaje |
| `status` | TEXT | `pendiente` → `procesando` → `completado` \| `error` |
| `error_message` | TEXT | Detalle del error (primeros 500 chars) |
| `created_at` | TIMESTAMPTZ | Timestamp de inserción (orden FIFO) |
| `updated_at` | TIMESTAMPTZ | Última actualización de status |

### Módulos del backend

| Módulo | Responsabilidad |
|--------|----------------|
| `index.js` | Arranque: Express (healthchecks) + `startWorker()` |
| `lib/worker.js` | Loop de polling + pipeline de procesamiento |
| `lib/meta.js` | Cliente HTTP para Meta Cloud API (envío de respuestas) |
| `lib/session.js` | Estado conversacional en memoria + cache de vendedores |
| `lib/parser.js` | Pipeline de detección de intención (11 pasos) |
| `commands.js` | Router de comandos → handlers |
| `handlers/` | Lógica de negocio por dominio (buscar, pedido, guia...) |

---

## 1. Interfaz Conversacional

### Disparadores por función

| Función | Disparadores |
|---------|-------------|
| Catálogo | `!c`, `!catalogo`, `catalogo`, `lista`, `productos`, `que tenes`, `qué tenés`, `ver todo` |
| Ficha por ID | `!p [id]`, `[id]` solo (sin sesión activa), `ver [id]`, `producto [id]`, `ficha [id]` |
| Búsqueda texto | `!p [texto]`, `buscar [texto]`, `busco [texto]`, cualquier texto libre (fallback) |
| Categoría | `!cat`, `auto`, `autos`, `moto`, `motos`, `camion`, `camiones`, `otros`, `fluidos`, `para auto/moto/camion` |
| Venta | `!v`, `vender`, `venta`, `vendi`, `anotar` |
| Resumen | `!ventas`, `ventas`, `ventas hoy`, `ventas semana`, `resumen`, `cuanto vendimos`, `que vendimos hoy` |
| Ranking | `!top`, `top`, `ranking`, `mas vendidos`, `más vendidos`, `top 5` |
| Destacados | `!d`, `destacados`, `populares`, `recomendados` |
| Ayuda | `!a`, `!ayuda`, `ayuda`, `help`, `hola`, `inicio`, `que puedo hacer`, `comandos` |

### Formatos de respuesta

**Catálogo:**
```
📋 *Catálogo CGS Paraguay*

*ELAION — Autos*
  [1] ELAION F10 5W-30
  [2] ELAION F10 10W-40
  ...

👉 Escribí el *número* para ver la ficha  o  *vender [ID]* para registrar
```

**Ficha:**
```
🔧 *[3] ELAION F30 5W-40*
Tecnología:     Sintético
Viscosidad:     5W-40
Specs:          API SP • ACEA C3
Presentaciones: 1L · 4L · 20L · 208L
Aplicaciones:   Automóviles, SUV, Camionetas, Turbos
🏷️  PREMIUM
```

**Lista ambigua:**
```
Encontré varios para "5w30":

  1. [1] ELAION F10 5W-30 — Semi-Sintético
  2. [3] ELAION F30 5W-30 — Sintético

Escribí *1* o *2* para ver la ficha completa.
```

**Venta confirmada:**
```
✅ *Venta registrada*
[3] ELAION F30 5W-40 × 2 unidades
🕐 10:47
```

**Multi-venta:**
```
✅ [3] ELAION F30 5W-40 ×2
✅ [7] EXTRAVIDA DX 15W-40 ×1
❌ [99] — producto no encontrado

*2 de 3 ventas registradas* (1 con error)
👉 Corregí el [99] con un ID válido del catálogo.
```

**Ayuda rediseñada:**
```
🤖 *CGS Bot — Qué puedo hacer*

*Ver productos*
  catalogo          → Lista completa con IDs
  auto / moto / camion  → Por categoría
  [número de ID]    → Ficha del producto
  5w30 / elaion     → Buscar por texto

*Registrar ventas*
  vender 3          → 1 unidad del producto [3]
  vender 3 2        → 2 unidades del producto [3]
  vender 3 2, 7 1   → Varios productos a la vez

*Reportes*
  ventas hoy        → Lo que se vendió hoy
  ranking           → Top 5 de la semana

💡 Cuando aparezca una lista, escribí *1*, *2*... para elegir.
```

---

## 2. Arquitectura de Sesión

```javascript
session = {
  lastResults:  Product[] | null,         // hasta 5 productos
  lastAction:   'ficha' | 'venta' | null, // qué hacer al seleccionar
  pendingVenta: { qty: number } | null,   // cantidad pendiente de confirmar
  createdAt:    number,                   // Date.now()
  updatedAt:    number                    // Date.now()
}
```

### Ciclo de vida

| Evento | Acción |
|--------|--------|
| Comando sin lista | `sessions.delete(jid)` |
| Resultado múltiple | `sessions.set(jid, { lastResults, lastAction, ... })` |
| Selección numérica exitosa | `sessions.delete(jid)` |
| Selección fuera de rango | sesión se mantiene |
| Nuevo texto libre | descartar sesión anterior + procesar |
| TTL 15 min sin actividad | `setInterval` cleanup cada 5 min |

---

## 3. Parser de Mensajes — Pipeline de 11 pasos

El handler evalúa cada mensaje en este orden:

```
1.  SELECCIÓN NUMÉRICA  → /^[1-5]$/ && session.lastResults?.length > 0
2.  COMANDO !           → text.startsWith('!')
3.  KEYWORD CATÁLOGO    → /^(catalogo|lista|productos|que tenes|qué tenés|ver todo)$/i
4.  KEYWORD AYUDA       → /^(ayuda|help|hola|inicio|que puedo hacer|comandos)$/i
5.  KEYWORD CATEGORÍA   → /^(auto|autos|moto|motos|camion|camiones|otros|para .+)$/i
6.  KEYWORD VENTA       → /^(vender|venta|vendi|anotar)\s+/i
7.  KEYWORD RESUMEN     → /^(ventas|resumen|cuanto vendimos|que vendimos)/i
8.  KEYWORD RANKING     → /^(top|ranking|mas vendidos|más vendidos)/i
9.  KEYWORD DESTACADOS  → /^(destacados|populares|recomendados)$/i
10. SOLO NÚMERO         → /^\d+$/ && !session.lastResults
11. TEXTO LIBRE (fallback) → cmdProducto con el texto como término de búsqueda
```

**Regla clave:** el fallback NUNCA responde "no entendí" — siempre intenta buscar. Si no encuentra, el error ofrece alternativas.

---

## 4. Contratos de Funciones

### handleCommand
```
handleCommand(command, args, supabase, session) → Promise<CommandResult | null>
```

### cmdProducto
```
cmdProducto(args, supabase) → Promise<CommandResult>
  args=[]             → ERR_SIN_ARGS_PRODUCTO
  args=['3']          → ficha directa por ID, o ERR_ID_NO_EXISTE
  args=['5w30']       → 1 resultado → ficha / múltiples → lista / 0 → ERR_SIN_RESULTADOS
  >5 resultados       → ERR_DEMASIADOS_RESULTADOS
```

### cmdVenta
```
cmdVenta(args, supabase, session) → Promise<CommandResult>
  args=[]             → ERR_SIN_ARGS_VENTA
  args=['3']          → registrar 1 unidad del [3]
  args=['3','2']      → registrar 2 unidades del [3]
  args con comas      → cmdMultiVenta(raw, supabase)
  texto ambiguo       → lista con lastAction='venta', pendingVenta={qty}
```

### cmdMultiVenta (nueva)
```
cmdMultiVenta(rawString, supabase) → Promise<string>
  Split por ',' → procesar cada item independientemente
  Error en uno no cancela los demás
  Retorna reporte por item + resumen
```

### cmdSelect
```
cmdSelect(args, session, supabase) → Promise<CommandResult>
  lastAction='ficha'  → fichaProducto(lastResults[idx])
  lastAction='venta'  → registrarVenta(lastResults[idx], pendingVenta.qty)
  idx fuera de rango  → ERR_SELECCION_FUERA_RANGO(max)
```

### registrarVenta
```
registrarVenta(product, qty, supabase) → Promise<string>
  Confirmación incluye: nombre + cantidad + hora HH:MM
```

---

## 5. Catálogo de Errores

| Código | Mensaje |
|--------|---------|
| `ERR_SIN_ARGS_PRODUCTO` | `Indicá qué producto querés ver.\n👉 Escribí el ID, o un nombre: *elaion 5w30* · *para moto*` |
| `ERR_SIN_ARGS_VENTA` | `Indicá qué producto vendiste.\n👉 Ej: *vender 3* · *vender 3 2* (2 unidades)` |
| `ERR_ID_NO_EXISTE(id)` | `No existe el producto [${id}].\n👉 Escribí *catalogo* para ver los IDs disponibles.` |
| `ERR_CANTIDAD_INVALIDA` | `La cantidad debe ser un número mayor a 0.\n👉 Ej: *vender 3 2* (producto 3, 2 unidades)` |
| `ERR_CATEGORIA_INVALIDA` | `No reconozco esa categoría.\n👉 Opciones: *auto · moto · camion · otros*` |
| `ERR_SIN_RESULTADOS(term)` | `No encontré "${term}".\n👉 Probá *catalogo* para ver todo, o *auto* / *moto* / *camion* por tipo.` |
| `ERR_DEMASIADOS_RESULTADOS(n)` | `Encontré ${n} resultados.\n👉 Afiná la búsqueda. Ej: *5w30 auto* o *15w40 camion*` |
| `ERR_SELECCION_FUERA_RANGO(max)` | `Ese número no está en la lista (hay ${max} opciones).\n👉 Escribí 1–${max}, o hacé una nueva búsqueda.` |
| `ERR_DB_*` | `Error al [acción]. Intentá de nuevo en un momento.` |

---

## 6. Delta vs. Código Actual

| Área | Cambio |
|------|--------|
| Parser en index.js | Pipeline de 11 pasos con texto natural |
| Session | Agregar campo `lastAction` |
| Session TTL | `setInterval` cleanup cada 5 min, TTL=15 min |
| `cmdMultiVenta` | Extraer de `cmdVenta` a función separada |
| `cmdSelect` | Usar `lastAction` en vez de inferir por `pendingVenta` |
| `cmdAyuda` | Rediseñar para mostrar lenguaje natural |
| Confirmación de venta | Agregar hora HH:MM |
| Errores | Estandarizar con catálogo de Sección 5 |
| `cmdVentas` | Aceptar args vacíos (default = hoy) |

---

## ADRs

- **ADR-01:** Texto libre → fallback a búsqueda (nunca "no entendí")
- **ADR-02:** Multi-venta no tiene flujo interactivo — ambigüedad falla con error claro
- **ADR-03:** TTL de sesión con `setInterval`, no con campo `expiry`
- **ADR-04:** `lastAction` explícito en sesión en vez de inferir por `pendingVenta`
- **ADR-05:** Sin cambios en schema de Supabase (supersedido por ADR-06)
- **ADR-06:** Arquitectura async-queue — n8n inserta en `bot_queue`, Express consume vía polling.
  Motivación: Meta cancela webhooks > 20s; mensajes duplicados por reintentos.
  Consecuencia: se eliminó `POST /webhook`; nuevo schema `bot_queue` con `message_id UNIQUE`
  para idempotencia. Lock optimista con `UPDATE WHERE status='pendiente'` para seguridad
  ante workers paralelos futuros.
