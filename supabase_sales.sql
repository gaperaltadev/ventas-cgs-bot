-- Ejecutar en Supabase > SQL Editor

CREATE TABLE IF NOT EXISTS sales (
  id           BIGSERIAL PRIMARY KEY,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  category     TEXT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  registered_by TEXT,  -- número de WhatsApp del vendedor (futuro)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: solo autenticados pueden insertar/leer
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_authenticated_all" ON sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- El bot usa service_role key → bypasea RLS → puede insertar sin auth
