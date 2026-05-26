// ════════════════════════════════════════════════════════════════════════════
// Meta WhatsApp Cloud API — cliente de envío de mensajes.
//
// CONTRATO: sendToMeta() lanza un Error si la API de Meta devuelve !ok.
// Esto permite al worker capturar el fallo, marcar el job como 'error'
// y registrar la excepción en Sentry — en lugar de quedar como 'completado'.
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';

// ─── Helper interno ──────────────────────────────────────────────────────────
async function postToMeta(waPhone, body) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken   = process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('[meta] META_PHONE_NUMBER_ID o META_ACCESS_TOKEN no configurados');
  }

  let res;
  try {
    res = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: waPhone, ...body })
      }
    );
  } catch (networkErr) {
    throw new Error(`[meta] error de red: ${networkErr.message}`);
  }

  if (!res.ok) {
    const json    = await res.json().catch(() => ({}));
    const errMeta = json?.error ?? {};
    const msg = [
      `[meta] HTTP ${res.status}`,
      errMeta.message      ? `— ${errMeta.message}`               : '',
      errMeta.code         ? `(code ${errMeta.code}`              : '',
      errMeta.error_subcode
        ? ` subcode ${errMeta.error_subcode})`
        : (errMeta.code ? ')' : '')
    ].filter(Boolean).join(' ');

    Sentry.captureMessage(msg, {
      level: 'error',
      extra: { waPhone, status: res.status, metaError: errMeta }
    });
    throw new Error(msg);
  }
}

/**
 * Envía un mensaje de texto al número de WhatsApp indicado vía Meta Cloud API.
 *
 * @param {string} waPhone  Número de destino (solo dígitos, ej: "595981234567")
 * @param {string} text     Texto del mensaje (soporta formato WhatsApp: *negrita*, etc.)
 * @throws {Error}          Si Meta devuelve un status HTTP de error (4xx / 5xx)
 */
export async function sendToMeta(waPhone, text) {
  await postToMeta(waPhone, {
    type: 'text',
    text: { body: text, preview_url: false }
  });
}

/**
 * Envía un mensaje con botones de respuesta rápida (máximo 3).
 *
 * @param {string} waPhone
 * @param {string} body                    Texto principal del mensaje
 * @param {Array<{id:string, title:string}>} buttons  2-3 botones
 * @throws {Error}
 */
export async function sendInteractiveButtons(waPhone, body, buttons) {
  await postToMeta(waPhone, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map(b => ({
          type:  'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) }  // Meta: máx 20 chars
        }))
      }
    }
  });
}

/**
 * Envía un mensaje de lista interactiva (máximo 10 filas en total).
 *
 * @param {string} waPhone
 * @param {string} body                      Texto principal del mensaje
 * @param {string} buttonText                Texto del botón que abre la lista (máx 20 chars)
 * @param {Array<{title:string, rows:Array<{id:string, title:string, description?:string}>}>} sections
 * @throws {Error}
 */
export async function sendInteractiveList(waPhone, body, buttonText, sections) {
  await postToMeta(waPhone, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body:   { text: body },
      action: {
        button:   buttonText.slice(0, 20),   // Meta: máx 20 chars
        sections: sections.map(s => ({
          title: s.title,
          rows:  s.rows.map(r => ({
            id:          r.id,
            title:       r.title.slice(0, 24),              // Meta: máx 24 chars
            description: (r.description || '').slice(0, 72) // Meta: máx 72 chars
          }))
        }))
      }
    }
  });
}
