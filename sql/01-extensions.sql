-- ════════════════════════════════════════════════════════════════════════════
-- 01 — Extensiones de Postgres requeridas
-- Idempotente. Ejecutar una sola vez en Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- similitud por trigramas (fuzzy search)
CREATE EXTENSION IF NOT EXISTS unaccent;    -- normalización de acentos
