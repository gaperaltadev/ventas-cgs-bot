# CGS Bot v3 — Contrato Conversacional Completo

**Documento:** DESIGN-001  
**Versión:** 3.1  
**Fecha:** 2026-05-20  
**Autor:** @architect (Santiago)  
**Estado:** APROBADO

---

## Índice

1. [Principios de diseño](#1-principios-de-diseño)
2. [Estado de sesión](#2-estado-de-sesión)
3. [Contrato por función](#3-contrato-por-función)
   - 3.1 Ver catálogo completo
   - 3.2 Ver ficha de producto
   - 3.3 Filtrar por categoría
   - 3.4 Ver productos destacados
   - 3.5 Registrar venta (simple, búsqueda, ambigüedad, multi-venta)
   - 3.6 Ver resumen de ventas
   - 3.7 Ver ranking
   - 3.8 Ayuda / descubrir funciones
4. [Mecanismo de selección numérica](#4-mecanismo-de-selección-numérica)
5. [Flujo guiado de venta — paso a paso](#5-flujo-guiado-de-venta--paso-a-paso)
6. [Tabla de funciones](#6-tabla-de-funciones)
7. [ADRs](#7-adrs)
8. [Acceptance Criteria para QA](#8-acceptance-criteria-para-qa)

---

## 1. Principios de diseño

| # | Principio | Implicación práctica |
|---|-----------|----------------------|
| P1 | **Flujos cortos** | Máximo 3 preguntas en cualquier flujo guiado |
| P2 | **Nunca rechazar sin acción** | Toda respuesta de error incluye un `👉` con qué hacer |
| P3 | **Escape siempre disponible** | Cualquier mensaje nuevo cancela el flujo activo y procesa el nuevo intent |
| P4 | **Formato consistente** | Encabezado emoji + negrita, cuerpo, footer con `👉` |
| P5 | **Atajo para usuarios avanzados** | Parámetros directos siguen funcionando junto a flujos guiados |
| P6 | **Pantalla de celular** | Máximo ~20 líneas por mensaje; listas truncadas a 5 ítems |

---

## 2. Estado de sesión

### 2.1 Estructura actual vs. extendida

```js
// ACTUAL (suficiente para flujos básicos)
{
  lastResults: Product[] | null,   // últimos resultados de búsqueda (max 5)
  lastAction: string | null,       // 'ficha' | 'venta'
  pendingVenta: { qty: number } | null,
  createdAt: number,
  updatedAt: number
}

// EXTENDIDO — campos nuevos requeridos para flujos guiados
{
  // --- existentes, se mantienen ---
  lastResults: Product[] | null,
  lastAction: string | null,       // AMPLIAR: + 'venta_producto' | 'venta_cantidad'
  pendingVenta: {
    qty: number | null,            // CAMBIO: ahora puede ser null (aún no ingresado)
    productId: number | null,      // NUEVO: producto ya confirmado, esperando qty
    searchTerm: string | null      // NUEVO: término de búsqueda original (para mensajes)
  } | null,
  createdAt: number,
  updatedAt: number,

  // --- nuevos ---
  flowStep: string | null,         // NUEVO: paso actual del flujo guiado
                                   // null | 'venta_esperando_producto'
                                   //       | 'venta_esperando_seleccion'
                                   //       | 'venta_esperando_cantidad'
}
```

### 2.2 Ciclo de vida de campos

| Campo | Se crea | Se actualiza | Se limpia |
|-------|---------|--------------|-----------|
| `lastResults` | Cuando el bot retorna una lista seleccionable | Cada nueva búsqueda que produce lista | Cuando se selecciona un ítem O nuevo comando |
| `lastAction` | Con cada comando que produce lista | — | Junto con `lastResults` |
| `pendingVenta` | Inicio de flujo de venta con ambigüedad | En cada paso (qty, productId) | Al registrar venta o cancelar flujo |
| `flowStep` | Al iniciar un flujo guiado de venta | Al avanzar cada paso | Al completar o cancelar flujo |
| `createdAt` | Primera vez que el JID interactúa | — | Nunca (persiste hasta TTL) |
| `updatedAt` | — | Cada interacción | — |

### 2.3 Regla de escape (cancelación de flujo)

```
SI incoming_command != '__select__' Y flowStep != null:
  → Limpiar toda la sesión (sessions.delete(jid))
  → Procesar el nuevo mensaje desde cero
  → NO avisar al usuario que se canceló (sería ruido)
```

**Excepción:** Si el usuario escribe un número mientras `flowStep = 'venta_esperando_cantidad'`, ese número es la cantidad (no una selección de lista).

---

## 3. Contrato por función

### 3.1 Ver catálogo completo

**Activadores reconocidos:**
```
catalogo · lista · productos · que tenes · que tienen · ver todo · ver catalogo
```

**Flujo:** Stateless (sin estado de sesión). Respuesta única.

**Mensaje de respuesta:**
```
📋 *Catálogo CGS Paraguay*

*ELAION — Autos*
  [1] ELAION F10 5W-30
  [2] ELAION F30 5W-30
  [3] ...

*EXTRAVIDA — Camiones*
  [10] EXTRAVIDA 15W-40
  ...

*RÖD — Motos*
  [15] RÖD 20W-50
  ...

*Otros*
  [18] ...

👉 Escribí el *número* para ver la ficha, o *vender [ID]* para registrar
```

**Restricciones de formato:**
- Máximo 19 productos (catálogo actual). Si supera 25, paginar por categoría.
- No se guarda estado en sesión (el catálogo no activa selección numérica).
- Los IDs entre `[ ]` son los activadores directos para ficha y venta.

**Casos de error:**

| Condición | Mensaje |
|-----------|---------|
| Error de DB | `Error al obtener el catálogo. Intentá de nuevo en un momento.` |
| Catálogo vacío | `El catálogo está vacío. Contactá al administrador.` |

---

### 3.2 Ver ficha de producto

**Activadores reconocidos:**
```
[número]                → Busca por ID directamente
elaion · 5w30 · rod     → Búsqueda por texto libre
elaion 5w30             → Búsqueda multi-término
```

**Flujos:**

**A — ID directo (1 resultado exacto):**
```
Usuario: 3
Bot: 🔧 *[3] ELAION F10 5W-30*
     Tecnología:     Semi-Sintético
     Viscosidad:     5W-30
     Specs:          API SN/CF
     Presentaciones: 1L · 4L · 20L
     Aplicaciones:   Motores a nafta y diesel modernos
     🏷️ Más vendido
```

**B — Texto con 1 resultado:**
```
Usuario: elaion f10
Bot: [ficha directa, igual que caso A]
```

**C — Texto con 2-5 resultados (lista seleccionable):**
```
Usuario: elaion 5w30
Bot: Encontré varios para "*elaion 5w30*":

  1. [3] ELAION F10 5W-30 — Semi-Sintético
  2. [4] ELAION F30 5W-30 — Sintético

👉 Escribí *1* o *2* para ver la ficha completa.
```
→ `lastResults = [p3, p4]`, `lastAction = 'ficha'`

**D — Más de 5 resultados:**
```
Usuario: aceite
Bot: Encontré 12 resultados. Afiná la búsqueda.
👉 Ej: *5w30 auto* o *15w40 camion*
```
→ No se guarda estado.

**Mensaje de ficha completa (formato canónico):**
```
🔧 *[ID] NOMBRE PRODUCTO*
Tecnología:     <valor>
Viscosidad:     <valor o N/A>
Specs:          <valor>
Presentaciones: <val1> · <val2> · ...
Aplicaciones:   <val1>, <val2>, ...
🏷️ <badge>            ← solo si tiene badge
```

**Casos de error:**

| Condición | Mensaje |
|-----------|---------|
| ID no existe | `No existe el producto [N].\n👉 Escribí *catalogo* para ver los IDs disponibles.` |
| Sin resultados | `No encontré "*término*".\n👉 Probá *catalogo* para ver todo, o *auto* / *moto* / *camion* por tipo.` |
| Error de DB | `Error al buscar productos. Intentá de nuevo en un momento.` |

---

### 3.3 Filtrar por categoría

**Activadores reconocidos:**
```
auto · autos · elaion          → categoría ELAION (autos)
moto · motos · rod             → categoría RÖD (motos)
camion · camiones · extravida · pesado  → categoría EXTRAVIDA (camiones)
otros · otro · fluido · fluidos → categoría Otros
```

**Flujo:** Stateless. Respuesta única.

**Mensaje de respuesta:**
```
📦 *ELAION — Autos*

[1] ELAION F10 5W-30 — 5W-30 🏷️ Más vendido
[2] ELAION F30 5W-30 — Sintético
[3] ...

👉 Escribí el *número* del ID para ver la ficha completa
```

**Nota de implementación:** El footer dice "número del ID", no "1, 2, 3...". Esto es intencional: la categoría NO activa selección numérica (`lastResults` no se guarda). El usuario debe escribir el ID entre `[ ]`.

**Casos de error:**

| Condición | Mensaje |
|-----------|---------|
| Categoría no reconocida | `No reconozco esa categoría.\n👉 Opciones: *auto · moto · camion · otros*` |
| Sin productos en categoría | `No hay productos en esta categoría.` |
| Error de DB | `Error al obtener la categoría. Intentá de nuevo en un momento.` |

---

### 3.4 Ver productos destacados

**Activadores reconocidos:**
```
destacados · populares · recomendados
```

**Flujo:** Stateless. Respuesta única.

**Mensaje de respuesta:**
```
⭐ *Productos Destacados*

[1] ELAION F10 5W-30 — Más vendido
[3] EXTRAVIDA 15W-40 — Recomendado
[7] RÖD 20W-50

👉 Escribí el ID para ver la ficha completa
```

**Nota de implementación:** Igual que categoría — no activa selección numérica. El usuario usa el ID directo.

**Casos de error:**

| Condición | Mensaje |
|-----------|---------|
| Sin destacados configurados | `No hay productos destacados configurados.` |
| Error de DB | `Error al obtener destacados. Intentá de nuevo en un momento.` |

---

### 3.5 Registrar venta

Esta es la función más compleja. Soporta 5 sub-flujos.

#### Sub-flujo A — Atajo directo con ID y cantidad

```
Usuario: vender 3 2
Bot: ✅ *Venta registrada*
     [3] ELAION F10 5W-30 × 2 unidades
     🕐 14:32
```

Condición: `args[0]` es número entero → ID de producto. `args[1]` es número entero → cantidad. Sin ambigüedad, sin flujo guiado.

#### Sub-flujo B — Atajo directo con ID, cantidad = 1 implícita

```
Usuario: vender 3
Bot: ✅ *Venta registrada*
     [3] ELAION F10 5W-30 × 1 unidad
     🕐 14:32
```

#### Sub-flujo C — Búsqueda con 1 resultado

```
Usuario: vender elaion f10
Bot: ✅ *Venta registrada*
     [3] ELAION F10 5W-30 × 1 unidad
     🕐 14:32
```

#### Sub-flujo D — Búsqueda con ambigüedad (2-5 resultados)

```
Usuario: vender elaion 5w30
Bot: Varios productos coinciden para "*elaion 5w30*":

  1. [3] ELAION F10 5W-30 — Semi-Sintético
  2. [4] ELAION F30 5W-30 — Sintético

¿Cuántas unidades? Escribí *1* o *2*, o *N cantidad* (ej: *1 3* para F10 × 3 uds).
```

→ `lastResults = [p3, p4]`, `lastAction = 'venta'`, `pendingVenta = { qty: 1, productId: null, searchTerm: 'elaion 5w30' }`, `flowStep = 'venta_esperando_seleccion'`

**Selección simple (cantidad ya conocida = 1):**
```
Usuario: 1
Bot: ✅ *Venta registrada*
     [3] ELAION F10 5W-30 × 1 unidad
     🕐 14:32
```

**Selección con cantidad explícita (`N cantidad`):**
```
Usuario: 1 3
Bot: ✅ *Venta registrada*
     [3] ELAION F10 5W-30 × 3 unidades
     🕐 14:32
```

**Nota de implementación — interpretación de "1 3":**
- Cuando `flowStep = 'venta_esperando_seleccion'`, un mensaje tipo `"N M"` donde ambos son números se interpreta como: selección N, cantidad M.
- Esta lógica ocurre en `cmdSelect`, no en `parseIntent`.

#### Sub-flujo E — Flujo guiado completo (sin parámetros)

```
Usuario: vender
Bot: ¿Qué producto vendiste? Escribí el nombre o ID.
```

→ `flowStep = 'venta_esperando_producto'`, `lastAction = 'venta'`, `pendingVenta = { qty: null, productId: null, searchTerm: null }`

```
Usuario: elaion 5w30
Bot: Encontré 2 productos:

  1. [3] ELAION F10 5W-30 — Semi-Sintético
  2. [4] ELAION F30 5W-30 — Sintético

👉 ¿Cuál es? Escribí *1* o *2*.
```

→ `lastResults = [p3, p4]`, `flowStep = 'venta_esperando_seleccion'`, `pendingVenta = { qty: null, productId: null, searchTerm: 'elaion 5w30' }`

```
Usuario: 1
Bot: ¿Cuántas unidades?
     (Solo el número, ej: *3*)
```

→ `flowStep = 'venta_esperando_cantidad'`, `pendingVenta = { qty: null, productId: 3, searchTerm: 'elaion 5w30' }`

```
Usuario: 3
Bot: ✅ *Venta registrada*
     [3] ELAION F10 5W-30 × 3 unidades
     🕐 14:32
```

→ Sesión limpiada.

**Caso especial: búsqueda en flujo guiado con 1 resultado:**
```
Usuario: vender
Bot: ¿Qué producto vendiste? Escribí el nombre o ID.

Usuario: elaion f10
Bot: ¿Cuántas unidades?
     (Solo el número, ej: *3*)
```
→ Salta la selección, va directo a cantidad.

**Caso especial: ID directo en flujo guiado:**
```
Usuario: vender
Bot: ¿Qué producto vendiste? Escribí el nombre o ID.

Usuario: 3
Bot: ¿Cuántas unidades?
     (Solo el número, ej: *3*)
```

#### Sub-flujo F — Multi-venta (separado por comas)

```
Usuario: vender 3 2, 7 1, 10 3
Bot: ✅ [3] ELAION F10 5W-30 ×2
     ✅ [7] RÖD 20W-50 ×1
     ✅ [10] EXTRAVIDA 15W-40 ×3

*3 ventas registradas*
```

**Con errores parciales:**
```
Bot: ✅ [3] ELAION F10 5W-30 ×2
     ❌ [99] — producto no encontrado
     ✅ [10] EXTRAVIDA 15W-40 ×3

*2 de 3 registradas* (1 con error)
```

**Comportamiento para ítems sin cantidad (DESIGN-BUG-002):**

Un ítem sin cantidad explícita se registra como × 1, consistente con Sub-flujo B.

```
Usuario: vender 3 2, 7, 10 3
                  ↑ sin cantidad → cantidad = 1 implícita

Bot: ✅ [3] ELAION F10 5W-30 ×2
     ✅ [7] RÖD 20W-50 ×1
     ✅ [10] EXTRAVIDA 15W-40 ×3

*3 ventas registradas*
```

**Restricciones del sub-flujo F:**
- Solo acepta IDs numéricos (no nombres). Es el sub-flujo "avanzado".
- No tiene flujo guiado. Si hay error en un ítem, continúa con los demás.
- No activa selección numérica en sesión.
- Ítems sin cantidad → cantidad = 1 implícita (igual que Sub-flujo B).

**Tabla de mensajes de error — función venta:**

| Condición | Mensaje |
|-----------|---------|
| `vender` sin args y sin flujo guiado habilitado | `¿Qué producto vendiste? Escribí el nombre o ID.` (inicia flujo guiado) |
| ID no existe | `No existe el producto [N].\n👉 Escribí *catalogo* para ver los IDs disponibles.` |
| Sin resultados para búsqueda | `No encontré "*término*".\n👉 Probá con el ID directo o escribí *catalogo*.` |
| Más de 5 resultados | `Encontré N resultados. Afiná la búsqueda.\n👉 Ej: *5w30 auto* o *15w40 camion*` |
| Cantidad inválida (0 o texto) | `La cantidad debe ser un número mayor a 0.\n👉 Ej: *3*` |
| Error de DB al registrar | `Error al registrar la venta. Intentá de nuevo en un momento.` |
| Número fuera de rango en selección | `Ese número no está en la lista (hay N opciones).\n👉 Escribí 1–N, o hacé una nueva búsqueda.` |

---

### 3.6 Ver resumen de ventas

**Activadores reconocidos:**
```
ventas · ventas hoy · resumen · cuanto vendimos · que vendimos · que vendimos hoy
  → período: hoy

ventas semana
  → período: semana (últimos 7 días)
```

**Flujo:** Stateless. Respuesta única.

**Mensaje de respuesta:**
```
📊 *Ventas de hoy*

ELAION — Autos: *12 uds*
EXTRAVIDA — Camiones: *5 uds*
*Total: 17 uds* (6 operaciones)

*Detalle:*
  14:32 · ELAION F10 5W-30 ×3
  13:15 · EXTRAVIDA 15W-40 ×2
  12:00 · RÖD 20W-50 ×1
  ...y 3 más
```

**Restricciones de formato:**
- Máximo 8 líneas en el detalle. Si hay más: `...y N más`.
- Resumen de categorías ordenado de mayor a menor.
- Hora en formato HH:MM (zona horaria Paraguay = UTC-4).

**Casos de error:**

| Condición | Mensaje |
|-----------|---------|
| Sin ventas en período | `Sin ventas registradas de hoy.\n👉 Registrá la primera con *vender [ID]*.` |
| Período no reconocido | `Período no reconocido.\n👉 Usá *ventas hoy* o *ventas semana*.` |
| Error de DB | `Error al obtener ventas. Intentá de nuevo en un momento.` |

---

### 3.7 Ver ranking

**Activadores reconocidos:**
```
top · ranking · mas vendidos · top 5 · mejores
```

**Flujo:** Stateless. Respuesta única.

**Mensaje de respuesta:**
```
🏆 *Top productos — últimos 7 días*

1. ELAION F10 5W-30 — *28 uds*
2. EXTRAVIDA 15W-40 — *17 uds*
3. RÖD 20W-50 — *12 uds*
4. ELAION F30 5W-30 — *9 uds*
5. EXTRAVIDA 20W-50 — *6 uds*
```

**Casos de error:**

| Condición | Mensaje |
|-----------|---------|
| Sin ventas en 7 días | `Sin ventas en los últimos 7 días.\n👉 Registrá la primera con *vender [ID]*.` |
| Error de DB | `Error al obtener el ranking. Intentá de nuevo en un momento.` |

---

### 3.8 Ayuda / descubrir funciones

**Activadores reconocidos:**
```
ayuda · help · hola · inicio · que puedo hacer · comandos · menu
```

**Flujo:** Stateless. Respuesta única.

**Mensaje de respuesta:**
```
🤖 *CGS Bot — Qué puedo hacer*

*Ver productos*
  catalogo              → Lista completa con IDs
  auto / moto / camion  → Por categoría
  [número de ID]        → Ficha del producto
  5w30 / elaion         → Buscar por texto

*Registrar ventas*
  vender                → Te guío paso a paso
  vender 3              → 1 unidad del producto [3]
  vender 3 2            → 2 unidades del producto [3]
  vender 3 2, 7 1       → Varios productos a la vez

*Reportes*
  ventas hoy            → Lo que se vendió hoy
  ventas semana         → Últimos 7 días
  ranking               → Top 5 de la semana

💡 Cuando aparezca una lista, escribí *1*, *2*... para elegir.
```

**Nota de cambio vs. v2:** Se agregó `vender` (sin parámetros) como primera opción del flujo guiado. Es el activador recomendado para usuarios nuevos.

---

## 4. Mecanismo de selección numérica

### Cuándo un número es selección vs. búsqueda

El parser evalúa en este orden:

```
1. ¿El mensaje es /^[1-5]$/ Y session.lastResults tiene elementos
   Y flowStep != 'venta_esperando_cantidad'?
   → __select__ con idx = parseInt(t) - 1

2. ¿flowStep = 'venta_esperando_cantidad' Y /^\d+$/?
   → __venta_cantidad__ (tiene prioridad sobre selección y búsqueda por ID)

3. ¿El mensaje es /^[1-5]\s+\d+$/ Y flowStep = 'venta_esperando_seleccion'?
   → __select__ con idx y qty embebidos (ej: "1 3" = selección 1, cantidad 3)

4. ¿El mensaje es /^\d+$/ (cualquier número, sin sesión de flujo activa)?
   → !p (buscar por ID de producto)
```

> **Nota crítica (DESIGN-BUG-001):** La regla 2 (`venta_esperando_cantidad`) debe evaluarse ANTES de la regla 3 (selección `N cantidad`) y ANTES de la regla 4 (búsqueda por ID). Sin esta precedencia, un "1" durante `venta_esperando_cantidad` se interpretaría como selección de lista, registrando el primer producto de `lastResults` en lugar de la cantidad 1.

### Condición de activación de selección

`session.lastResults` se puebla ÚNICAMENTE cuando:
- `cmdProducto` retorna 2-5 resultados (`lastAction = 'ficha'`)
- `cmdVenta` retorna 2-5 resultados (`lastAction = 'venta'`)
- Flujo guiado de venta retorna 2-5 resultados (`lastAction = 'venta'`, `flowStep = 'venta_esperando_seleccion'`)

`session.lastResults` NO se puebla cuando:
- `cmdCatalogo` responde (el catálogo usa IDs, no posiciones 1-N)
- `cmdCategoria` responde (mismo motivo)
- `cmdDestacados` responde (mismo motivo)

### Comportamiento de `cmdSelect` extendido

```js
// Lógica extendida para Sub-flujo D ("1 3" = selección + cantidad)
async function cmdSelect(args, session, supabase) {
  const idx     = parseInt(args[0]);        // índice 0-based
  const qtyArg  = parseInt(args[1]);        // puede ser NaN
  const results = session.lastResults || [];

  if (!results.length)   return ERR.SIN_LISTA_ACTIVA;
  if (!results[idx])     return ERR.FUERA_DE_RANGO(results.length);

  const product = results[idx];

  if (session.lastAction === 'venta') {
    // qty: args[1] si es válido, sino pendingVenta.qty, sino 1
    const qty = (!isNaN(qtyArg) && qtyArg > 0)
      ? qtyArg
      : (session.pendingVenta?.qty || 1);
    return registrarVenta(product, qty, supabase);
  }

  // Flujo guiado paso 2: selección de producto, esperar cantidad
  if (session.flowStep === 'venta_esperando_seleccion') {
    // Si hay qty embebida, registrar directamente
    if (!isNaN(qtyArg) && qtyArg > 0) {
      return registrarVenta(product, qtyArg, supabase);
    }
    // Si no hay qty, preguntar
    return {
      text: `¿Cuántas unidades?\n(Solo el número, ej: *3*)`,
      _session: {
        ...session,
        flowStep: 'venta_esperando_cantidad',
        pendingVenta: { ...session.pendingVenta, productId: product.id },
        lastResults: null  // limpiar lista
      }
    };
  }

  return fichaProducto(product);
}
```

---

## 5. Flujo guiado de venta — paso a paso

### Diagrama de estados

```
[INICIO]
    │
    ├─ "vender" (sin args)
    │       ↓
    │  flowStep: venta_esperando_producto
    │  Bot: "¿Qué producto vendiste? Escribí el nombre o ID."
    │       ↓
    │  Usuario escribe texto/ID
    │       ↓
    │  ┌──────────────────────────────┐
    │  │   Búsqueda en catálogo       │
    │  └──────────────────────────────┘
    │       ↓
    │  ┌─ 0 resultados ─────────────────────────────────────────────────────────┐
    │  │  Bot: "No encontré X.\n👉 Probá con el ID directo o escribí catalogo." │
    │  │  flowStep: venta_esperando_producto (permanece)                         │
    │  └────────────────────────────────────────────────────────────────────────┘
    │       ↓
    │  ┌─ 1 resultado ──────────────────────────────────────────────────────────┐
    │  │  flowStep: venta_esperando_cantidad                                     │
    │  │  Bot: "¿Cuántas unidades?\n(Solo el número, ej: *3*)"                  │
    │  └────────────────────────────────────────────────────────────────────────┘
    │       ↓
    │  ┌─ 2-5 resultados ───────────────────────────────────────────────────────┐
    │  │  flowStep: venta_esperando_seleccion                                    │
    │  │  Bot: lista numerada + "👉 ¿Cuál es? Escribí 1 o 2."                   │
    │  └────────────────────────────────────────────────────────────────────────┘
    │       ↓
    │  ┌─ >5 resultados ────────────────────────────────────────────────────────┐
    │  │  Bot: "Encontré N resultados. Afiná la búsqueda."                       │
    │  │  flowStep: venta_esperando_producto (permanece)                         │
    │  └────────────────────────────────────────────────────────────────────────┘
    │
    │  [desde venta_esperando_seleccion]
    │       ↓
    │  Usuario escribe "1", "2"... (o "1 3" con cantidad embebida)
    │       ↓
    │  ┌─ Con cantidad embebida ("1 3") ────────────────────────────────────────┐
    │  │  → registrarVenta(product, 3)                                           │
    │  │  Bot: "✅ Venta registrada..."                                          │
    │  │  flowStep: null (fin)                                                   │
    │  └────────────────────────────────────────────────────────────────────────┘
    │       ↓
    │  ┌─ Sin cantidad ("1") ───────────────────────────────────────────────────┐
    │  │  flowStep: venta_esperando_cantidad                                     │
    │  │  Bot: "¿Cuántas unidades?\n(Solo el número, ej: *3*)"                  │
    │  └────────────────────────────────────────────────────────────────────────┘
    │
    │  [desde venta_esperando_cantidad]
    │       ↓
    │  Usuario escribe número
    │       ↓
    │  ┌─ Número válido (>0) ───────────────────────────────────────────────────┐
    │  │  → registrarVenta(product, qty)                                         │
    │  │  Bot: "✅ Venta registrada..."                                          │
    │  │  flowStep: null (fin)                                                   │
    │  └────────────────────────────────────────────────────────────────────────┘
    │       ↓
    │  ┌─ Número inválido ──────────────────────────────────────────────────────┐
    │  │  Bot: "La cantidad debe ser un número mayor a 0.\n👉 Ej: *3*"          │
    │  │  flowStep: venta_esperando_cantidad (permanece)                         │
    │  └────────────────────────────────────────────────────────────────────────┘
```

### Cambio requerido en `parseIntent` para el flujo guiado

```js
// Agregar ANTES del paso 1 (selección numérica):
// Paso 0: flowStep activo — verificar escape primero
if (session?.flowStep === 'venta_esperando_producto') {
  // "Comando reconocido" = cualquier trigger de los pasos 2-9 del pipeline:
  //   catalogo, lista, productos, que tenes, que tienen, ver todo, ver catalogo,
  //   auto, autos, elaion (como categoría), moto, motos, rod, camion, camiones,
  //   extravida, pesado, otros, destacados, populares, recomendados,
  //   ventas, ventas hoy, ventas semana, resumen, cuanto vendimos, que vendimos,
  //   top, ranking, mas vendidos, top 5, mejores,
  //   ayuda, help, hola, inicio, que puedo hacer, comandos, menu,
  //   vender (reinicia el flujo)
  // + cualquier input que empiece con "!" (comando explícito)
  const KNOWN_COMMANDS = /^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo|auto|autos|moto|motos|rod|camion|camiones|extravida|pesado|otros|destacados|populares|recomendados|ventas?( hoy| semana)?|resumen|cuanto vendimos|que vendimos( hoy)?|top( \d+)?|ranking|mas vendidos|mejores|ayuda|help|hola|inicio|que puedo hacer|comandos|menu|vender)$/i;
  const isKnownCommand = KNOWN_COMMANDS.test(t.trim()) || t.trim().startsWith('!');

  if (isKnownCommand) {
    // Escape: el input es un comando nuevo → index.js limpiará la sesión
    // Procesar normalmente por el pipeline estándar
    return parseNormalPipeline(t);
  }
  // No es comando reconocido → tratar como término de búsqueda del flujo de venta
  return { command: '__venta_flujo__', args: t.split(/\s+/) };
}

if (session?.flowStep === 'venta_esperando_cantidad') {
  if (/^\d+$/.test(t)) {
    return { command: '__venta_cantidad__', args: [t] };
  }
  // Si no es número, tratar como nuevo comando (escape natural al pipeline normal)
}
```

**Nota crítica (DESIGN-BUG-003):** Sin la verificación de `isKnownCommand` en el Paso 0, cualquier input durante `venta_esperando_producto` — incluyendo "catalogo", "ayuda" u otros comandos — se convierte en `__venta_flujo__`, violando P3 (escape siempre disponible) y rompiendo AC-003. El mecanismo de `sessions.delete` en `index.js` solo actúa DESPUÉS de que `parseIntent` retorna, por lo que el Paso 0 debe detectar el escape ANTES de devolver `__venta_flujo__`.

---

## 6. Tabla de funciones

| Función | Activadores (ejemplos) | Tipo de flujo | Flujo guiado | Guarda sesión | Nota |
|---------|----------------------|---------------|--------------|---------------|------|
| Ver catálogo | `catalogo`, `lista`, `productos` | Stateless | No | No | IDs sin selección numérica |
| Ver ficha | `3`, `elaion 5w30`, `rod 20w50` | Single / Multi-paso | Sí (lista) | Sí (si hay lista) | Selección activa post-lista |
| Filtrar categoría | `auto`, `moto`, `camion`, `otros` | Stateless | No | No | No activa selección |
| Ver destacados | `destacados`, `populares` | Stateless | No | No | No activa selección |
| Registrar venta | `vender`, `vender 3`, `vender 3 2` | Multi-paso | Sí (hasta 3 preguntas) | Sí | Ver sub-flujos A-F |
| Multi-venta | `vender 3 2, 7 1` | Stateless | No | No | Solo IDs; continúa ante errores |
| Ver ventas | `ventas`, `ventas hoy`, `ventas semana` | Stateless | No | No | Máx 8 líneas detalle |
| Ranking | `top`, `ranking`, `mas vendidos` | Stateless | No | No | Últimos 7 días |
| Ayuda | `ayuda`, `hola`, `menu`, `help` | Stateless | No | No | Entrada principal de discovery |

---

## 7. ADRs

### ADR-001: Flujos guiados vs. parámetros directos

**Contexto:** El bot debe ser usable tanto por vendedores novatos (que no recuerdan sintaxis) como por usuarios avanzados (que quieren velocidad).

**Decisión:** Implementar ambos modelos en coexistencia:
- Los parámetros directos (`vender 3 2`) siguen funcionando sin cambios.
- Los flujos guiados se activan cuando hay información incompleta o ambigüedad.
- El bot detecta automáticamente cuál aplicar según los argumentos recibidos.

**Criterio de activación del flujo guiado:**
1. `vender` sin argumentos → flujo guiado completo (3 pasos máximo)
2. `vender <texto>` con ambigüedad → flujo guiado desde paso 2 (selección)
3. `vender <id> <qty>` completo → atajo directo sin preguntas

**Consecuencias:**
- (+) Los usuarios novatos descubren el bot solo escribiendo `vender`.
- (+) Los usuarios avanzados no tienen overhead.
- (-) La lógica de `parseIntent` y `cmdVenta` aumenta en complejidad.
- Mitigación: los nuevos comandos internos (`__venta_flujo__`, `__venta_cantidad__`) aíslan la complejidad.

**Alternativas rechazadas:**
- Solo flujo guiado: penaliza a usuarios avanzados.
- Solo parámetros: mantiene el problema original de usabilidad.

---

### ADR-002: Mecanismo de selección numérica

**Contexto:** Un número como `"1"` puede significar tres cosas distintas: selección de lista, ID de producto, o cantidad en flujo de venta.

**Decisión:** Prioridad de interpretación explícita en `parseIntent`, evaluada en orden:

```
1. Si /^[1-5]$/ Y session.lastResults existe Y flowStep != 'venta_esperando_cantidad'
   → __select__

2. Si flowStep = 'venta_esperando_cantidad' Y /^\d+$/
   → __venta_cantidad__

3. Si flowStep = 'venta_esperando_producto'
   → __venta_flujo__ (el texto es término de búsqueda, no se parsea como número)

4. Si /^\d+$/ (sin sesión activa)
   → !p (buscar por ID)
```

**Regla fundamental:** `session.lastResults` solo existe cuando el bot emitió explícitamente una lista numerada con instrucción de selección. Si no hay lista activa, el número es ID.

**Consecuencias:**
- (+) El comportamiento es predecible y sin colisiones.
- (+) No requiere palabras clave adicionales del usuario.
- (-) El orden de evaluación en `parseIntent` es orden-dependiente (debe mantenerse).
- Mitigación: documentar el orden explícitamente en el código con comentarios numerados.

**Alternativas rechazadas:**
- Prefijo `#` para selección (`#1`, `#2`): introduce fricción para usuarios móviles.
- Contexto implícito basado en tiempo: frágil y no predecible.

---

### ADR-003: Estado de conversación multi-paso

**Contexto:** Los flujos guiados requieren que el bot "recuerde" en qué paso está la conversación entre mensajes.

**Decisión:** Usar el campo `flowStep` en la sesión de usuario (Map en memoria) para rastrear el estado del flujo activo. El campo es una cadena de estado máquina (`null | 'venta_esperando_producto' | 'venta_esperando_seleccion' | 'venta_esperando_cantidad'`).

**Mecanismo de escape:** Cuando llega un mensaje que `parseIntent` clasifica como comando diferente a `__select__`, `__venta_flujo__`, o `__venta_cantidad__`, `index.js` limpia la sesión (`sessions.delete(jid)`) antes de procesar. Esto cancela cualquier flujo activo silenciosamente y procesa el nuevo mensaje desde cero.

**TTL de sesión:** 15 minutos sin actividad. Si el vendedor inicia un flujo y no lo completa, al reanudar la sesión habrá expirado y el bot responderá como si fuera el primer mensaje.

**Consecuencias:**
- (+) Simple de implementar y depurar.
- (+) Tolerante a fallos: si la sesión expira, el usuario simplemente empieza de nuevo.
- (+) El escape es natural: escribir cualquier otra cosa cancela el flujo.
- (-) Estado en memoria: si el proceso se reinicia, las sesiones se pierden.
- Mitigación aceptada: el TTL de 15 min hace que la pérdida sea de bajo impacto; los flujos son cortos.

**Alternativas rechazadas:**
- Estado en DB (Supabase): overhead innecesario para sesiones de minutos.
- Estado en archivo: complejidad sin beneficio dado el TTL corto.

---

## 8. Acceptance Criteria para QA

### AC-001: Flujo guiado de venta completo (3 pasos)

```
DADO   que el usuario escribe "vender"
CUANDO el bot recibe el mensaje
ENTONCES el bot responde "¿Qué producto vendiste? Escribí el nombre o ID."
Y       flowStep = 'venta_esperando_producto' en sesión

DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "elaion 5w30"
Y      hay 2+ productos que coinciden
ENTONCES el bot responde con lista numerada (máx 5)
Y       el mensaje incluye "¿Cuál es? Escribí 1 o 2."
Y       flowStep = 'venta_esperando_seleccion'
Y       lastResults contiene los productos encontrados

DADO   flowStep = 'venta_esperando_seleccion' con 2 resultados
CUANDO el usuario escribe "1"
ENTONCES el bot responde "¿Cuántas unidades?\n(Solo el número, ej: *3*)"
Y       flowStep = 'venta_esperando_cantidad'
Y       pendingVenta.productId = ID del producto seleccionado

DADO   flowStep = 'venta_esperando_cantidad'
CUANDO el usuario escribe "3"
ENTONCES el bot responde "✅ *Venta registrada*\n[ID] NOMBRE × 3 unidades\n🕐 HH:MM"
Y       la venta existe en la tabla sales de Supabase
Y       flowStep = null (sesión limpiada)
```

### AC-002: Atajo directo (sin flujo guiado)

```
DADO   que el usuario escribe "vender 3 2"
CUANDO el producto [3] existe
ENTONCES el bot responde "✅ *Venta registrada*\n[3] NOMBRE × 2 unidades\n🕐 HH:MM"
Y       la venta se registra en Supabase
Y       NO se activa ningún flujo guiado
Y       flowStep = null
```

### AC-003: Escape de flujo

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "catalogo"
ENTONCES el bot responde con el catálogo completo (no con "¿Qué producto vendiste?")
Y       flowStep = null (sesión limpiada)
```

### AC-004: Selección numérica en contexto correcto

```
DADO   que NO hay lastResults activo
CUANDO el usuario escribe "3"
ENTONCES el bot responde con la ficha del producto [3]
Y       NO interpreta "3" como selección de lista

DADO   que lastResults tiene 2 productos y lastAction = 'ficha'
CUANDO el usuario escribe "1"
ENTONCES el bot responde con la ficha del producto en posición 1 de la lista
Y       NO registra ninguna venta
```

### AC-005: Error con recuperación

```
DADO   flowStep = 'venta_esperando_cantidad'
CUANDO el usuario escribe "hola"
ENTONCES el bot responde con el mensaje de ayuda
Y       flowStep = null (escape de flujo)

DADO   flowStep = 'venta_esperando_cantidad'
CUANDO el usuario escribe "0" o "-1"
ENTONCES el bot responde "La cantidad debe ser un número mayor a 0.\n👉 Ej: *3*"
Y       flowStep = 'venta_esperando_cantidad' (permanece, sin cancelar)
```

### AC-006: Multi-venta

```
DADO   el usuario escribe "vender 3 2, 7 1"
CUANDO ambos productos existen
ENTONCES el bot responde con 2 líneas "✅" y "*2 ventas registradas*"
Y       ambas ventas existen en Supabase

DADO   el usuario escribe "vender 3 2, 99 1"
CUANDO producto [99] no existe
ENTONCES el bot responde con 1 línea "✅" y 1 línea "❌" y "*1 de 2 registradas* (1 con error)"
Y       solo la venta válida existe en Supabase

DADO   el usuario escribe "vender 3 2, 7, 10 3"
CUANDO el ítem "7" no tiene cantidad explícita
ENTONCES el bot registra [7] × 1 (cantidad implícita = 1)
Y       el bot responde con 3 líneas "✅" incluyendo "[7] RÖD 20W-50 ×1"
Y       "*3 ventas registradas*"
```

### AC-007: Consistencia de formato

```
TODO mensaje de lista numerada:
  - Usa formato "  N. [ID] NOMBRE — VISCOSIDAD_O_TECNOLOGIA"
  - Tiene footer con "👉 ..."
  - Máximo 5 ítems

TODO mensaje de error:
  - Incluye descripción del problema
  - Incluye "👉 " con acción concreta

TODO mensaje de venta registrada:
  - Empieza con "✅ *Venta registrada*"
  - Segunda línea: "[ID] NOMBRE × N unidad(es)"
  - Tercera línea: "🕐 HH:MM"
```

### AC-008: Prioridad `venta_esperando_cantidad` sobre selección numérica [P1]

```
DADO   flowStep = 'venta_esperando_cantidad'
Y      pendingVenta.productId = 3
CUANDO el usuario escribe "1"
ENTONCES el bot registra [3] ELAION F10 5W-30 × 1 unidad
Y       NO interpreta "1" como selección de lista (aunque lastResults exista)
Y       flowStep = null (sesión limpiada)
```

### AC-009: Prioridad `venta_esperando_cantidad` sobre búsqueda por ID [P1]

```
DADO   flowStep = 'venta_esperando_cantidad'
Y      pendingVenta.productId = 7
CUANDO el usuario escribe "5"
ENTONCES el bot registra [7] × 5 unidades
Y       NO interpreta "5" como ID de producto (no busca ficha del producto [5])
Y       flowStep = null (sesión limpiada)
```

### AC-010: Escape desde `venta_esperando_producto` con "ayuda" [P1]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "ayuda"
ENTONCES el bot responde con el menú de ayuda (no con "¿Qué producto vendiste?")
Y       flowStep = null (sesión limpiada)
```

### AC-011: Escape desde `venta_esperando_producto` con "ventas hoy" [P1]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "ventas hoy"
ENTONCES el bot responde con el resumen de ventas del día
Y       flowStep = null (sesión limpiada)
```

### AC-012: Escape desde `venta_esperando_producto` con comando "!" explícito [P1]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "!p 3"
ENTONCES el bot responde con la ficha del producto [3]
Y       flowStep = null (sesión limpiada)
```

### AC-013: Término de búsqueda no-comando en `venta_esperando_producto` [P1]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "elaion f10" (no es comando reconocido)
ENTONCES el bot procesa "elaion f10" como término de búsqueda de venta
Y       responde con la ficha si hay 1 resultado, o lista si hay 2-5
Y       flowStep avanza correctamente (a 'venta_esperando_cantidad' o 'venta_esperando_seleccion')
```

### AC-014: Término ambiguo en `venta_esperando_producto` con 0 resultados [P1]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "xyz_inexistente"
ENTONCES el bot responde "No encontré X.\n👉 Probá con el ID directo o escribí catalogo."
Y       flowStep = 'venta_esperando_producto' (permanece, no se cancela el flujo)
```

### AC-015: Multi-venta con ítem sin cantidad → implícita = 1 [P1]

```
DADO   el usuario escribe "vender 3, 7 2"
CUANDO el ítem "3" no tiene cantidad explícita
ENTONCES el bot registra [3] × 1 y [7] × 2
Y       el mensaje confirma "[3] ... ×1" y "[7] ... ×2"
Y       "*2 ventas registradas*"
```

### AC-016: Selección `N cantidad` en `venta_esperando_seleccion` [P2]

```
DADO   flowStep = 'venta_esperando_seleccion'
Y      lastResults = [p3, p4]
CUANDO el usuario escribe "2 5"
ENTONCES el bot registra [4] × 5 unidades directamente
Y       NO pregunta "¿Cuántas unidades?"
Y       flowStep = null (sesión limpiada)
```

### AC-017: Escape desde `venta_esperando_seleccion` [P2]

```
DADO   flowStep = 'venta_esperando_seleccion'
CUANDO el usuario escribe "catalogo"
ENTONCES el bot responde con el catálogo completo
Y       flowStep = null (sesión limpiada)
Y       NO responde con la lista de selección de venta
```

### AC-018: Escape desde `venta_esperando_cantidad` con texto no numérico [P2]

```
DADO   flowStep = 'venta_esperando_cantidad'
CUANDO el usuario escribe "top"
ENTONCES el bot responde con el ranking
Y       flowStep = null (sesión limpiada)
Y       NO responde "La cantidad debe ser un número mayor a 0."
```

### AC-019: TTL de sesión — flujo expirado [P2]

```
DADO   flowStep = 'venta_esperando_producto'
Y      han pasado más de 15 minutos sin actividad
CUANDO el usuario escribe cualquier mensaje
ENTONCES la sesión ya no existe (expiró)
Y       el bot procesa el mensaje como si fuera el primero (sin contexto de flujo)
Y       NO responde como si estuviera en el paso de venta
```

### AC-020: Venta con `vender` (reinicia flujo si ya hay uno activo) [P2]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "vender"
ENTONCES el bot reinicia el flujo desde el principio
Y       responde "¿Qué producto vendiste? Escribí el nombre o ID."
Y       flowStep = 'venta_esperando_producto' (reiniciado)
```

### AC-021: ID directo en `venta_esperando_producto` va a cantidad [P2]

```
DADO   flowStep = 'venta_esperando_producto'
CUANDO el usuario escribe "3" (ID numérico)
ENTONCES el bot NO busca la ficha del producto (no interpreta como búsqueda por ID)
Y       responde "¿Cuántas unidades?\n(Solo el número, ej: *3*)"
Y       flowStep = 'venta_esperando_cantidad'
Y       pendingVenta.productId = 3
```

### AC-022: Cantidad inválida no cancela flujo [P2]

```
DADO   flowStep = 'venta_esperando_cantidad'
CUANDO el usuario escribe "0"
ENTONCES el bot responde "La cantidad debe ser un número mayor a 0.\n👉 Ej: *3*"
Y       flowStep = 'venta_esperando_cantidad' (permanece)
Y       pendingVenta.productId NO cambia

DADO   flowStep = 'venta_esperando_cantidad'
CUANDO el usuario escribe "-3"
ENTONCES el bot responde "La cantidad debe ser un número mayor a 0.\n👉 Ej: *3*"
Y       flowStep = 'venta_esperando_cantidad' (permanece)
```

---

## Resumen de cambios requeridos en código

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `index.js` | Agregar paso 0 en `parseIntent` para `flowStep` activo | Alta |
| `index.js` | Agregar routing de `__venta_flujo__` y `__venta_cantidad__` en `messages.upsert` | Alta |
| `commands.js` | Agregar `cmdVentaFlujo(args, supabase, session)` — maneja `venta_esperando_producto` | Alta |
| `commands.js` | Extender `cmdSelect` para manejar `flowStep = 'venta_esperando_seleccion'` sin qty | Alta |
| `commands.js` | Agregar `cmdVentaCantidad(args, session, supabase)` — maneja `venta_esperando_cantidad` | Alta |
| `commands.js` | Modificar `cmdVenta` para que `args.length === 0` inicie el flujo guiado | Alta |
| `commands.js` | Extender `pendingVenta` con `productId` y `searchTerm` | Media |
| `index.js` | Inicializar `flowStep: null` en sesión vacía | Media |

---

*[DESIGN-APPROVED] @architect — cgs-bot v3.1 — 2026-05-20*
