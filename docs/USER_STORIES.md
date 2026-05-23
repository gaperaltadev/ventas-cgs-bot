# User Stories — Bot CGS Paraguay (catálogo completo + status)

**Última revisión:** 2026-05-23 — re-priorización con framework Valor × Esfuerzo × Riesgo.
**Para el alcance de demo**, ver `DEMO_STORIES.md`.
**Para features post-demo**, ver `PILOTO_BACKLOG.md`.

---

## Principios UX (no negociables)

1. **Cero memorización de sintaxis** — el bot entiende lenguaje aproximado
2. **Una respuesta = una pantalla** — sin scroll excesivo en celular
3. **Confirmación visible** — toda venta confirma producto + cantidad + hora
4. **El error ayuda** — cada error incluye la acción siguiente
5. **Flujos cortos ganan** — 90% de los casos en 1-2 mensajes
6. **El número es el ancla** — los IDs se muestran siempre
7. **Coherencia en selección** — lista numerada → elegir con el número
8. **El contexto persiste** — el bot recuerda el estado de la conversación

---

## Mapa de status (post re-priorización)

| ID | Historia | Status | Razón |
|----|----------|--------|-------|
| US-01 | Ver catálogo completo | ✅ MVD | Setup necesario, valor demostrable |
| US-02 | Ficha por ID | 🔵 Backend | Implícito en /guia y /buscar, no demo explícito |
| US-03 | Búsqueda con typos | ✅ MVD | Wow moment, alta diferenciación |
| US-04 | Registrar venta simple | 🔴 **Descartada** | Consolidada en /pedido con CONSUMIDOR FINAL |
| US-05 | Registrar múltiples ventas | 🔴 **Descartada** | Cubierto por items de /pedido |
| US-06 | Resumen de ventas del día | ✅ MVD | Crítico para el jefe |
| US-07 | Ranking semanal | ✅ MVD | Crítico para el jefe |
| US-08 | Resolver ambigüedad | 🔵 Backend | Aparece naturalmente en /buscar (DS-03) |
| US-09 | Recuperarse de error | 🔵 Backend | Se ve cuando algo sale mal, no requiere demo |
| US-10 | Explorar por categoría | 🔵 Backend | /auto, /moto, /camion — atajos, no protagonistas |
| US-11 | Productos destacados | 🔴 **Descartada** | Bajo uso real, ruido en menú |
| US-12 | Descubrir funciones (ayuda) | 🔵 Backend | Mencionar al pasar |

**Stories agregadas durante implementación que SÍ entran en MVD:**

| ID | Historia | Status |
|----|----------|--------|
| US-13 | Recomendación por vehículo (`/guia`) | ✅ MVD ⭐⭐ |
| US-14 | Pedido con cliente identificado (`/pedido`) | ✅ MVD ⭐⭐ |
| US-15 | Alta de cliente nuevo on-the-fly | ✅ MVD |
| US-16 | Ver propios pedidos (`/mispedidos`) | 🔵 Backend |
| US-17 | Panel admin web para gestión | ✅ MVD |

### Resumen

- ✅ **MVD (en demo)**: 8 historias — US-01, 03, 06, 07, 13, 14, 15, 17
- 🔵 **Backend (sin demo explícito)**: 6 historias — US-02, 08, 09, 10, 12, 16
- 🔴 **Descartadas**: 3 historias — US-04, 05, 11

---

## Historias detalladas

### US-01 — Ver el catálogo completo ✅ MVD

**Como** vendedor, **quiero** ver todos los productos con sus IDs **para** identificar rápido lo que necesito.

- AC-01.1: Productos agrupados por categoría
- AC-01.2: Cada producto muestra ID + nombre
- AC-01.3: Legible sin scroll excesivo
- AC-01.4: Indica cómo obtener más detalle
- AC-01.5: Se activa con una sola palabra/frase corta

---

### US-02 — Consultar ficha por ID 🔵 Backend

