-- ════════════════════════════════════════════════════════════════════════════
-- 09 — Presentaciones de productos y precios
--
-- Introduce:
--   · product_presentations  → variantes vendibles de cada producto con precio USD
--   · exchange_rates         → tipo de cambio USD→PYG actualizable vía n8n
--
-- También extiende pedido_items para registrar snapshot de presentación y precio.
-- Actualiza la RPC crear_pedido para aceptar los nuevos campos.
--
-- Requiere: 07-pedidos.sql
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Presentaciones por producto ─────────────────────────────────────────
-- Cada fila es una variante vendible: "Balde 20L", "Bidón 4L", "Botella 1L".
-- price_usd puede ser NULL si el precio aún no fue cargado.
CREATE TABLE IF NOT EXISTS product_presentations (
  id          SERIAL PRIMARY KEY,
  product_id  INT          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label       TEXT         NOT NULL,          -- "Balde 20L", "Bidón 4L", "Botella 1L"
  price_usd   NUMERIC(10,2),                  -- NULL = sin precio cargado aún
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, label)                  -- sin duplicados por producto
);

CREATE INDEX IF NOT EXISTS idx_presentations_product
  ON product_presentations (product_id, sort_order);

-- RLS: solo service_role
ALTER TABLE product_presentations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presentations_service_role_only" ON product_presentations;
CREATE POLICY "presentations_service_role_only" ON product_presentations
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ─── 2. Tipo de cambio USD → PYG ────────────────────────────────────────────
-- Una fila por moneda. Se actualiza vía n8n (workflow diario desde BCP).
-- Si la tabla está vacía o el rate tiene más de 24h, el bot muestra USD sin convertir.
CREATE TABLE IF NOT EXISTS exchange_rates (
  currency    TEXT        PRIMARY KEY,        -- 'USD' por ahora
  rate_pyg    NUMERIC(12,2) NOT NULL,         -- 1 USD = X PYG
  source      TEXT        NOT NULL DEFAULT 'manual',  -- 'bcp', 'manual', 'api'
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: service_role para escritura, cualquier rol autenticado para lectura
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exchange_rates_write" ON exchange_rates;
CREATE POLICY "exchange_rates_write" ON exchange_rates
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ─── 3. Extender pedido_items con snapshot de presentación y precio ──────────
-- Los campos ya existen como NULL en el schema anterior — se agregan solo si faltan.
-- NOTA: unit_price_pyg NO se almacena — es dato derivado (unit_price_usd × exchange_rate).
--       PYG se computa siempre en tiempo de display desde el caché de tasa en Node.js.
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS presentation_id    INT          REFERENCES product_presentations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS presentation_label TEXT,        -- snapshot: "Balde 20L"
  ADD COLUMN IF NOT EXISTS unit_price_usd     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS exchange_rate      NUMERIC(12,2); -- tasa al momento del pedido (audit trail)

-- ─── 4. Actualizar RPC crear_pedido para aceptar presentación y precios ──────
CREATE OR REPLACE FUNCTION crear_pedido(
  p_cliente_ruc       TEXT,
  p_vendedor_telefono TEXT,
  p_notas             TEXT,
  p_items             JSONB   -- [{product_id, product_name, presentation_id?,
                               --   presentation_label?, quantity,
                               --   unit_price_usd?, unit_price_pyg?, exchange_rate?}]
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_pedido_id        BIGINT;
  v_item             JSONB;
  v_total_unidades   INT          := 0;
  v_total_monto_pyg  NUMERIC(12,2):= 0;
BEGIN
  -- Validar cliente y vendedor
  PERFORM 1 FROM clientes  WHERE ruc      = p_cliente_ruc;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_existe: %', p_cliente_ruc; END IF;

  PERFORM 1 FROM vendedores WHERE telefono = p_vendedor_telefono AND activo = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vendedor_no_autorizado: %', p_vendedor_telefono; END IF;

  -- Crear pedido
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, notas, estado, confirmed_at)
  VALUES (p_cliente_ruc, p_vendedor_telefono, p_notas, 'confirmado', NOW())
  RETURNING id INTO v_pedido_id;

  -- Insertar items
  -- unit_price y subtotal (columnas legacy) se llenan en USD para consistencia.
  -- PYG se computa siempre en display: unit_price_usd × exchange_rate del item.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO pedido_items (
      pedido_id, product_id, product_name, quantity,
      presentation_id, presentation_label,
      unit_price_usd, exchange_rate,
      unit_price, subtotal
    ) VALUES (
      v_pedido_id,
      (v_item->>'product_id')::INT,
      v_item->>'product_name',
      (v_item->>'quantity')::INT,
      NULLIF(v_item->>'presentation_id', '')::INT,
      v_item->>'presentation_label',
      NULLIF(v_item->>'unit_price_usd', '')::NUMERIC,
      NULLIF(v_item->>'exchange_rate',  '')::NUMERIC,
      -- unit_price / subtotal legacy: en USD (misma fuente de verdad)
      NULLIF(v_item->>'unit_price_usd', '')::NUMERIC,
      NULLIF(v_item->>'unit_price_usd', '')::NUMERIC * (v_item->>'quantity')::INT
    );
    v_total_unidades  := v_total_unidades  + (v_item->>'quantity')::INT;
    v_total_monto_pyg := v_total_monto_pyg
      + COALESCE(NULLIF(v_item->>'unit_price_usd','')::NUMERIC, 0)
        * (v_item->>'quantity')::INT;
  END LOOP;

  -- total_monto se guarda en USD — PYG se computa en display
  UPDATE pedidos
  SET total_unidades = v_total_unidades,
      total_monto    = NULLIF(v_total_monto_pyg, 0)
  WHERE id = v_pedido_id;

  RETURN v_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_pedido(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ─── 5. Cliente CONSUMIDOR FINAL ────────────────────────────────────────────
-- RUC fijo. Todos los pedidos sin cliente identificado usan este registro.
INSERT INTO clientes (ruc, razon_social, notas)
VALUES ('00000000-0', 'CONSUMIDOR FINAL', 'Cliente genérico — ventas sin RUC identificado')
ON CONFLICT (ruc) DO NOTHING;

-- ─── 6. Helper: tipo de cambio vigente ──────────────────────────────────────
-- Devuelve el rate activo. Si no hay rate o tiene más de 48h → devuelve NULL.
-- El bot muestra solo USD cuando recibe NULL (no rompe el flujo).
CREATE OR REPLACE FUNCTION get_exchange_rate(p_currency TEXT DEFAULT 'USD')
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
  SELECT rate_pyg
  FROM   exchange_rates
  WHERE  currency   = p_currency
    AND  updated_at > NOW() - INTERVAL '48 hours'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_exchange_rate(TEXT) TO service_role;
