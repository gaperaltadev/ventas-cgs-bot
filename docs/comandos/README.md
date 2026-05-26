# Comandos del Bot — Índice

> Leer `docs/arquitectura.md` primero para entender el pipeline completo.

---

## Stakeholders y sus prioridades

| Rol | Dolor principal | Comandos prioritarios |
|-----|----------------|----------------------|
| **Vendedor de calle** | Registra ventas en papel o de memoria | `/pedido`, `/mispedidos` |
| **Vendedor de salón** | Tiene que ir a la PC para cargar cada venta | `/pedido`, `/catalogo`, `/buscar` |
| **Jefe** | No tiene visibilidad del equipo sin abrir el sistema | `/ventas`, `/ranking`, `/pendientes` |

---

## Estado de cada comando

| Comando | Archivo de doc | Stakeholder | Estado |
|---------|---------------|-------------|--------|
| `/pedido` | [ventas.md](ventas.md) | Vendedor calle / salón | 🔨 En revisión |
| `/mispedidos` | [ventas.md](ventas.md) | Vendedor calle / salón | 🔨 En revisión |
| `/ventas` | [reportes.md](reportes.md) | Jefe | 🔨 En revisión |
| `/ranking` | [reportes.md](reportes.md) | Jefe | 🔨 En revisión |
| `/pendientes` | [reportes.md](reportes.md) | Jefe | 🆕 Por implementar |
| `/catalogo` | [listas.md](listas.md) | Vendedor salón | ✅ Estable |
| `/buscar` | [listas.md](listas.md) | Vendedor salón / calle | ✅ Estable |
| `/guia` | [listas.md](listas.md) | Vendedor salón / calle | ✅ Estable |
| `/ayuda` | — | Todos | ✅ Estable |

---

## Prioridad de desarrollo

### Fase 1 — Crítico (datos disponibles hoy)
1. `/pedido` — flujo de carga de venta con cliente e ítems
2. `/mispedidos` — lista de pedidos del vendedor
3. `/ventas` — resumen para el jefe (hoy / semana)
4. `/ranking` — top productos de la semana

### Fase 2 — Alto valor (requiere ajustes menores)
5. `/pendientes` — pedidos sin confirmar, para el jefe
6. `/ventas [vendedor]` — filtrar por vendedor específico

### Fase 3 — Mejoras UX
7. Guía de lubricación integrada al flujo de venta
8. Alta de cliente simplificada desde campo

---

## Convenciones de flujos conversacionales

- **Máximo 4 pasos** para completar cualquier acción crítica
- **Siempre confirmar** antes de escribir en base de datos
- **Menús numerados** cuando hay más de una opción (1, 2, 3...)
- **Cancelación** siempre disponible con `/salir`
- **Mensajes de error** incluyen siempre una acción de recuperación (`👉 ...`)
