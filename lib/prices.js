// ════════════════════════════════════════════════════════════════════════════
// Caché de tipo de cambio USD → PYG + helpers de formato de precios.
//
// Fuente de verdad: tabla exchange_rates en Supabase.
// Actualización externa: n8n workflow diario desde BCP.
//
// Estrategia de caché:
//   · TTL 30 minutos en memoria (cubre un turno de ventas completo)
//   · Si el refresh falla → usa la última tasa conocida (no rompe el flujo)
//   · Si nunca cargó → devuelve null → el bot muestra solo USD
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase.js';

const CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutos

let cachedRate = null;   // NUMERIC — tasa PYG por 1 USD
let cachedAt   = 0;      // timestamp del último refresh exitoso

// ─── Tasa de cambio ──────────────────────────────────────────────────────────

/**
 * Devuelve la tasa de cambio USD→PYG vigente.
 * Refresca desde Supabase si el caché expiró.
 * @returns {Promise<number|null>}  null si no hay tasa disponible
 */
export async function getExchangeRate() {
  if (cachedRate && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const { data, error } = await supabase
      .rpc('get_exchange_rate', { p_currency: 'USD' });

    if (error) {
      console.warn('[prices] error al leer tasa:', error.message);
    } else if (data) {
      cachedRate = Number(data);
      cachedAt   = Date.now();
      console.log(`[prices] tasa actualizada: 1 USD = Gs ${cachedRate.toLocaleString('es-PY')}`);
    }
  } catch (err) {
    console.warn('[prices] excepción al refrescar tasa:', err.message);
  }

  return cachedRate;  // null si nunca cargó, o la última conocida si el refresh falló
}

/** Fuerza un refresh en el próximo uso (útil tras actualizar la tasa manualmente). */
export function invalidateRateCache() {
  cachedAt = 0;
}

// ─── Helpers de cálculo ──────────────────────────────────────────────────────

/**
 * Convierte USD a PYG usando la tasa vigente del caché.
 * @param {number} usd
 * @returns {Promise<number|null>}  null si no hay tasa
 */
export async function toPyg(usd) {
  if (!usd && usd !== 0) return null;
  const rate = await getExchangeRate();
  if (!rate) return null;
  return Math.round(usd * rate);
}

// ─── Helpers de formato ──────────────────────────────────────────────────────

/**
 * Formatea un monto en PYG con separador de miles.
 * @param {number} amount
 * @returns {string}  ej: "Gs 337.500"
 */
export function formatPyg(amount) {
  return `Gs ${Math.round(amount).toLocaleString('es-PY')}`;
}

/**
 * Formatea un precio USD con su equivalente en PYG si hay tasa disponible.
 * @param {number}      usd
 * @param {number|null} rate   tasa ya resuelta (para evitar awaits repetidos)
 * @returns {string}   ej: "USD 45.00 = Gs 337.500"  |  "USD 45.00"
 */
export function formatPrice(usd, rate) {
  if (!usd && usd !== 0) return '—';
  const usdStr = `USD ${usd.toFixed(2)}`;
  if (!rate) return usdStr;
  return `${usdStr} = ${formatPyg(usd * rate)}`;
}

/**
 * Formatea el total de un carrito.
 * @param {number}      totalUsd
 * @param {number|null} rate
 * @returns {string}   ej: "USD 180.00 = Gs 1.350.000"
 */
export function formatTotal(totalUsd, rate) {
  return formatPrice(totalUsd, rate);
}
