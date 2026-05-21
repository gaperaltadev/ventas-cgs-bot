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

-- RPC pública: búsqueda fuzzy por tokens.
-- Estrategia: separa la query en palabras, busca cada token, y devuelve
-- los productos que matchean MÁS tokens (con score promedio como tiebreak).
-- Esto maneja bien typos en queries multi-palabra como "elaiom 5w30".
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
  WITH
  -- 1. Tokenizar la query (descarta palabras de 1 char)
  tokens AS (
    SELECT DISTINCT tok
    FROM unnest(
      string_to_array(
        regexp_replace(lower(unaccent(q)), '[^a-z0-9 ]', ' ', 'g'),
        ' '
      )
    ) AS tok
    WHERE length(tok) > 1
  ),

  -- 2. Por cada (producto, token), calcular score
  matches AS (
    SELECT
      p.id,
      t.tok,
      GREATEST(
        similarity(p.search_terms, t.tok),
        CASE WHEN p.search_terms ILIKE '%' || t.tok || '%' THEN 0.6 ELSE 0 END
      ) AS token_score
    FROM products p
    CROSS JOIN tokens t
    WHERE p.search_terms ILIKE '%' || t.tok || '%'
       OR similarity(p.search_terms, t.tok) > 0.25
  ),

  -- 3. Agregar por producto
  ranked AS (
    SELECT
      m.id,
      COUNT(*)::INT             AS tokens_matched,
      AVG(m.token_score)::REAL  AS avg_score
    FROM matches m
    GROUP BY m.id
  )

  SELECT p.id, p.name, p.viscosity, p.technology, p.category, p.badge,
         r.avg_score AS score
  FROM products p
  JOIN ranked r ON r.id = p.id
  -- Requiere que matchee al menos la mayoría de los tokens
  WHERE r.tokens_matched >= GREATEST(1, (SELECT count(*) FROM tokens) - 1)
  ORDER BY r.tokens_matched DESC, r.avg_score DESC
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION search_products_fuzzy(TEXT, INT) TO service_role;
