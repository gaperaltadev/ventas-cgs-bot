-- ════════════════════════════════════════════════════════════════════════════
-- 03 — Búsqueda fuzzy de productos
-- Agrega columna search_terms + RPC search_products_fuzzy.
-- Requiere: 01-extensions.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Si quedó la columna de intentos anteriores, sacarla.
ALTER TABLE products DROP COLUMN IF EXISTS competitor_aliases;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_terms TEXT;

-- Trigger que mantiene search_terms en sync con el resto de columnas.
CREATE OR REPLACE FUNCTION build_product_search_terms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_terms := lower(unaccent(
    coalesce(NEW.name, '')                                || ' ' ||
    coalesce(NEW.viscosity, '')                           || ' ' ||
    coalesce(NEW.technology, '')                          || ' ' ||
    coalesce(NEW.category, '')                            || ' ' ||
    coalesce(array_to_string(NEW.applications, ' '), '')
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_search_terms ON products;
CREATE TRIGGER trg_product_search_terms
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION build_product_search_terms();

-- Backfill: forzar el trigger en filas existentes.
-- Nota: `id` es GENERATED ALWAYS, no se puede usar acá. Usamos `name`.
UPDATE products SET name = name;

-- Índice GIN trigram (búsquedas <10ms hasta ~10k filas).
CREATE INDEX IF NOT EXISTS idx_products_search_trgm
  ON products USING gin (search_terms gin_trgm_ops);

-- RPC pública: búsqueda fuzzy con score.
CREATE OR REPLACE FUNCTION search_products_fuzzy(
  q TEXT,
  max_results INT DEFAULT 5
)
RETURNS TABLE (
  id INT,
  name TEXT,
  viscosity TEXT,
  technology TEXT,
  category TEXT,
  badge TEXT,
  score REAL
)
LANGUAGE sql STABLE AS $$
  WITH n AS (SELECT lower(unaccent(q)) AS nq)
  SELECT p.id, p.name, p.viscosity, p.technology, p.category, p.badge,
         GREATEST(
           similarity(p.search_terms, n.nq),
           CASE WHEN p.search_terms ILIKE '%' || n.nq || '%' THEN 0.5 ELSE 0 END
         ) AS score
  FROM products p, n
  WHERE p.search_terms % n.nq
     OR p.search_terms ILIKE '%' || n.nq || '%'
  ORDER BY score DESC NULLS LAST
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION search_products_fuzzy(TEXT, INT) TO service_role;
