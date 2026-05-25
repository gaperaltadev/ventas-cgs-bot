// ════════════════════════════════════════════════════════════════════════════
// Meta WhatsApp Cloud API — cliente de envío de mensajes.
//
// Función única: sendToMeta(waPhone, text)
// Usada por el worker (lib/worker.js) para cerrar el ciclo de cada mensaje.
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';

/**
 * Envía un mensaje de texto al número de WhatsApp indicado vía Meta Cloud API.
 * Si las variables de entorno no están configuradas, loguea un warning y retorna.
 *
 * @param {string} waPhone  Número de destino (solo dígitos, ej: "595981234567")
 * @param {string} text     Texto del mensaje (soporta formato WhatsApp: *negrita*, etc.)
 */
export async function sendToMeta(waPhone, text) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken   = process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn('[meta] META_PHONE_NUMBER_ID o META_ACCESS_TOKEN no configurados — respuesta no enviada');
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waPhone,
        type: 'text',
        text: { body: text, preview_url: false }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[meta] error al enviar mensaje:', err);
    Sentry.captureMessage(`Meta API error: ${res.status}`, {
      level: 'error',
      extra: { waPhone, status: res.status, response: err }
    });
  }
}
