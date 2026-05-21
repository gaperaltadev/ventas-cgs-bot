-- ════════════════════════════════════════════════════════════════════════════
-- 06 — Clientes
-- Tabla de clientes identificados por RUC. Soporta búsqueda fuzzy por nombre
-- y ciudad usando pg_trgm.
-- Requiere: 01-extensions.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clientes (
  ruc            TEXT PRIMARY KEY,                            -- formato PY: '80012345-1' o sin guión
  razon_social   TEXT NOT NULL,
  ciudad         TEXT,
  contacto       TEXT,                                        -- nombre persona de contacto
  telefono       TEXT,
  notas          TEXT,
  search_terms   TEXT,                                        -- se calcula con trigger
  created_by     TEXT REFERENCES vendedores(telefono),        -- quién lo dio de alta
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION build_cliente_search_terms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_terms := regexp_replace(
    lower(unaccent(
      coalesce(NEW.ruc, '')          || ' ' ||
      coalesce(NEW.razon_social, '') || ' ' ||
      coalesce(NEW.ciudad, '')       || ' ' ||
      coalesce(NEW.contacto, '')
    )),
    '-', '', 'g'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cliente_search ON clientes;
CREATE TRIGGER trg_cliente_search
  BEFORE INSERT OR UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION build_cliente_search_terms();

CREATE INDEX IF NOT EXISTS idx_clientes_search_trgm
  ON clientes USING gin (search_terms gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clientes_created_by
  ON clientes (created_by);

-- RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_service_role_only" ON clientes;
CREATE POLICY "clientes_service_role_only" ON clientes
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- RPC para búsqueda fuzzy (incluye match exacto por RUC para atajos)
CREATE OR REPLACE FUNCTION search_clientes_fuzzy(
  q TEXT,
  max_results INT DEFAULT 5
)
RETURNS TABLE (
  ruc TEXT,
  razon_social TEXT,
  ciudad TEXT,
  score REAL
)
LANGUAGE sql STABLE AS $$
  WITH
  norm AS (
    SELECT
      regexp_replace(
        regexp_replace(lower(unaccent(q)), '-', '', 'g'),
        '[^a-z0-9 ]', ' ', 'g'
      ) AS nq
  )
  SELECT c.ruc, c.razon_social, c.ciudad,
         GREATEST(
           similarity(c.search_terms, n.nq),
           CASE WHEN c.search_terms ILIKE '%' || n.nq || '%' THEN 0.7 ELSE 0 END
         ) AS score
  FROM clientes c
  CROSS JOIN norm n
  WHERE c.search_terms ILIKE '%' || n.nq || '%'
     OR similarity(c.search_terms, n.nq) > 0.25
  ORDER BY score DESC NULLS LAST
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION search_clientes_fuzzy(TEXT, INT) TO service_role;
