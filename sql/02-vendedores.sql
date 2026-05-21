-- ════════════════════════════════════════════════════════════════════════════
-- 02 — Tabla de vendedores
-- Reemplaza ALLOWED_NUMBERS en .env. Permite asignar territorios/categorías
-- para notificaciones segmentadas (FASE 3).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendedores (
  telefono     TEXT PRIMARY KEY,                       -- "595981234567" sin @
  nombre       TEXT NOT NULL,
  categorias   TEXT[] NOT NULL DEFAULT '{}',           -- ['elaion','extravida','moto','otros']
  ciudades     TEXT[] DEFAULT '{}',
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendedores_activos
  ON vendedores (activo) WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_vendedores_categorias
  ON vendedores USING gin (categorias);

-- RLS: solo el service_role del bot puede leer/escribir
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedores_service_role_all" ON vendedores;
CREATE POLICY "vendedores_service_role_all" ON vendedores
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
-- El bot usa service_role, que bypasea RLS por defecto.

-- Seed inicial: cargá tus vendedores acá (reemplazar con datos reales)
-- INSERT INTO vendedores (telefono, nombre, categorias, ciudades) VALUES
--   ('595986398117', 'Gabriel',  ARRAY['elaion','extravida','moto','otros'], ARRAY['Asuncion']),
--   ('595984816329', 'Vendedor 2', ARRAY['elaion','moto'], ARRAY['San Lorenzo']);
