# User Stories — Bot WhatsApp CGS Paraguay
**Autor:** Santiago (@architect)
**Fecha:** 2026-05-20

---

## Principios UX (no negociables)

1. **Cero memorización de sintaxis** — el bot entiende lenguaje aproximado, no contratos de parámetros
2. **Una respuesta = una pantalla** — sin scroll excesivo en celular
3. **Confirmación visible** — toda venta confirma producto + cantidad + hora
4. **El error ayuda** — cada error incluye la acción siguiente para corregir
5. **Flujos cortos ganan** — 90% de los casos en 1-2 mensajes
6. **El número es el ancla** — los IDs se muestran siempre y se pueden usar siempre
7. **Coherencia en selección** — lista numerada → usuario elige con el número, sin excepción
8. **El contexto persiste** — el bot recuerda el estado de la conversación

---

## User Stories

### US-01 — Ver el catálogo completo
**Como** vendedor, **quiero** ver todos los productos con sus IDs **para** identificar rápido lo que necesito.
**Prioridad:** MVP

- AC-01.1: Productos agrupados por categoría
- AC-01.2: Cada producto muestra ID + nombre
- AC-01.3: Legible sin scroll excesivo
- AC-01.4: Indica cómo obtener más detalle
- AC-01.5: Se activa con una sola palabra/frase corta

---

### US-02 — Consultar ficha por ID
**Como** vendedor de mostrador, **quiero** ver la ficha completa de un producto por ID **para** responder preguntas del cliente.
**Prioridad:** MVP

- AC-02.1: Devuelve ficha cuando el usuario indica el ID
- AC-02.2: Ficha incluye: nombre, tecnología, viscosidad, specs, presentaciones, aplicaciones
- AC-02.3: Muestra badge si existe
- AC-02.4: Cabe en una pantalla sin scroll
- AC-02.5: Si el ID no existe: indica el error y ofrece ver el catálogo

---

### US-03 — Consultar producto por nombre o descripción parcial
**Como** vendedor de ruta, **quiero** encontrar un producto escribiendo parte del nombre o tipo de uso **para** no memorizar IDs ni nombres exactos.
**Prioridad:** MVP

- AC-03.1: Acepta términos parciales: "5w30", "moto", "camion", "elaion"
- AC-03.2: 1 resultado → muestra ficha completa directamente
- AC-03.3: Varios resultados → lista numerada (máx. 5) con info diferenciadora
- AC-03.4: 0 resultados → lo indica y sugiere explorar el catálogo
- AC-03.5: El usuario selecciona de la lista escribiendo solo el número

---

### US-04 — Registrar una venta simple
**Como** vendedor de ruta, **quiero** registrar N unidades de un producto **para** que quede guardado sin interrumpir la atención al cliente.
**Prioridad:** MVP

- AC-04.1: Acepta producto por ID o nombre + cantidad
- AC-04.2: Sin cantidad especificada → asume 1 y lo confirma
- AC-04.3: Confirma con: nombre del producto + cantidad + hora
- AC-04.4: 1 resultado de búsqueda → registra sin pasos extra
- AC-04.5: Cantidad inválida → indica el error y cómo corregir

---

### US-05 — Registrar múltiples ventas de una visita
**Como** vendedor de ruta, **quiero** registrar varios productos en un solo mensaje **para** no enviar un mensaje por cada producto.
**Prioridad:** MVP

- AC-05.1: Acepta varios productos con cantidades en un mensaje
- AC-05.2: Error en uno no cancela los demás
- AC-05.3: Responde con resultado por ítem + resumen total
- AC-05.4: Indica cuáles fallaron y cuáles se guardaron
- AC-05.5: No requiere confirmaciones intermedias para ítems sin ambigüedad

---

### US-06 — Ver resumen de ventas del día
**Como** vendedor o gerente, **quiero** ver cuánto se vendió hoy **para** conocer el avance sin salir de WhatsApp.
**Prioridad:** MVP

- AC-06.1: Total de unidades vendidas en el día
- AC-06.2: Desglose por categoría con totales
- AC-06.3: Detalle de últimas operaciones con hora y producto
- AC-06.4: Sin ventas → lo indica claramente (no lista vacía)
- AC-06.5: Se activa con frase corta sin sintaxis a memorizar
- AC-06.6: Muchas operaciones → muestra las más recientes y cuántas más hay

---

### US-07 — Ver ranking semanal
**Como** gerente, **quiero** ver los productos más vendidos en 7 días **para** decidir stock y evaluar el equipo.
**Prioridad:** IMPORTANTE

