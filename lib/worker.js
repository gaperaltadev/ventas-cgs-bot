// ════════════════════════════════════════════════════════════════════════════
// Worker de cola — consume bot_queue en Supabase cada WORKER_INTERVAL_MS ms.
//
// Flujo por tick:
//   1. Lee el mensaje más antiguo con status = 'pendiente' (.maybeSingle)
//   2. Bloquea el registro → status = 'procesando'  (evita race condition)
//   3. Ejecuta el pipeline completo: allowlist → parser → handleCommand → Meta
//   4. Cierra: status = 'completado'  |  status = 'error' + error_message
//
// Un flag `isProcessing` garantiza que los ticks no se solapen aunque el
// procesamiento tarde más que el intervalo configurado.
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';
import { supabase }    from './supabase.js';
import { sendToMeta }  from './meta.js';
import { parseIntent } from './parser.js';
import { handleCommand } from '../commands.js';
import {
  getSession,
  setSession,
  clearSession,
  isAllowed
} from './session.js';

// ─── Config ─────────────────────────────────────────────────────────────────
const PREFIX      = process.env.BOT_PREFIX         || '/';
const INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS || '2000', 10);

// ─── Mensajes de fallback (mismos que tenía el webhook) ─────────────────────
const FALLBACK_NO_COMMAND = 'No entendí tu mensaje. 🤔\n\nEscribí */ayuda* para ver lo que puedo hacer.';
const FALLBACK_ERROR      = 'Hubo un error procesando tu mensaje. Intentá de nuevo en un momento.';

// ─── Comandos que continúan un flujo activo (no limpian la sesión) ──────────
const FLOW_COMMANDS = new Set([
  '__select__',
  '__pedido_buscar_cliente__',
  '__pedido_alta_cliente__',
  '__pedido_items__',
  '__pedido_confirmar__'
]);

// ─── Estado del worker ───────────────────────────────────────────────────────
let isProcessing = false;
let intervalId   = null;

// ════════════════════════════════════════════════════════════════════════════
// Pipeline de procesamiento — reutiliza la lógica del antiguo POST /webhook
// ════════════════════════════════════════════════════════════════════════════

async function processJob(job) {
  const waPhone = job.phone_number;
  const text    = job.message_body;

  // 1. Allowlist de vendedores ────────────────────────────────────────────────
  if (!(await isAllowed(waPhone))) {
    console.log(`[worker] [bloqueado] ${waPhone} — no está en vendedores activos`);
    await sendToMeta(
      waPhone,
      'Hola 👋 Este bot es de uso interno de CGS Paraguay. Si sos parte del equipo, pedile acceso al administrador.'
    );
    return;
  }

  // 2. Prefijo requerido (salvo que haya un flujo conversacional activo) ──────
  const session       = getSession(waPhone);
  const hasActiveFlow = !!(session.flowStep || session.lastResults?.length);

  if (!hasActiveFlow && !text.startsWith(PREFIX)) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  const cleanText = text.startsWith(PREFIX) ? text.slice(PREFIX.length).trim() : text;
  if (!cleanText) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  // 3. Parsear intención ───────────────────────────────────────────────────────
  const { command, args } = parseIntent(cleanText, session);
  if (!command) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  console.log(`[${new Date().toLocaleTimeString('es-PY')}] [worker] ${waPhone} → "${cleanText}" → ${command}`);

  // Limpiar sesión si es un comando nuevo (no continuación de flujo)
  if (!FLOW_COMMANDS.has(command)) clearSession(waPhone);

  // 4. Ejecutar comando ────────────────────────────────────────────────────────
  let result;
  try {
    result = await handleCommand(command, args, supabase, session, waPhone);
  } catch (err) {
    console.error(`[worker] error en handleCommand(${command}):`, err);
    Sentry.captureException(err, { extra: { command, args, waPhone, session } });
    await sendToMeta(waPhone, FALLBACK_ERROR);
    return;
  }

  if (!result) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  // 5. Guardar sesión si el handler devolvió una ───────────────────────────────
  if (result?._session) {
    setSession(waPhone, result._session);
    await sendToMeta(waPhone, result.text || FALLBACK_NO_COMMAND);
    return;
  }

  // 6. Enviar respuesta ────────────────────────────────────────────────────────
  const responseText = typeof result === 'string' ? result : result.text;
  await sendToMeta(waPhone, responseText || FALLBACK_NO_COMMAND);
}

// ════════════════════════════════════════════════════════════════════════════
// tick — una pasada del worker
// ════════════════════════════════════════════════════════════════════════════

async function tick() {
  if (isProcessing) return;   // evitar solapamiento de ticks
  isProcessing = true;

  try {
    // ─── 1. Petición atómica: el más antiguo en estado 'pendiente' ────────────
    const { data: job, error: fetchError } = await supabase
      .from('bot_queue')
      .select('*')
      .eq('status', 'pendiente')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();   // retorna null (no lanza) si la cola está vacía

    if (fetchError) {
      console.error('[worker] error al leer cola:', fetchError.message);
      Sentry.captureException(fetchError, { extra: { step: 'fetch_queue' } });
      return;
    }

    if (!job) return;   // cola vacía — esperar al siguiente tick

    // ─── 2. Bloqueo de registro: marcar como 'procesando' ─────────────────────
    // El guard .eq('status', 'pendiente') actúa como lock optimista:
    // si otro proceso ya lo tomó, el update afecta 0 filas y no procesamos.
    const { count, error: lockError } = await supabase
      .from('bot_queue')
      .update({ status: 'procesando', updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pendiente')
      .select('id', { count: 'exact', head: true });

    if (lockError) {
      console.error('[worker] error al bloquear job:', lockError.message);
      return;
    }
    if (count === 0) {
      // Otro proceso se adelantó — continuar en el próximo tick
      return;
    }

    // ─── 3. Lógica de negocio ────────────────────────────────────────────────
    try {
      await processJob(job);

      // ─── 4. Cierre exitoso ─────────────────────────────────────────────────
      await supabase
        .from('bot_queue')
        .update({ status: 'completado', updated_at: new Date().toISOString() })
        .eq('id', job.id);

      console.log(`[worker] ✅ job ${job.id} (${job.phone_number}) completado`);

    } catch (err) {
      // ─── 4. Cierre con error ───────────────────────────────────────────────
      console.error(`[worker] ❌ job ${job.id} falló:`, err.message);
      Sentry.captureException(err, {
        extra: { jobId: job.id, phone: job.phone_number, step: 'process_job' }
      });
      await supabase
        .from('bot_queue')
        .update({
          status:        'error',
          error_message: String(err.message).slice(0, 500),  // limitar tamaño
          updated_at:    new Date().toISOString()
        })
        .eq('id', job.id);
    }

  } finally {
    isProcessing = false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// API pública del worker
// ════════════════════════════════════════════════════════════════════════════

/**
 * Inicia el worker: un tick inmediato + intervalo de polling.
 */
export function startWorker() {
  console.log(`[worker] iniciando — intervalo: ${INTERVAL_MS}ms`);
  tick();                                     // ejecutar de inmediato al arrancar
  intervalId = setInterval(tick, INTERVAL_MS);
}

/**
 * Detiene el worker. Llama desde el graceful shutdown del servidor.
 * El tick en curso (si existe) terminará solo — isProcessing lo garantiza.
 */
export function stopWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[worker] detenido');
  }
}
