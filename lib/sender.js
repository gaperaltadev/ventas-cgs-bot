// Cola de envío con throttle global + delay humano simulado.
// Defiende contra patrones rápidos (<100ms entre mensajes, sin variabilidad)
// que los modelos antifraude de WhatsApp detectan como bot.
//
// Estrategia:
// 1. Throttle global: mínimo MIN_DELAY_MS entre cualquier mensaje saliente,
//    sin importar a quién va. Si 5 vendedores hablan a la vez, los mensajes
//    salen escalonados.
// 2. Delay humano por mensaje: entre HUMAN_MIN y HUMAN_MAX ms aleatorio antes
//    de enviar. Simula tiempo de tipeo.
// 3. Presencia "composing" (escribiendo...) durante el delay → firma comportamental
//    fuerte de cliente humano.

const MIN_DELAY_MS  = 800;     // mínimo global entre cualquier mensaje
const HUMAN_MIN_MS  = 600;     // simulado: tiempo mínimo de tipeo
const HUMAN_MAX_MS  = 1800;    // simulado: tiempo máximo de tipeo

const queue = [];
let processing = false;
let lastSendAt = 0;

export async function send(sock, jid, text) {
  return new Promise((resolve, reject) => {
    queue.push({ sock, jid, text, resolve, reject });
    if (!processing) processQueue();
  });
}

async function processQueue() {
  processing = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      // 1. Throttle global
      const elapsed = Date.now() - lastSendAt;
      if (elapsed < MIN_DELAY_MS) {
        await sleep(MIN_DELAY_MS - elapsed);
      }

      // 2. Mostrar "escribiendo..." (mejora firma comportamental)
      await safePresence(job.sock, job.jid, 'composing');

      // 3. Delay humano aleatorio
      const humanDelay = HUMAN_MIN_MS + Math.random() * (HUMAN_MAX_MS - HUMAN_MIN_MS);
      await sleep(humanDelay);

      // 4. Detener indicador y enviar
      await safePresence(job.sock, job.jid, 'paused');
      await job.sock.sendMessage(job.jid, { text: job.text });
      lastSendAt = Date.now();
      job.resolve();
    } catch (err) {
      console.error(`[send] error a ${job.jid?.split('@')[0]}: ${err.message}`);
      job.reject(err);
    }
  }
  processing = false;
}

// El sock puede no estar conectado o el JID puede no soportar presencia.
// Cualquier error en presencia no debe romper el envío.
async function safePresence(sock, jid, presence) {
  try {
    await sock.sendPresenceUpdate(presence, jid);
  } catch {
    // Silencioso — la presencia es nice-to-have, no crítica.
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