- AC-07.1: Top 5 productos últimos 7 días, ordenado de mayor a menor
- AC-07.2: Posición + nombre + unidades totales
- AC-07.3: Sin ventas → lo indica claramente
- AC-07.4: Se activa con una sola palabra
- AC-07.5: Cabe en una pantalla sin scroll

---

### US-08 — Resolver ambigüedad
**Como** vendedor que no recuerda el nombre exacto, **quiero** elegir de una lista **para** no quedarme bloqueado.
**Prioridad:** MVP

- AC-08.1: Múltiples resultados → lista numerada con info diferenciadora
- AC-08.2: Selección escribiendo solo el número en el siguiente mensaje
- AC-08.3: La selección funciona tanto para consultar ficha como para registrar venta
- AC-08.4: Si el usuario escribe algo nuevo → descarta la lista anterior
- AC-08.5: Máximo 5 resultados en la lista
- AC-08.6: Más de 5 resultados → sugiere refinar la búsqueda

---

### US-09 — Recuperarse de un error
**Como** cualquier usuario, **quiero** orientación clara cuando me equivoco **para** corregir rápido sin frustración.
**Prioridad:** MVP

- AC-09.1: Todo error incluye qué no se entendió + acción concreta para continuar
- AC-09.2: ID inexistente → indica que no existe y cómo ver el catálogo
- AC-09.3: Búsqueda sin resultados → ofrece alternativas (catálogo, categoría)
- AC-09.4: Ningún error es callejón sin salida: siempre hay acción siguiente
- AC-09.5: Mensajes de error breves: 1-2 líneas máximo
- AC-09.6: Venta con datos inválidos → indica qué falló y cómo corregir

---

### US-10 — Explorar por categoría
**Como** vendedor de mostrador, **quiero** ver solo los productos de una categoría **para** responder más rápido cuando el cliente sabe qué tipo de vehículo tiene.
**Prioridad:** IMPORTANTE

- AC-10.1: Acepta términos naturales: "auto", "moto", "camion", "fluidos" y variantes
- AC-10.2: Lista con ID + nombre + viscosidad/tecnología + badge
- AC-10.3: Indica cómo ver la ficha completa
- AC-10.4: Término no reconocido → muestra las categorías disponibles

---

### US-11 — Ver productos destacados
**Como** vendedor nuevo, **quiero** ver los productos más importantes **para** tener un punto de partida sin conocer todo el catálogo.
**Prioridad:** NICE-TO-HAVE

- AC-11.1: Muestra productos con featured=true: ID + nombre + badge
- AC-11.2: Sin destacados configurados → lo indica sin error
- AC-11.3: Desde la lista se puede acceder a la ficha de cualquiera

---

### US-12 — Descubrir qué puede hacer el bot
**Como** usuario nuevo o que olvidó las funciones, **quiero** ver un resumen de todo lo que el bot hace **para** no depender de que alguien me lo explique.
**Prioridad:** MVP

- AC-12.1: Lista todas las acciones agrupadas por tipo (catálogo, ventas, reportes)
- AC-12.2: Cada acción tiene un ejemplo concreto
- AC-12.3: Cabe en una pantalla sin scroll excesivo
- AC-12.4: Se activa con palabras intuitivas: "ayuda", "qué puedo hacer", "help"

---

## Mapa de prioridades

| # | Historia | Prioridad |
|---|----------|-----------|
| US-01 | Ver catálogo completo | MVP |
| US-02 | Ficha por ID | MVP |
| US-03 | Buscar por nombre/descripción | MVP |
| US-04 | Registrar venta simple | MVP |
| US-05 | Registrar múltiples ventas | MVP |
| US-06 | Resumen de ventas del día | MVP |
| US-07 | Ranking semanal | IMPORTANTE |
| US-08 | Resolver ambigüedad | MVP |
| US-09 | Recuperarse de error | MVP |
| US-10 | Explorar por categoría | IMPORTANTE |
| US-11 | Productos destacados | NICE-TO-HAVE |
| US-12 | Descubrir funciones (ayuda) | MVP |

---

## Observaciones para la implementación

1. **US-08 es transversal**: la selección numérica de lista aplica tanto en consulta como en venta — debe ser un mecanismo único y consistente.
2. **US-05 es una generalización de US-04**: una venta simple es una multi-venta de un ítem. Compartir el mismo mecanismo de fondo.
3. **US-03 y US-08 deben ser consistentes**: 1 resultado → directo; múltiples → lista. Aplica igual en consulta y en venta.
4. **US-12 es el test de usabilidad**: si el usuario consulta la ayuda más de una vez para una tarea frecuente, la interfaz falló.
