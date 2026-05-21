-- ════════════════════════════════════════════════════════════════════════════
-- 05 — Equivalencias con productos de la competencia
-- Permite que "/buscar helix" devuelva el equivalente YPF + el match exacto.
-- Una fila por equivalencia. Editable desde el panel admin como cualquier CRUD.
-- Requiere: 01-extensions.sql, 03-search-products.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_equivalents (
  id                   SERIAL PRIMARY KEY,
  product_id           INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  competitor_brand     TEXT NOT NULL,         -- 'Shell', 'Mobil', 'Castrol', 'Repsol'
  competitor_product   TEXT NOT NULL,         -- 'Helix HX7', 'Mobil Super 3000', 'GTX Magnatec'
  notes                TEXT,                  -- 'misma viscosidad', 'apto turbo', etc.
  search_terms         TEXT,                  -- normalizado (se calcula con trigger)
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, competitor_brand, competitor_product)
);

CREATE OR REPLACE FUNCTION build_equivalent_search_terms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_terms := lower(unaccent(
    NEW.competitor_brand || ' ' || NEW.competitor_product
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equiv_search_terms ON product_equivalents;
CREATE TRIGGER trg_equiv_search_terms
  BEFORE INSERT OR UPDATE ON product_equivalents
  FOR EACH ROW EXECUTE FUNCTION build_equivalent_search_terms();

CREATE INDEX IF NOT EXISTS idx_equiv_search_trgm
  ON product_equivalents USING gin (search_terms gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_equiv_product
  ON product_equivalents (product_id);

-- ─── RPC: reemplaza la versión simple de 03 con una que también busca en equivalents
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
  score REAL,
  matched_via TEXT,
  equivalent_brand TEXT,
  equivalent_product TEXT
)
LANGUAGE sql STABLE AS $$
  WITH n AS (SELECT lower(unaccent(q)) AS nq),

  -- Match directo en products
  direct_matches AS (
    SELECT p.id, p.name, p.viscosity, p.technology, p.category, p.badge,
           GREATEST(
             similarity(p.search_terms, n.nq),
             CASE WHEN p.search_terms ILIKE '%' || n.nq || '%' THEN 0.5 ELSE 0 END
           ) AS score,
           'direct'::TEXT AS matched_via,
           NULL::TEXT AS equivalent_brand,
           NULL::TEXT AS equivalent_product
    FROM products p, n
    WHERE p.search_terms % n.nq
       OR p.search_terms ILIKE '%' || n.nq || '%'
  ),

  -- Match por equivalencia con competencia
  equivalent_matches AS (
    SELECT p.id, p.name, p.viscosity, p.technology, p.category, p.badge,
           GREATEST(
             similarity(e.search_terms, n.nq),
             CASE WHEN e.search_terms ILIKE '%' || n.nq || '%' THEN 0.5 ELSE 0 END
           ) AS score,
           'equivalent'::TEXT  AS matched_via,
           e.competitor_brand  AS equivalent_brand,
           e.competitor_product AS equivalent_product
    FROM products p
    JOIN product_equivalents e ON e.product_id = p.id
    CROSS JOIN n
    WHERE e.search_terms % n.nq
       OR e.search_terms ILIKE '%' || n.nq || '%'
  ),

  -- Combinar y quedarse con el mejor score por producto
  combined AS (
    SELECT DISTINCT ON (id) *
    FROM (
      SELECT * FROM direct_matches
      UNION ALL
      SELECT * FROM equivalent_matches
    ) m
    ORDER BY id, score DESC NULLS LAST
  )

  SELECT * FROM combined
  ORDER BY score DESC NULLS LAST
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION search_products_fuzzy(TEXT, INT) TO service_role;

-- ──── Seed sugerido (ajustar a IDs reales del catálogo) ────────────────────
-- INSERT INTO product_equivalents (product_id, competitor_brand, competitor_product, notes) VALUES
--   (3, 'Shell',   'Helix HX7',         'misma viscosidad'),
--   (3, 'Mobil',   'Super 3000',        NULL),
--   (4, 'Shell',   'Helix Ultra',       'top tier sintético'),
--   (4, 'Castrol', 'Edge',              NULL),
--   (12,'Shell',   'Rimula R4',         'diesel pesado'),
--   (12,'Mobil',   'Delvac MX',         NULL),
--   (12,'Petronas','Urania',            NULL);
