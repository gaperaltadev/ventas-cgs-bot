-- ════════════════════════════════════════════════════════════════════════════
-- 04 — Guía de lubricación por vehículo
-- Tabla + RPC search_vehicle_guide. Requiere: 01-extensions.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vehicle_guide (
  id                       SERIAL PRIMARY KEY,
  brand                    TEXT NOT NULL,
  model                    TEXT NOT NULL,
  year_from                INT,
  year_to                  INT,
  engine_type              TEXT,                              -- 'nafta','diesel','turbo','4t','2t','dual'
  recommended_product_id   INT REFERENCES products(id) ON DELETE SET NULL,
  alternative_product_id   INT REFERENCES products(id) ON DELETE SET NULL,
  notes                    TEXT,
  search_terms             TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION build_vehicle_search_terms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_terms := lower(unaccent(
    NEW.brand || ' ' ||
    NEW.model || ' ' ||
    coalesce(NEW.engine_type, '')
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_search ON vehicle_guide;
CREATE TRIGGER trg_vehicle_search
  BEFORE INSERT OR UPDATE ON vehicle_guide
  FOR EACH ROW EXECUTE FUNCTION build_vehicle_search_terms();

CREATE INDEX IF NOT EXISTS idx_vehicle_search_trgm
  ON vehicle_guide USING gin (search_terms gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicle_brand_model
  ON vehicle_guide (brand, model);

-- RLS: solo el service_role del bot puede leer/escribir.
-- (El bot usa SUPABASE_SERVICE_KEY, que bypasea RLS por diseño.
--  Esta política bloquea explícitamente las keys anon/authenticated.)
ALTER TABLE vehicle_guide ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_guide_service_role_only" ON vehicle_guide;
CREATE POLICY "vehicle_guide_service_role_only" ON vehicle_guide
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- RPC: búsqueda fuzzy por marca/modelo/año
CREATE OR REPLACE FUNCTION search_vehicle_guide(
  q TEXT,
  year_query INT DEFAULT NULL,
  max_results INT DEFAULT 3
)
RETURNS TABLE (
  id INT,
  brand TEXT,
  model TEXT,
  year_from INT,
  year_to INT,
  engine_type TEXT,
  recommended_product_id INT,
  recommended_name TEXT,
  alternative_product_id INT,
  alternative_name TEXT,
  notes TEXT,
  score REAL
)
LANGUAGE sql STABLE AS $$
  WITH normalized AS (SELECT lower(unaccent(q)) AS nq)
  SELECT g.id, g.brand, g.model, g.year_from, g.year_to, g.engine_type,
         g.recommended_product_id, pr.name AS recommended_name,
         g.alternative_product_id, pa.name AS alternative_name,
         g.notes,
         similarity(g.search_terms, n.nq) AS score
  FROM vehicle_guide g
  CROSS JOIN normalized n
  LEFT JOIN products pr ON pr.id = g.recommended_product_id
  LEFT JOIN products pa ON pa.id = g.alternative_product_id
  WHERE g.search_terms % n.nq
    AND (
      year_query IS NULL
      OR g.year_from IS NULL
      OR (year_query BETWEEN coalesce(g.year_from, 0) AND coalesce(g.year_to, 9999))
    )
  ORDER BY score DESC NULLS LAST,
           (g.year_to - g.year_from) ASC NULLS LAST   -- prefiere rangos más específicos
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION search_vehicle_guide(TEXT, INT, INT) TO service_role;

-- ──── Seed mínimo (ejemplos para arrancar) ─────────────────────────────────
-- Reemplazar IDs por los reales del catálogo. El panel admin puede gestionar esto.
-- INSERT INTO vehicle_guide (brand, model, year_from, year_to, engine_type, recommended_product_id, notes) VALUES
--   ('Toyota','Corolla',2014,2019,'nafta',  3, 'Motor 1.8L 2ZR-FE'),
--   ('Toyota','Hilux',  2016,2024,'diesel', 12,'Motor 1GD-FTV 2.8L'),
--   ('Volkswagen','Gol',2010,2020,'nafta',  4, NULL),
--   ('Honda','CG 150',  2012,2024,'4t',     7, 'Motor 4 tiempos refrigerado por aire');
