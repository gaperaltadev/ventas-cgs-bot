-- ════════════════════════════════════════════════════════════════════════════
-- SEED — Guía de lubricación para vehículos comunes en Paraguay
-- Requiere: 04-vehicle-guide.sql aplicado + catálogo con IDs 20–38
-- Idempotente: no, ejecutar UNA sola vez. Para re-cargar:
--   TRUNCATE vehicle_guide RESTART IDENTITY;
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO vehicle_guide
  (brand, model, year_from, year_to, engine_type, recommended_product_id, alternative_product_id, notes)
VALUES
  -- ── Autos nafta modernos · ELAION F10 5W-30 (20) ───────────────────────
  ('Toyota',     'Corolla',  2014, 2019, 'nafta', 20, 23,   'Motor 1.8L 2ZR-FE'),
  ('Toyota',     'Etios',    2012, 2024, 'nafta', 20, NULL, NULL),
  ('Toyota',     'Yaris',    2018, 2024, 'nafta', 20, 23,   NULL),
  ('Volkswagen', 'Polo',     2018, 2024, 'nafta', 20, 23,   NULL),
  ('Chevrolet',  'Onix',     2015, 2024, 'nafta', 20, NULL, NULL),
  ('Hyundai',    'HB20',     2014, 2024, 'nafta', 20, NULL, NULL),
  ('Hyundai',    'i10',      2014, 2024, 'nafta', 20, NULL, NULL),
  ('KIA',        'Picanto',  2014, 2024, 'nafta', 20, NULL, NULL),
  ('KIA',        'Rio',      2014, 2024, 'nafta', 20, NULL, NULL),
  ('Renault',    'Logan',    2014, 2024, 'nafta', 20, NULL, NULL),
  ('Nissan',     'March',    2014, 2024, 'nafta', 20, NULL, NULL),

  -- ── Autos nafta viejos · ELAION F10 10W-40 (21) ────────────────────────
  ('Volkswagen', 'Gol',          2008, 2018, 'nafta', 21, NULL, 'Motor con km alto, viscosidad mayor'),
  ('Chevrolet',  'Corsa Classic',2005, 2016, 'nafta', 21, NULL, NULL),
  ('Fiat',       'Palio',        2005, 2018, 'nafta', 21, NULL, NULL),
  ('Fiat',       'Uno',          2005, 2018, 'nafta', 21, NULL, NULL),

  -- ── Autos premium modernos · ELAION F30 5W-30 (23) ─────────────────────
  ('Toyota',     'Corolla',  2020, 2024, 'nafta', 23, 20,   'Spec ILSAC GF-6'),
  ('Honda',      'Fit',      2014, 2024, 'nafta', 23, 20,   NULL),
  ('Honda',      'Civic',    2016, 2024, 'nafta', 23, NULL, NULL),

  -- ── Autos sintético premium · ELAION F30 5W-40 (22) ────────────────────
  ('Honda',         'Civic Turbo', 2020, 2024, 'turbo', 22, NULL, 'Motor 1.5L turbo'),
  ('Mercedes-Benz', 'Clase A',     2018, 2024, 'nafta', 22, NULL, NULL),
  ('Audi',          'A3',          2018, 2024, 'nafta', 22, NULL, NULL),

  -- ── Top tier híbrido · ELAION F50 0W-20 (24) ───────────────────────────
  ('Toyota', 'Corolla Cross', 2021, 2024, 'hibrido', 24, NULL, 'Sistema híbrido HEV'),

  -- ── SUV/Camionetas nafta · ELAION SUV 5W-40 (25) ───────────────────────
  ('Toyota', 'RAV4',         2015, 2024, 'nafta', 25, NULL, NULL),
  ('Toyota', 'Land Cruiser', 2010, 2024, 'nafta', 25, NULL, NULL),
  ('Honda',  'CR-V',         2015, 2024, 'nafta', 25, NULL, NULL),

  -- ── Camionetas diesel · EXTRAVIDA DX 15W-40 (26) ───────────────────────
  ('Toyota',     'Hilux',    2016, 2024, 'diesel', 26, 27,   'Motor 1GD-FTV 2.8L'),
  ('Ford',       'Ranger',   2016, 2024, 'diesel', 26, NULL, NULL),
  ('Mitsubishi', 'L200',     2015, 2024, 'diesel', 26, NULL, NULL),
  ('Nissan',     'Frontier', 2017, 2024, 'diesel', 26, NULL, NULL),

  -- ── Diesel sintético · EXTRAVIDA ULTRA 10W-40 (27) ─────────────────────
  ('Volkswagen', 'Amarok', 2017, 2024, 'diesel', 27, 26, NULL),

  -- ── Motos enfriadas por aire · YPF RÖD 4T 20W-50 (30) ──────────────────
  ('Honda',  'CG 150',  2010, 2024, '4t', 30, 29,   'Motor refrigerado por aire'),
  ('Honda',  'XR 150',  2014, 2024, '4t', 30, NULL, NULL),
  ('Yamaha', 'YBR 125', 2010, 2024, '4t', 30, NULL, NULL),
  ('Yamaha', 'XTZ 125', 2010, 2024, '4t', 30, NULL, NULL),
  ('Yamaha', 'XTZ 150', 2014, 2024, '4t', 30, NULL, NULL),

  -- ── Motos 4T modernas · YPF RÖD 4T 10W-40 (29) ─────────────────────────
  ('Honda',  'Wave',   2014, 2024, '4t', 29, NULL, NULL),
  ('Yamaha', 'FZ',     2014, 2024, '4t', 29, NULL, NULL),
  ('Honda',  'CB 250', 2018, 2024, '4t', 29, NULL, NULL),

  -- ── Motos deportivas · YPF RÖD 4T 10W-50 (32) ──────────────────────────
  ('Bajaj',    'Pulsar 200 NS', 2014, 2024, '4t', 32, 29,   NULL),
  ('Bajaj',    'Pulsar RS 200', 2014, 2024, '4t', 32, NULL, NULL),
  ('Kawasaki', 'Ninja 300',     2014, 2024, '4t', 32, NULL, NULL),

  -- ── Motos 2T · YPF RÖD 2T (33) ─────────────────────────────────────────
  ('Yamaha', 'DT 175',  1990, 2010, '2t', 33, NULL, NULL),
  ('Suzuki', 'AX 100',  1990, 2015, '2t', 33, NULL, NULL);
