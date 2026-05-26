# Comandos de Reportes — /ventas, /ranking, /pendientes

> Stakeholder principal: Jefe  
> Prioridad: ALTA — retención del rol con mayor poder de decisión

---

## /ventas

### Propósito
Dar al jefe un resumen de ventas del período sin necesidad de abrir ningún sistema.

### Datos que usa
- `pedido_items` JOIN `pedidos` JOIN `products` — para desglose por categoría
- `pedidos_resumen` — para desglose por vendedor

### Variantes

| Comando | Período |
|---------|---------|
| `/ventas` | Hoy (desde 00:00) |
| `/ventas semana` | Últimos 7 días |
| `/ventas mes` | Últimos 30 días *(por implementar)* |

### Flujo

```
Usuario: /ventas

Bot:     📊 VENTAS DE HOY — 25/05/2026
         
         Por categoría:
         • ELAION (Autos): 87 uds
         • EXTRAVIDA (Camiones): 42 uds
         • RÖD (Motos): 13 uds
         
         Por vendedor:
         • Juan Pérez: 4 pedidos · 67 uds
         • Ana Gómez: 4 pedidos · 75 uds
         
         Total: 142 unidades en 8 pedidos confirmados
         
         👉 /ventas semana para ver la semana completa.
```

### Notas de implementación
- El desglose por vendedor requiere leer `pedidos_resumen` agrupado
- El desglose por categoría requiere JOIN `pedido_items` → `products`
- Solo contar pedidos con `estado = 'confirmado'` para el total del jefe
- La implementación actual en `commands.js (cmdVentas)` no separa por vendedor — agregar ese bloque
- **No usar** la tabla `sales` — está deprecated

---

## /ranking

### Propósito
Top 5 productos más vendidos de la semana. Permite al jefe entender qué se mueve.

### Datos que usa
- `pedido_items` JOIN `pedidos` — últimos 7 días

### Flujo

```
Usuario: /ranking

Bot:     🏆 TOP PRODUCTOS — últimos 7 días
         
         1. Elaion 20W50 Balde — 234 uds
         2. Extravida 15W40 5L — 178 uds
         3. Elaion 5W30 1L — 95 uds
         4. RÖD 4T 20W50 — 67 uds
         5. Extravida 80W90 — 45 uds
         
         Total semana: 619 unidades
```

### Notas de implementación
- Implementado en `commands.js (cmdTop)` — estable
- Agregar total general al final del mensaje

---

## /pendientes

### Propósito
Lista de pedidos que aún no fueron confirmados. Permite al jefe hacer seguimiento sin llamar a cada vendedor.

### Datos que usa
- `pedidos_resumen` filtrado por `estado = 'pendiente'`

### Flujo

```
Usuario: /pendientes

Bot:     ⏳ PEDIDOS PENDIENTES — 3 sin confirmar
         
         #251 · Ferretería ABC · Juan Pérez · 8 uds · hace 2h
         #249 · Auto López · Ana Gómez · 15 uds · hace 3h
         #247 · Dist. López · Juan Pérez · 6 uds · hace 5h
         
         👉 Confirmá en el panel admin o contactá al vendedor.
```

### Estado
🆕 **Por implementar.** No existe handler ni comando aún.

### Notas de implementación
- Leer `pedidos_resumen` con `estado = 'pendiente'`, ordenado por `created_at` ASC (más antiguos primero)
- Mostrar tiempo relativo (hace Xh) para urgencia visual
- Limitar a 10 resultados — si hay más, indicarlo
- Crear `handlers/pendientes.js` y registrar en `commands.js`
- Acceso restringido: solo vendedores con rol `jefe` en la tabla `vendedores` *(campo a agregar)*