**Como** vendedor de mostrador, **quiero** ver la ficha completa de un producto por ID **para** responder preguntas del cliente.

- AC-02.1: Devuelve ficha cuando el usuario indica el ID
- AC-02.2: Ficha incluye: nombre, tecnología, viscosidad, specs, presentaciones, aplicaciones
- AC-02.3: Muestra badge si existe
- AC-02.4: Cabe en una pantalla sin scroll
- AC-02.5: Si el ID no existe: indica el error y ofrece ver el catálogo

---

### US-03 — Buscar por nombre/descripción con tolerancia a typos ✅ MVD

**Como** vendedor de ruta, **quiero** encontrar un producto escribiendo parte del nombre, aunque tipee con errores, **para** no perder ventas por escribir mal.

- AC-03.1: Acepta términos parciales: "5w30", "moto", "elaion"
- AC-03.2: Tolera typos comunes (elaiom → elaion)
- AC-03.3: 1 resultado → muestra ficha directa
- AC-03.4: Varios resultados → lista numerada (máx. 5)
- AC-03.5: 0 resultados → sugiere catálogo o búsqueda alternativa
- AC-03.6: Selección numérica (1, 2...) en mensaje siguiente

---

### US-04 — Registrar venta simple 🔴 DESCARTADA

**Razón del descarte**: consolidamos toda venta en `/pedido` para tener datos
unificados (quién, a quién, qué, cuándo). Mostrador queda cubierto con
cliente genérico `CONSUMIDOR FINAL`.

~~Historia original conservada en histórico de git.~~

---

### US-05 — Registrar múltiples ventas 🔴 DESCARTADA

**Razón del descarte**: ya cubierto por items múltiples dentro de `/pedido`.

---

### US-06 — Ver resumen de ventas ✅ MVD

**Como** vendedor o jefe, **quiero** ver cuánto se vendió hoy/semana **para** conocer el avance sin salir de WhatsApp.

- AC-06.1: Total de unidades vendidas en el período
- AC-06.2: Desglose por categoría con totales
- AC-06.3: Detalle de últimas operaciones con hora y producto
- AC-06.4: Sin ventas → lo indica claramente (no lista vacía)
- AC-06.5: Período: hoy (default) o semana (últimos 7 días)
- AC-06.6: Muchas operaciones → muestra las más recientes y cuántas más hay

---

### US-07 — Ver ranking semanal ✅ MVD

**Como** jefe, **quiero** ver los productos más vendidos en 7 días **para** decidir stock y evaluar el equipo.

- AC-07.1: Top 5 productos últimos 7 días
- AC-07.2: Posición + nombre + unidades totales
- AC-07.3: Sin ventas → lo indica claramente
- AC-07.4: Se activa con una sola palabra
- AC-07.5: Cabe en una pantalla sin scroll

---

### US-08 — Resolver ambigüedad 🔵 Backend

**Como** vendedor, **quiero** elegir de una lista cuando hay varios matches **para** no quedarme bloqueado.

- AC-08.1: Múltiples resultados → lista numerada
- AC-08.2: Selección escribiendo solo el número
- AC-08.3: Funciona tanto para consulta como para venta
- AC-08.4: Texto nuevo → descarta lista anterior
- AC-08.5: Máximo 5 resultados
- AC-08.6: Más de 5 → sugiere refinar

---

### US-09 — Recuperarse de error 🔵 Backend

**Como** cualquier usuario, **quiero** orientación clara cuando me equivoco.

- AC-09.1: Todo error incluye qué falló + acción siguiente
- AC-09.2: Ningún error es callejón sin salida
- AC-09.3: Mensajes breves: 1-2 líneas

---

### US-10 — Explorar por categoría 🔵 Backend

**Como** vendedor de mostrador, **quiero** ver una categoría completa rápidamente.

- AC-10.1: Acepta términos naturales: "auto", "moto", "camion", "otros"
- AC-10.2: Lista con ID + nombre + viscosidad/tecnología
- AC-10.3: Indica cómo ver la ficha completa

