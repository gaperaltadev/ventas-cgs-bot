// Estado in-memory: sesiones de conversación + cache de vendedores autorizados.

import { supabase } from './supabase.js';

// ─── Sesiones por usuario ────────────────────────────────────────────────────
export const sessions = new Map();

// TTL: limpiar sesiones inactivas por más de 15 minutos
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [jid, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(jid);
  }
}, 5 * 60 * 1000);

// ─── Whitelist de vendedores (lee desde DB con cache 5min) ───────────────────
let allowedCache = null;     // null = aún no cargado
let allowedLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Fallback a env var si la tabla aún no existe / no hay vendedores cargados
const ENV_FALLBACK = process.env.ALLOWED_NUMBERS
  ? new Set(process.env.ALLOWED_NUMBERS.split(',').map(n => n.trim()).filter(Boolean))
  : null;

async function refreshAllowedCache() {
  try {
    const { data, error } = await supabase
      .from('vendedores')
      .select('telefono')
      .eq('activo', true);

    if (error) {
      // Tabla no existe todavía o error de DB → usar fallback
      console.warn('[isAllowed] No se pudo leer vendedores, usando fallback env:', error.message);
      allowedCache = ENV_FALLBACK ?? new Set();
    } else {
      allowedCache = new Set((data ?? []).map(v => v.telefono));
    }
    allowedLoadedAt = Date.now();
  } catch (err) {
    console.error('[isAllowed] Error inesperado:', err.message);
    allowedCache = ENV_FALLBACK ?? new Set();
    allowedLoadedAt = Date.now();
  }
}

export async function isAllowed(jid) {
  if (!allowedCache || Date.now() - allowedLoadedAt > CACHE_TTL_MS) {
    await refreshAllowedCache();
  }
  // Si no hay vendedores cargados ni fallback, permite todo (modo dev)
  if (allowedCache.size === 0 && !ENV_FALLBACK) return true;
  const number = jid.split('@')[0];
  return allowedCache.has(number);
}

export async function getVendedor(jid) {
  const number = jid.split('@')[0];
  const { data } = await supabase
    .from('vendedores')
    .select('telefono, nombre, categorias, ciudades')
    .eq('telefono', number)
    .eq('activo', true)
    .single();
  return data ?? null;
}

// Forzar refresh manual (útil para tests o cuando se carga un vendedor nuevo)
export function invalidateAllowedCache() {
  allowedLoadedAt = 0;
}
