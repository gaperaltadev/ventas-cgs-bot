// ════════════════════════════════════════════════════════════════════════════
// Meta WhatsApp Cloud API — cliente de envío de mensajes.
//
// CONTRATO: sendToMeta() lanza un Error si la API de Meta devuelve !ok.
// Esto permite al worker capturar el fallo, marcar el job como 'error'
// y registrar la excepción en Sentry — en lugar de quedar como 'completado'.
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';

/**
 * Envía un mensaje de texto al número de WhatsApp indicado vía Meta Cloud API.
 *
 * @param {string} waPhone  Número de destino (solo dígitos, ej: "595981234567")
 * @param {string} text     Texto del mensaje (soporta formato WhatsApp: *negrita*, etc.)
 * @throws {Error}          Si Meta devuelve un status HTTP de error (4xx / 5xx)
 */
export async function sendToMeta(waPhone, text) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken   = process.env.META_ACCESS_TOKEN;

  // Esta rama solo se alcanza en dev sin vars configuradas.
  // En prod, index.js valida REQUIRED y falla antes de arrancar.
  if (!phoneNumberId || !accessToken) {
    throw new Error('[meta] META_PHONE_NUMBER_ID o META_ACCESS_TOKEN no configurados');
  }

  let res;
  try {
    res = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:   waPhone,
          type: 'text',
          text: { body: text, preview_url: false }
        })
      }
    );
  } catch (networkErr) {
    // Error de red (DNS, timeout, etc.) — también lanza para que el worker lo capture
    throw new Error(`[meta] error de red: ${networkErr.message}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = `[meta] HTTP ${res.status} — ${body?.error?.message ?? JSON.stringify(body)}`;
    Sentry.captureMessage(msg, {
      level: 'error',
      extra: { waPhone, status: res.status, response: body }
    });
    throw new Error(msg);   // ← permite al worker marcar el job como 'error'
  }
}
