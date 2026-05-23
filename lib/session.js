// ════════════════════════════════════════════════════════════════════════════
// Sesiones conversacionales por usuario + cache de allowlist de vendedores.
//
// Cambio post-Baileys: la clave de sesión ahora es `wa_phone` (sólo dígitos,
// ej: "595981234567") en vez de un JID con sufijo (`595XX@s.whatsapp.net`).
// Meta Cloud API entrega el número limpio en `wa_id`.
//
// La sesión vive en memoria. Para 5-10 vendedores con bajo volumen alcanza.
// Si se necesita persistencia (sobrevivir redeploys) → migrar a Supabase.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase.js';

// ─── Map de sesiones por wa_phone ───────────────────────────────────────────
export const sessions = new Map();

// TTL: limpiar sesiones inactivas por más de 15 minutos
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [waPhone, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(waPhone);
  }
}, 5 * 60 * 1000);

export function getSession(waPhone) {
  return sessions.get(waPhone) || {
    lastResults: null,
    lastAction: null,
    pedidoDraft: null,
    flowStep: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function setSession(waPhone, sessionUpdate) {
  const existing = sessions.get(waPhone);
  sessions.set(waPhone, {
    ...sessionUpdate,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now()
  });
}

export function clearSession(waPhone) {
  sessions.delete(waPhone);
}

// ─── Cache de vendedores autorizados (refresh cada 5 min) ──────────────────
let allowedCache = null;
let allowedLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Fallback a env var si la tabla está vacía o inaccesible (modo dev)
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
      console.warn('[isAllowed] no se pudo leer vendedores, usando fallback env:', error.message);
      allowedCache = ENV_FALLBACK ?? new Set();
    } else {
      allowedCache = new Set((data ?? []).map(v => v.telefono));
    }
    allowedLoadedAt = Date.now();
  } catch (err) {
    console.error('[isAllowed] error inesperado:', err.message);
    allowedCache = ENV_FALLBACK ?? new Set();
    allowedLoadedAt = Date.now();
  }
}

export async function isAllowed(waPhone) {
  if (!allowedCache || Date.now() - allowedLoadedAt > CACHE_TTL_MS) {
    await refreshAllowedCache();
  }
  // Si no hay vendedores cargados ni fallback, permite todo (modo dev)
  if (allowedCache.size === 0 && !ENV_FALLBACK) return true;
  return allowedCache.has(waPhone);
}

export async function getVendedor(waPhone) {
  const { data } = await supabase
    .from('vendedores')
    .select('telefono, nombre, categorias, ciudades')
    .eq('telefono', waPhone)
    .eq('activo', true)
    .single();
  return data ?? null;
}

export function invalidateAllowedCache() {
  allowedLoadedAt = 0;
}
