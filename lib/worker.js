// ════════════════════════════════════════════════════════════════════════════
// Worker de cola — consume bot_queue en Supabase cada WORKER_INTERVAL_MS ms.
//
// Flujo por tick:
//   1. Lee el mensaje más antiguo con status = 'pendiente' (.maybeSingle)
//   2. Bloqueo optimista → UPDATE status='procesando' WHERE status='pendiente'
//      Si data es vacío: otro proceso ganó → abortar tick
//   3. processJob() ejecuta el pipeline completo y LANZA si algo falla
//   4. Éxito → status='completado' | Error → status='error' + error_message + Sentry
//
// isProcessing garantiza que los ticks no se solapen.
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';
import { supabase }      from './supabase.js';
import { sendToMeta }    from './meta.js';
import { parseIntent }   from './parser.js';
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

// ─── Mensajes de fallback ────────────────────────────────────────────────────
const FALLBACK_NO_COMMAND = 'No entendí tu mensaje. 🤔\n\nEscribí */ayuda* para ver lo que puedo hacer.';
const FALLBACK_ERROR      = 'Hubo un error procesando tu mensaje. Intentá de nuevo en un momento.';

// ─── Comandos de continuación de flujo (no limpian sesión) ──────────────────
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
// processJob — pipeline completo para un mensaje de la cola.
// CONTRATO: lanza Error si el pipeline falla (para que tick() lo capture).
// ════════════════════════════════════════════════════════════════════════════

async function processJob(job) {
  const waPhone = job.phone_number;
  const text    = job.message_body;

  console.log(`[worker] → procesando job ${job.id} | ${waPhone} | "${text}"`);

  // ─── 1. Allowlist ──────────────────────────────────────────────────────────
  const allowed = await isAllowed(waPhone);
  if (!allowed) {
    console.log(`[worker]   bloqueado: ${waPhone} no está en vendedores activos`);
    await sendToMeta(
      waPhone,
      'Hola 👋 Este bot es de uso interno de CGS Paraguay. Si sos parte del equipo, pedile acceso al administrador.'
    );
    return;
  }

  // ─── 2. Prefijo requerido (salvo flujo activo) ─────────────────────────────
  const session       = getSession(waPhone);
  const hasActiveFlow = !!(session.flowStep || session.lastResults?.length);

  if (!hasActiveFlow && !text.startsWith(PREFIX)) {
    console.log(`[worker]   sin prefijo "${PREFIX}" y sin flujo activo → fallback`);
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  const cleanText = text.startsWith(PREFIX) ? text.slice(PREFIX.length).trim() : text;
  if (!cleanText) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  // ─── 3. Parsear intención ──────────────────────────────────────────────────
  const { command, args } = parseIntent(cleanText, session);
  console.log(`[worker]   intent: ${command} | args: [${args.join(', ')}]`);

  if (!command) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  // ─── 4. Ejecutar comando ───────────────────────────────────────────────────
  if (!FLOW_COMMANDS.has(command)) clearSession(waPhone);

  let result;
  try {
    result = await handleCommand(command, args, supabase, session, waPhone);
  } catch (err) {
    // handleCommand falló → intentar avisar al usuario y re-lanzar para Sentry
    console.error(`[worker]   handleCommand(${command}) lanzó:`, err.message);
    Sentry.captureException(err, { extra: { command, args, waPhone } });
    await sendToMeta(waPhone, FALLBACK_ERROR).catch(() => {});  // best-effort
    throw err;   // re-lanza → tick() marca el job como 'error'
  }

  // ─── 5. Enviar respuesta ───────────────────────────────────────────────────
  if (!result) {
    await sendToMeta(waPhone, FALLBACK_NO_COMMAND);
    return;
  }

  if (result?._session) {
    setSession(waPhone, result._session);
    await sendToMeta(waPhone, result.text || FALLBACK_NO_COMMAND);
    return;
  }

  const responseText = typeof result === 'string' ? result : result.text;
  await sendToMeta(waPhone, responseText || FALLBACK_NO_COMMAND);
}

// ════════════════════════════════════════════════════════════════════════════
// tick — una pasada del worker
// ════════════════════════════════════════════════════════════════════════════

async function tick() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // ─── 1. Fetch más antiguo en 'pendiente' ──────────────────────────────────
    const { data: job, error: fetchError } = await supabase
      .from('bot_queue')
      .select('*')
      .eq('status', 'pendiente')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('[worker] error al leer cola:', fetchError.message);
      Sentry.captureException(fetchError, { extra: { step: 'fetch_queue' } });
      return;
    }

    if (!job) return;   // cola vacía

    // ─── 2. Bloqueo optimista: marcar como 'procesando' ──────────────────────
    // .select() sin head:true devuelve las filas afectadas — si data=[] otro proceso ganó.
    const { data: locked, error: lockError } = await supabase
      .from('bot_queue')
      .update({ status: 'procesando', updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pendiente')   // guard: solo si nadie más lo tomó
      .select('id');

    if (lockError) {
      console.error('[worker] error al bloquear job:', lockError.message);
      return;
    }
    if (!locked?.length) {
      // Otro proceso ganó la carrera — esperar al próximo tick
      return;
    }

    // ─── 3. Procesar ──────────────────────────────────────────────────────────
    try {
      await processJob(job);

      await supabase
        .from('bot_queue')
        .update({ status: 'completado', updated_at: new Date().toISOString() })
        .eq('id', job.id);

      console.log(`[worker] ✅ job ${job.id} completado`);

    } catch (err) {
      console.error(`[worker] ❌ job ${job.id} falló:`, err.message);
      Sentry.captureException(err, {
        extra: { jobId: job.id, phone: job.phone_number }
      });
      await supabase
        .from('bot_queue')
        .update({
          status:        'error',
          error_message: String(err.message).slice(0, 500),
          updated_at:    new Date().toISOString()
        })
        .eq('id', job.id);
    }

  } finally {
    isProcessing = false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// API pública
// ════════════════════════════════════════════════════════════════════════════

export function startWorker() {
  console.log(`[worker] iniciando — intervalo: ${INTERVAL_MS}ms | prefijo: "${PREFIX}"`);
  tick();
  intervalId = setInterval(tick, INTERVAL_MS);
}

export function stopWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[worker] detenido');
  }
}