---

### US-11 — Productos destacados 🔴 DESCARTADA

**Razón del descarte**: en el uso real, el vendedor consulta por necesidad
concreta (catálogo, búsqueda, guía) — no abre "destacados" como navegación.

---

### US-12 — Descubrir funciones 🔵 Backend

**Como** usuario nuevo, **quiero** ver qué hace el bot **para** no depender de explicación externa.

- AC-12.1: Lista todas las acciones agrupadas por tipo
- AC-12.2: Cada acción tiene un ejemplo concreto
- AC-12.3: Cabe en pantalla
- AC-12.4: Activación con palabras intuitivas: "ayuda", "help"

---

### US-13 — Recomendación por vehículo ✅ MVD ⭐⭐

**Como** vendedor en frente del cliente, **quiero** saber qué lubricante usar
para el vehículo del cliente **para** vender lo correcto sin adivinar.

- AC-13.1: Acepta marca + modelo + año (año opcional)
- AC-13.2: Devuelve producto recomendado + alternativa (si existe)
- AC-13.3: Incluye nota técnica del motor cuando aplica
- AC-13.4: Si no encuentra → ofrece /buscar
- AC-13.5: Desde la respuesta, atajo directo a /pedido [ID]

---

### US-14 — Pedido con cliente identificado ✅ MVD ⭐⭐

**Como** vendedor de ruta, **quiero** registrar pedido con cliente (RUC), productos y cantidades en un mensaje **para** reemplazar papel + Excel + transcripción.

- AC-14.1: Acepta cliente por RUC o búsqueda por nombre
- AC-14.2: Multi-producto en una sola línea (formato: ID cant, ID cant, ...)
- AC-14.3: Muestra resumen antes de confirmar (cliente + items + total)
- AC-14.4: Requiere confirmación explícita (si / no)
- AC-14.5: Devuelve número de pedido y timestamp tras confirmar
- AC-14.6: Asocia automáticamente el vendedor (vía wa_phone)

---

### US-15 — Alta de cliente on-the-fly ✅ MVD

**Como** vendedor que visita un cliente nuevo, **quiero** crearlo en el mismo flujo del pedido **para** no salir del bot.

- AC-15.1: Si el RUC no existe → bot lo pregunta por nombre
- AC-15.2: Crea el cliente y continúa con el pedido sin reiniciar
- AC-15.3: Asocia el cliente al vendedor que lo creó (auditoría)

---

### US-16 — Ver propios pedidos 🔵 Backend

**Como** vendedor, **quiero** ver mis últimos pedidos **para** validar lo que cargué.

- AC-16.1: Lista los últimos 10 pedidos del vendedor
- AC-16.2: Muestra fecha, cliente, productos, total
- AC-16.3: Sin pedidos → lo indica claramente

---

### US-17 — Panel admin web ✅ MVD

**Como** jefe / admin, **quiero** gestionar productos, clientes, vendedores, y consultar pedidos desde una interfaz web.

- AC-17.1: Login con email + password (Supabase Auth)
- AC-17.2: Tabs: Productos, Vehículos, Vendedores, Clientes, Pedidos, Configuración
- AC-17.3: ABM completo en cada tab (excepto Pedidos: read-only)
- AC-17.4: Cambios se reflejan en el bot al instante (cache 5 min en allowlist)
- AC-17.5: Sign-up público deshabilitado por defecto

---

## Observaciones para implementación

1. **US-08 es transversal**: aparece en US-03 (búsqueda) y US-14 (pedido). Misma mecánica.
2. **US-14 absorbe US-04 y US-05**: una sola historia para todo registro de venta.
3. **US-15 está acoplada a US-14**: solo tiene sentido dentro del flujo de pedido.
4. **US-13 y US-14 se enlazan**: la salida de /guia ofrece atajo a /pedido [ID].
5. **US-17 es independiente del bot**: vive en la landing (cgs-landing repo), pero comparte la DB.
