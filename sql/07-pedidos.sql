-- ════════════════════════════════════════════════════════════════════════════
-- 07 — Pedidos
-- Pedidos vinculados a clientes, con sus items. RPC transaccional para
-- crear pedido + items en una sola operación.
-- Requiere: 06-clientes.sql, 02-vendedores.sql, 03-search-products.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pedidos (
  id                  BIGSERIAL PRIMARY KEY,
  cliente_ruc         TEXT NOT NULL REFERENCES clientes(ruc),
  vendedor_telefono   TEXT NOT NULL REFERENCES vendedores(telefono),
  estado              TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (estado IN ('pendiente', 'confirmado', 'entregado', 'cancelado')),
  notas               TEXT,
  total_unidades      INT,
  total_monto         NUMERIC(12,2),                          -- por ahora NULL (sin precios)
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor_fecha
  ON pedidos (vendedor_telefono, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente
  ON pedidos (cliente_ruc, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_fecha
  ON pedidos (created_at DESC);

CREATE TABLE IF NOT EXISTS pedido_items (
  id              BIGSERIAL PRIMARY KEY,
  pedido_id       BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  product_id      INT REFERENCES products(id) ON DELETE SET NULL,
  product_name    TEXT NOT NULL,                              -- snapshot al momento del pedido
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2),                              -- por ahora NULL
  subtotal        NUMERIC(12,2)
);

CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido
  ON pedido_items (pedido_id);

CREATE INDEX IF NOT EXISTS idx_pedido_items_product
  ON pedido_items (product_id);

-- RLS
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_service_role_only" ON pedidos;
CREATE POLICY "pedidos_service_role_only" ON pedidos
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "pedido_items_service_role_only" ON pedido_items;
CREATE POLICY "pedido_items_service_role_only" ON pedido_items
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ─── RPC: crear pedido transaccionalmente ─────────────────────────────────
-- Crea el pedido y todos sus items en una sola transacción. Si cualquier
-- item falla, se hace rollback automático.
CREATE OR REPLACE FUNCTION crear_pedido(
  p_cliente_ruc       TEXT,
  p_vendedor_telefono TEXT,
  p_notas             TEXT,
  p_items             JSONB                                  -- [{product_id, product_name, quantity}, ...]
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_pedido_id        BIGINT;
  v_item             JSONB;
  v_total_unidades   INT := 0;
BEGIN
  -- Validar que el cliente y el vendedor existen (lanza si no)
  PERFORM 1 FROM clientes WHERE ruc = p_cliente_ruc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_existe: %', p_cliente_ruc;
  END IF;

  PERFORM 1 FROM vendedores WHERE telefono = p_vendedor_telefono AND activo = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendedor_no_autorizado: %', p_vendedor_telefono;
  END IF;

  -- Crear el pedido
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, notas, estado, confirmed_at)
  VALUES (p_cliente_ruc, p_vendedor_telefono, p_notas, 'confirmado', NOW())
  RETURNING id INTO v_pedido_id;

  -- Insertar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity)
    VALUES (
      v_pedido_id,
      (v_item->>'product_id')::INT,
      v_item->>'product_name',
      (v_item->>'quantity')::INT
    );
    v_total_unidades := v_total_unidades + (v_item->>'quantity')::INT;
  END LOOP;

  -- Actualizar totales
  UPDATE pedidos
  SET total_unidades = v_total_unidades
  WHERE id = v_pedido_id;

  RETURN v_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_pedido(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ─── Vista de conveniencia: pedidos con resumen ───────────────────────────
CREATE OR REPLACE VIEW pedidos_resumen AS
SELECT
  p.id,
  p.estado,
  p.created_at,
  p.confirmed_at,
  p.cliente_ruc,
  c.razon_social,
  c.ciudad,
  p.vendedor_telefono,
  v.nombre AS vendedor_nombre,
  p.total_unidades,
  p.notas,
  COUNT(pi.id) AS num_items
FROM pedidos p
LEFT JOIN clientes c   ON c.ruc = p.cliente_ruc
LEFT JOIN vendedores v ON v.telefono = p.vendedor_telefono
LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
GROUP BY p.id, c.ruc, v.telefono;

GRANT SELECT ON pedidos_resumen TO service_role;
