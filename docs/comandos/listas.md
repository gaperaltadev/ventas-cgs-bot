# Comandos de Consulta — /catalogo, /buscar, /guia

> Stakeholders: Todos los roles  
> Prioridad: MEDIA — habilitadores de los flujos de venta

---

## /catalogo

### Propósito
Ver todos los productos disponibles con sus IDs. Punto de entrada para vendedores que no recuerdan el ID de un producto.

### Datos que usa
- `products` — `id, name, category`, ordenado por `sort_order`

### Flujo

```
Usuario: /catalogo  (o /c)

Bot:     📋 Catálogo CGS Paraguay
         
         ELAION — Autos
         [1] Elaion Multi-T 20W50
         [2] Elaion F 5W30
         [3] Elaion 10W40 Semi
         ...
         
         EXTRAVIDA — Camiones
         [12] Extravida 15W40
         [13] Extravida 20W50
         ...
         
         RÖD — Motos
         [20] RÖD 4T 20W50
         ...
         
         👉 Escribí [ID] para ver la ficha  o  /pedido para registrar.
```

### Variantes por categoría

| Comando | Categoría |
|---------|----------|
| `/auto` o `/autos` | ELAION — Autos |
| `/camion` o `/camiones` | EXTRAVIDA — Camiones |
| `/moto` o `/motos` | RÖD — Motos |

### Estado
✅ Implementado y estable en `commands.js (cmdCatalogo, cmdCategoria)`.

---

## /buscar

### Propósito
Búsqueda inteligente (fuzzy) de productos por nombre, viscosidad o características. Útil cuando el vendedor no recuerda el nombre exacto o el ID.

### Datos que usa
- RPC `search_products_fuzzy` en Supabase (usa `pg_trgm`)
- Fallback: si no hay resultado en productos, busca en `vehicle_guide`

### Flujo — resultado único

```
Usuario: /buscar elaion 5w30

Bot:     🔧 [2] Elaion F 5W30
         Tecnología:     Sintético
         Viscosidad:     5W30
         Specs:          API SP / ACEA C3
         Presentaciones: 1L · 4L · 20L
         Aplicaciones:   Autos nafteros y a GNC modernos
         🏷️ YPF Tecnología
```

### Flujo — múltiples resultados

```
Usuario: /buscar 20w50

Bot:     Encontré varios para "20w50":
         
         1. [1] Elaion Multi-T 20W50 — Mineral
         2. [12] Extravida 15W40 20W50 — Semisintético
         3. [20] RÖD 4T 20W50 — Mineral
         
         Escribí 1, 2... para la ficha completa.
```

### Estado
✅ Implementado y estable en `handlers/buscar.js`.

---

## /guia

### Propósito
Recomendar el lubricante correcto dado el vehículo del cliente. Útil para vendedores de salón y de calle cuando el cliente pregunta qué aceite le corresponde.

### Datos que usa
- RPC `search_vehicle_guide` en Supabase
- `vehicle_guide` — marca, modelo, año, motor, producto recomendado y alternativa

### Flujo — resultado directo

```
Usuario: /guia toyota hilux 2020 diesel

Bot:     🚗 Toyota Hilux (2017+) · Diesel
         
         ✅ Recomendado: [13] Extravida 15W40 5L
         ↪ Alternativa:  [14] Extravida 20W50 5L
         
         📝 Motor 2.8L — requiere API CI-4 o superior
         
         👉 /13 ficha · /pedido 13 registrar
```

### Flujo — múltiples opciones

```
Usuario: /guia hilux

Bot:     Encontré varias opciones (especificá año si querés afinar):
         
         1. Toyota Hilux (2005–2015) · Diesel
              → [12] Extravida 15W40
         2. Toyota Hilux (2017+) · Diesel
              → [13] Extravida 15W40 5L
         3. Toyota Hilux (2017+) · Nafta
              → [2] Elaion F 5W30
         
         👉 Escribí /[ID] para ver la ficha del producto.
```

### Estado
✅ Implementado y estable en `handlers/guia.js`.

### Prioridad
Guía es funcionalidad secundaria. No bloquea el desarrollo de ventas y reportes. Mejorar después de estabilizar los flujos críticos.
