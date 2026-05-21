# Migraciones SQL — orden de aplicación

Aplicar **en orden** desde Supabase → SQL Editor → New query → pegar y ejecutar.

| # | Archivo | Idempotente | Descripción |
|---|---------|-------------|-------------|
| 01 | `01-extensions.sql` | ✅ | Habilita `pg_trgm` y `unaccent` |
| 02 | `02-vendedores.sql` | ✅ | Tabla `vendedores` (reemplaza ALLOWED_NUMBERS) |
| 03 | `03-search-products.sql` | ✅ | Búsqueda fuzzy de productos |
| 04 | `04-vehicle-guide.sql` | ✅ | Guía de lubricación por vehículo |
| 05 | `05-product-equivalents.sql` | ✅ | Equivalencias con productos de competencia |

Todos los scripts son idempotentes (usan `IF NOT EXISTS` / `CREATE OR REPLACE`). Se pueden re-ejecutar sin daño.

## Post-migración

Una vez aplicadas:

1. **Cargar al menos 1 vendedor en `vendedores`** — si la tabla está vacía, el bot no responderá a nadie (la cache de `isAllowed` empieza vacía).
2. **Opcional: cargar `product_equivalents`** — para que `/buscar helix` devuelva el equivalente YPF.
3. **Opcional: cargar `vehicle_guide`** — para que `/guia toyota corolla` funcione.

Estos datos pueden cargarse después desde el panel admin web o vía SQL directo.

## Verificación

```sql
-- ¿pg_trgm activo?
SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','unaccent');

-- ¿La búsqueda funciona?
SELECT * FROM search_products_fuzzy('elaion 5w30', 5);

-- ¿La cache de vendedores tiene a alguien?
SELECT telefono, nombre, categorias FROM vendedores WHERE activo = TRUE;
```
