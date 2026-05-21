-- ════════════════════════════════════════════════════════════════════════════
-- 03 — Búsqueda fuzzy de productos
-- Agrega columna search_terms + competitor_aliases + RPC search_products_fuzzy
-- Requiere: 01-extensions.sql
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS search_terms TEXT,
  ADD COLUMN IF NOT EXISTS competitor_aliases TEXT[] DEFAULT '{}';

-- Trigger que mantiene search_terms en sync con el resto de columnas
CREATE OR REPLACE FUNCTION build_product_search_terms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_terms := lower(unaccent(
    coalesce(NEW.name, '')                                || ' ' ||
    coalesce(NEW.viscosity, '')                           || ' ' ||
    coalesce(NEW.technology, '')                          || ' ' ||
    coalesce(NEW.category, '')                            || ' ' ||
    coalesce(array_to_string(NEW.applications, ' '), '')  || ' ' ||
    coalesce(array_to_string(NEW.competitor_aliases, ' '), '')
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_search_terms ON products;
CREATE TRIGGER trg_product_search_terms
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION build_product_search_terms();

-- Backfill: forzar el trigger en filas existentes
UPDATE products SET id = id;

-- Índice GIN trigram para búsqueda <10ms
CREATE INDEX IF NOT EXISTS idx_products_search_trgm
  ON products USING gin (search_terms gin_trgm_ops);

-- RPC pública: única función llamada desde Node
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
  WITH normalized AS (SELECT lower(unaccent(q)) AS nq)
  SELECT p.id, p.name, p.viscosity, p.technology, p.category, p.badge,
         GREATEST(
           similarity(p.search_terms, n.nq),
           CASE WHEN p.search_terms ILIKE '%' || n.nq || '%' THEN 0.5 ELSE 0 END
         ) AS score
  FROM products p, normalized n
  WHERE p.search_terms % n.nq
     OR p.search_terms ILIKE '%' || n.nq || '%'
  ORDER BY score DESC NULLS LAST
  LIMIT max_results;
$$;

-- Permisos: la función puede ser llamada por el service_role del bot
GRANT EXECUTE ON FUNCTION search_products_fuzzy(TEXT, INT) TO service_role;

-- ──── Aliases de competencia (carga inicial sugerida) ──────────────────────
-- Ajustar según el catálogo real. El admin puede mantener esto vía panel web.
-- UPDATE products SET competitor_aliases = ARRAY['shell helix','helix hx7','mobil super']
--   WHERE name ILIKE '%ELAION F10%';
-- UPDATE products SET competitor_aliases = ARRAY['shell helix ultra','mobil 1','castrol edge']
--   WHERE name ILIKE '%ELAION F30%';
-- UPDATE products SET competitor_aliases = ARRAY['rimula','delvac','urania']
--   WHERE category = 'extravida';
