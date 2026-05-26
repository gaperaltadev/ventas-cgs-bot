// ════════════════════════════════════════════════════════════════════════════
// Caché de tipo de cambio USD → PYG + helpers de formato de precios.
//
// Fuente: open.er-api.com (sin API key, actualización diaria).
//
// Estrategia de caché:
//   · TTL 30 minutos en memoria (cubre un turno de ventas completo)
//   · Si el refresh falla → usa la última tasa conocida (no rompe el flujo)
//   · Si nunca cargó → devuelve null → el bot muestra solo USD
//
// La tasa se almacena en pedido_items.exchange_rate en el momento de cada
// venta como snapshot inmutable. No se persiste en base de datos entre reinicios.
// ════════════════════════════════════════════════════════════════════════════

const EXCHANGE_API_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS     = 30 * 60 * 1000;  // 30 minutos

let cachedRate = null;   // NUMERIC — tasa PYG por 1 USD
let cachedAt   = 0;      // timestamp del último refresh exitoso

// ─── Tasa de cambio ──────────────────────────────────────────────────────────

/**
 * Devuelve la tasa de cambio USD→PYG vigente.
 * Refresca desde open.er-api.com si el caché expiró.
 * @returns {Promise<number|null>}  null si no hay tasa disponible
 */
export async function getExchangeRate() {
  if (cachedRate && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const res = await fetch(EXCHANGE_API_URL);
    if (!res.ok) {
      console.warn(`[prices] error HTTP al obtener tasa: ${res.status}`);
      return cachedRate;
    }

    const data = await res.json();

    if (data.result !== 'success') {
      console.warn('[prices] respuesta inesperada de la API:', data.result);
      return cachedRate;
    }

    const rate = data.rates?.PYG;
    if (!rate || rate <= 0) {
      console.warn('[prices] tasa PYG no disponible en la respuesta');
      return cachedRate;
    }

    cachedRate = Number(rate);
    cachedAt   = Date.now();
    console.log(`[prices] tasa actualizada: 1 USD = Gs ${cachedRate.toLocaleString('es-PY')} (open.er-api.com)`);
  } catch (err) {
    console.warn('[prices] excepción al refrescar tasa:', err.message);
  }

  return cachedRate;  // null si nunca cargó, o la última conocida si el refresh falló
}

/** Fuerza un refresh en el próximo uso. */
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
