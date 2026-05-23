-- ════════════════════════════════════════════════════════════════════════════
-- SEED DEMO — Datos para la presentación al jefe
--
-- Carga 4 vendedores, 8 clientes paraguayos creíbles, 12 pedidos repartidos
-- en los últimos 7 días, y algunas ventas anónimas. Suficiente para que los
-- comandos /ventas, /ranking, /mispedidos y el panel admin muestren actividad.
--
-- PRE-REQUISITO: productos con IDs 20-38 ya cargados.
-- Verificar con:  SELECT id, name FROM products WHERE id BETWEEN 20 AND 38;
--
-- IMPORTANTE — TELÉFONOS:
-- Los números de vendedores son placeholders (595981111111, etc.).
-- Antes de la demo, reemplazá los necesarios por números reales en la
-- tabla `vendedores` desde el panel admin, o editá este archivo y
-- re-ejecutalo. Si no, el bot no va a responder porque esos números
-- ficticios no existen en WhatsApp.
--
-- Idempotente: usa ON CONFLICT DO NOTHING en vendedores/clientes.
-- Los pedidos NO son idempotentes — re-ejecutar duplica.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Vendedores ────────────────────────────────────────────────────────────
INSERT INTO vendedores (telefono, nombre, categorias, ciudades, activo) VALUES
  ('595981111111', 'Carlos Méndez',    ARRAY['elaion','extravida','moto','otros'], ARRAY['Asunción','Luque'],         TRUE),
  ('595982222222', 'Roberto González', ARRAY['elaion','extravida'],                 ARRAY['Ciudad del Este'],          TRUE),
  ('595983333333', 'Ana López',        ARRAY['moto','elaion'],                       ARRAY['Encarnación'],              TRUE),
  ('595984444444', 'Diego Martínez',   ARRAY['elaion','extravida','otros'],          ARRAY['San Lorenzo','Capiatá'],   TRUE)
ON CONFLICT (telefono) DO NOTHING;

-- ─── Clientes ──────────────────────────────────────────────────────────────
-- IMPORTANTE: el primer cliente (000000000) es el "consumidor final" usado
-- en ventas de mostrador donde no hay RUC. Permite consolidar TODO registro
-- de venta en /pedido (decisión de MVD — descartamos /vender anónimo).
INSERT INTO clientes (ruc, razon_social, ciudad, contacto, telefono, notas, created_by) VALUES
  ('000000000', 'CONSUMIDOR FINAL',                'Asunción',          NULL,             NULL,         'Cliente genérico para ventas de mostrador sin RUC. NO editar/borrar.', '595981111111'),
  ('800123451', 'AUTOREPUESTOS SAN LORENZO SRL',  'San Lorenzo',       'Juan Pérez',     '021 588000', 'Cliente recurrente — pasa los martes',         '595981111111'),
  ('800234562', 'LUBRICENTRO EL ROBLE',            'Asunción',          'María Acuña',    '021 444000', 'Compra ELAION + filtros',                       '595981111111'),
  ('800345673', 'TRANSPORTES ASUNCIÓN NORTE SA',   'Mariano R. Alonso', 'Carlos Vera',    '021 776000', 'Flota de 12 camiones diesel — EXTRAVIDA cada 60 días', '595982222222'),
  ('800456784', 'ESTACIÓN DE SERVICIO MCAL LÓPEZ', 'Asunción',          'Pedro Ramírez',  '021 615000', 'Estación de servicio + lubricentro',            '595981111111'),
  ('800567895', 'SERVICIO MECÁNICO CABALLERO',     'Ciudad del Este',   'Luis Caballero', '061 502000', 'Especialista en camionetas Hilux',              '595982222222'),
  ('800678906', 'REPUESTOS LA ESTRELLA',           'Encarnación',       'Sandra Gómez',   '071 203000', 'Lubricante para motos principalmente',          '595983333333'),
  ('800789017', 'LUBRICENTRO DON PEDRO',           'Luque',             'Pedro Aguirre',  '021 645000', NULL,                                            '595981111111'),
  ('800890128', 'MAQUINARIA INDUSTRIAL ITACURUBÍ', 'Itacurubí',         'Roberto Núñez',  '0511 33000', 'Tractores agrícolas + hidráulico',              '595984444444')
ON CONFLICT (ruc) DO NOTHING;

-- ─── Pedidos pre-cargados ──────────────────────────────────────────────────
-- 12 pedidos distribuidos en los últimos 7 días para que /ventas semana,
-- /ranking y el panel admin tengan datos reales que mostrar.

-- Hoy
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800123451', '595981111111', 8, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 20, 'ELAION F10 5W-30',    5),
    (p_id, 26, 'EXTRAVIDA DX 15W-40', 3);
END $$;

DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800234562', '595981111111', 12, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 22, 'ELAION F30 5W-40',    4),
    (p_id, 25, 'ELAION SUV 5W-40',    6),
    (p_id, 35, 'KRIOX Refrigerante Rojo', 2);
END $$;

