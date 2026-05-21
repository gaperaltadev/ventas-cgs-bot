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
--
-- Requiere: 02-vendedores.sql, 04-vehicle-guide.sql, 06-clientes.sql,
--           07-pedidos.sql aplicados previamente.
-- ════════════════════════════════════════════════════════════════════════════

-- Aplica políticas solo sobre las tablas que existen.
-- Si alguna falta, se omite con NOTICE en vez de fallar la migración.
DO $$
DECLARE
  tbl TEXT;
  pol TEXT;
  tables_policies CONSTANT TEXT[][] := ARRAY[
    ['vendedores',     'vendedores_authenticated_all'],
    ['clientes',       'clientes_authenticated_all'],
    ['pedidos',        'pedidos_authenticated_all'],
    ['pedido_items',   'pedido_items_authenticated_all'],
    ['vehicle_guide',  'vehicle_guide_authenticated_all']
  ];
  old_policies CONSTANT TEXT[][] := ARRAY[
    ['vendedores',     'vendedores_service_role_all'],
    ['clientes',       'clientes_service_role_only'],
    ['pedidos',        'pedidos_service_role_only'],
    ['pedido_items',   'pedido_items_service_role_only'],
    ['vehicle_guide',  'vehicle_guide_service_role_only']
  ];
BEGIN
  -- Drop políticas antiguas (restrictivas)
  FOR i IN 1 .. array_length(old_policies, 1) LOOP
    tbl := old_policies[i][1];
    pol := old_policies[i][2];
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
    END IF;
  END LOOP;

  -- Crear/reemplazar políticas nuevas (permisivas para authenticated)
  FOR i IN 1 .. array_length(tables_policies, 1) LOOP
    tbl := tables_policies[i][1];
    pol := tables_policies[i][2];
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        pol, tbl
      );
      RAISE NOTICE 'Politica % aplicada en tabla %', pol, tbl;
    ELSE
      RAISE NOTICE 'Tabla % no existe — saltada. Ejecutar la migracion correspondiente primero.', tbl;
    END IF;
  END LOOP;
END $$;

-- ─── Permisos sobre la vista y RPCs (solo si existen) ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'pedidos_resumen') THEN
    GRANT SELECT ON pedidos_resumen TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_products_fuzzy') THEN
    GRANT EXECUTE ON FUNCTION search_products_fuzzy(TEXT, INT) TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_vehicle_guide') THEN
    GRANT EXECUTE ON FUNCTION search_vehicle_guide(TEXT, INT, INT) TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_clientes_fuzzy') THEN
    GRANT EXECUTE ON FUNCTION search_clientes_fuzzy(TEXT, INT) TO authenticated;
  END IF;
END $$;
