// Búsqueda fuzzy de productos y guía de vehículos vía RPC de Supabase.
// Las RPC viven en sql/03-search-products.sql y sql/04-vehicle-guide.sql.

import { supabase } from './supabase.js';

const STOP_WORDS = new Set([
  'de','para','el','la','los','las','un','una','con','y','o',
  'aceite','lubricante','lubricantes'
]);

export function normalizeQuery(q) {
  return String(q || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w))
    .join(' ');
}

export function extractYear(text) {
  const m = String(text).match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0]) : null;
}

// ─── Búsqueda de productos ───────────────────────────────────────────────────
export async function buscarProductos(query, { max = 5 } = {}) {
  const q = normalizeQuery(query);
  if (!q) return { results: [], typo: false };

  const { data, error } = await supabase
    .rpc('search_products_fuzzy', { q, max_results: max });

  if (error) {
    console.error('[search] RPC error:', error.message);
    throw error;
  }

  const results = data ?? [];
  // Si todos los matches son por score < 0.4, probablemente fue typo
  const typo = results.length > 0 && results.every(r => r.score < 0.4);
  return { results, typo };
}

// ─── Guía de lubricación por vehículo ────────────────────────────────────────
export async function buscarGuiaVehiculo(query, { max = 3 } = {}) {
  const year = extractYear(query);
  const q = normalizeQuery(query.replace(/\b(19|20)\d{2}\b/g, ''));
  if (!q) return [];

  const { data, error } = await supabase
    .rpc('search_vehicle_guide', { q, year_query: year, max_results: max });

  if (error) {
    console.error('[guia] RPC error:', error.message);
    throw error;
  }
  return data ?? [];
}