-- Ayer
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800345673', '595982222222', 30, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 26, 'EXTRAVIDA DX 15W-40', 24),
    (p_id, 27, 'EXTRAVIDA ULTRA 10W-40', 6);
END $$;

DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800456784', '595981111111', 15, NOW() - INTERVAL '1 day' - INTERVAL '3 hours', NOW() - INTERVAL '1 day' - INTERVAL '3 hours') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 20, 'ELAION F10 5W-30', 10),
    (p_id, 23, 'ELAION F30 5W-30', 5);
END $$;

-- Hace 2 días
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800567895', '595982222222', 7, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 26, 'EXTRAVIDA DX 15W-40', 4),
    (p_id, 25, 'ELAION SUV 5W-40',    3);
END $$;

DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800678906', '595983333333', 18, NOW() - INTERVAL '2 days' - INTERVAL '5 hours', NOW() - INTERVAL '2 days' - INTERVAL '5 hours') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 30, 'YPF RÖD 4T 20W-50', 8),
    (p_id, 29, 'YPF RÖD 4T 10W-40', 10);
END $$;

-- Hace 3 días
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800789017', '595981111111', 6, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 21, 'ELAION F10 10W-40', 6);
END $$;

DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800890128', '595984444444', 22, NOW() - INTERVAL '3 days' - INTERVAL '4 hours', NOW() - INTERVAL '3 days' - INTERVAL '4 hours') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 38, 'Hidráulico AW 68', 10),
    (p_id, 26, 'EXTRAVIDA DX 15W-40', 8),
    (p_id, 37, 'Grasa EP2 Multipropósito', 4);
END $$;

-- Hace 4 días
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800234562', '595981111111', 9, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 22, 'ELAION F30 5W-40', 6),
    (p_id, 36, 'Líquido de Frenos DOT 4', 3);
END $$;

-- Hace 5 días
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800345673', '595982222222', 36, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 26, 'EXTRAVIDA DX 15W-40', 30),
    (p_id, 28, 'EXTRAVIDA MAXIMO 10W-40', 6);
END $$;

-- Hace 6 días
DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800123451', '595981111111', 11, NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 20, 'ELAION F10 5W-30', 8),
    (p_id, 35, 'KRIOX Refrigerante Rojo', 3);
END $$;

DO $$ DECLARE p_id BIGINT;
BEGIN
  INSERT INTO pedidos (cliente_ruc, vendedor_telefono, total_unidades, created_at, confirmed_at)
  VALUES ('800678906', '595983333333', 14, NOW() - INTERVAL '6 days' - INTERVAL '6 hours', NOW() - INTERVAL '6 days' - INTERVAL '6 hours') RETURNING id INTO p_id;
  INSERT INTO pedido_items (pedido_id, product_id, product_name, quantity) VALUES
    (p_id, 30, 'YPF RÖD 4T 20W-50', 6),
    (p_id, 31, 'YPF RÖD 4T 10W-30', 5),
    (p_id, 33, 'YPF RÖD 2T', 3);
END $$;

-- ─── Ventas anónimas (/vender de mostrador) ───────────────────────────────
-- Algunas ventas sin cliente para que /ventas hoy y /ranking también
-- muestren actividad del comando /vender (no solo /pedido).

INSERT INTO sales (product_id, product_name, category, quantity, created_at) VALUES
  (20, 'ELAION F10 5W-30',         'elaion',    2, NOW() - INTERVAL '1 hour'),
  (30, 'YPF RÖD 4T 20W-50',        'moto',      1, NOW() - INTERVAL '3 hours'),
  (26, 'EXTRAVIDA DX 15W-40',      'extravida', 1, NOW() - INTERVAL '6 hours'),
  (35, 'KRIOX Refrigerante Rojo',  'otros',     2, NOW() - INTERVAL '1 day' + INTERVAL '8 hours'),
  (22, 'ELAION F30 5W-40',         'elaion',    1, NOW() - INTERVAL '2 days' + INTERVAL '11 hours'),
  (37, 'Grasa EP2 Multipropósito', 'otros',     3, NOW() - INTERVAL '4 days' + INTERVAL '14 hours');

-- ─── Verificación post-seed ────────────────────────────────────────────────
-- Ejecutar estos queries para confirmar que todo se cargó bien:

-- SELECT count(*) FROM vendedores WHERE activo = TRUE;        -- esperado: 4 (o más si ya había)
-- SELECT count(*) FROM clientes;                              -- esperado: 8 (o más)
-- SELECT count(*) FROM pedidos WHERE created_at > NOW() - INTERVAL '7 days';  -- 12
-- SELECT count(*) FROM sales WHERE created_at > NOW() - INTERVAL '7 days';    -- 6

-- Ver el ranking que el bot devolvería:
-- SELECT product_name, SUM(quantity) AS total
-- FROM (
--   SELECT product_name, quantity FROM pedido_items
--   UNION ALL
--   SELECT product_name, quantity FROM sales WHERE created_at > NOW() - INTERVAL '7 days'
-- ) t GROUP BY product_name ORDER BY total DESC LIMIT 5;
