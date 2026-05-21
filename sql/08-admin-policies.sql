-- ════════════════════════════════════════════════════════════════════════════
-- 08 — Políticas RLS para el panel admin
--
-- Permite a usuarios autenticados (Supabase Auth) leer/escribir las tablas
-- de administración desde el frontend. El service_role del bot sigue
-- bypaseando RLS como antes.
--
-- IMPORTANTE: Esto implica que CUALQUIER usuario autenticado puede hacer
-- CRUD en estas tablas. Supabase Auth está controlado: solo el admin
-- tiene cuenta, y el sign-up debe estar deshabilitado en la dashboard.
--
-- Para verificar: Supabase → Authentication → Providers → Email →
-- "Enable email signups" debe estar OFF.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── vendedores ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vendedores_service_role_all" ON vendedores;
DROP POLICY IF EXISTS "vendedores_authenticated_all" ON vendedores;
CREATE POLICY "vendedores_authenticated_all" ON vendedores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── clientes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clientes_service_role_only" ON clientes;
DROP POLICY IF EXISTS "clientes_authenticated_all" ON clientes;
CREATE POLICY "clientes_authenticated_all" ON clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── pedidos ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pedidos_service_role_only" ON pedidos;
DROP POLICY IF EXISTS "pedidos_authenticated_all" ON pedidos;
CREATE POLICY "pedidos_authenticated_all" ON pedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── pedido_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pedido_items_service_role_only" ON pedido_items;
DROP POLICY IF EXISTS "pedido_items_authenticated_all" ON pedido_items;
CREATE POLICY "pedido_items_authenticated_all" ON pedido_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── vehicle_guide ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicle_guide_service_role_only" ON vehicle_guide;
DROP POLICY IF EXISTS "vehicle_guide_authenticated_all" ON vehicle_guide;
CREATE POLICY "vehicle_guide_authenticated_all" ON vehicle_guide
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── La vista pedidos_resumen necesita permitir SELECT a authenticated ────
GRANT SELECT ON pedidos_resumen TO authenticated;

-- ─── Las RPCs de búsqueda fuzzy también ────────────────────────────────────
GRANT EXECUTE ON FUNCTION search_products_fuzzy(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_vehicle_guide(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_clientes_fuzzy(TEXT, INT) TO authenticated;
