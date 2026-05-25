// ════════════════════════════════════════════════════════════════════════════
// CGS Bot — Webhook receiver para Meta WhatsApp Cloud API vía n8n.
//
// Flujo:
//   1. Vendedor escribe en WhatsApp
//   2. Meta envía webhook a n8n
//   3. n8n parsea y llama POST /webhook acá con { wa_phone, text }
//   4. Procesamos: parseIntent → handleCommand → respuesta
//   5. Devolvemos { text } a n8n
//   6. n8n llama Meta Send API para enviar al vendedor
//
// Para detalle de la arquitectura: docs/RETOMAR.md
// Para detalle de comandos: docs/USER_STORIES.md
// ════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { supabase } from './lib/supabase.js';
import { parseIntent } from './lib/parser.js';
import { handleCommand } from './commands.js';
import { getSession, setSession, clearSession, isAllowed } from './lib/session.js';

// ─── Validación de entorno ──────────────────────────────────────────────────
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Faltan variables de entorno obligatorias:', missing.join(', '));
  console.error('   Configurar en Railway → Service → Variables o en .env local.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const PREFIX = process.env.BOT_PREFIX || '/';
const N8N_SECRET = process.env.N8N_SHARED_SECRET || '';

if (!N8N_SECRET) {
  console.warn('⚠️  N8N_SHARED_SECRET no configurado. El endpoint /webhook está abierto.');
  console.warn('   Configurar antes de exponer en producción.');
}

// ─── App ────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '256kb' }));

// Healthcheck público (sin auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Healthcheck con info técnica básica
app.get('/', (req, res) => {
  res.json({
    service: 'cgs-bot',
    version: '2.0.0',
    architecture: 'meta-cloud-api + n8n + supabase',
    endpoint: 'POST /webhook',
    healthcheck: 'GET /health'
  });
});

// ─── Middleware de autenticación ────────────────────────────────────────────
function requireSecret(req, res, next) {
  if (!N8N_SECRET) return next();  // modo dev sin secret → pasa
  const sent = req.header('x-n8n-secret') || req.query.secret;
  if (sent !== N8N_SECRET) {
    console.warn(`[auth] rechazado: secret incorrecto desde ${req.ip}`);
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ─── Endpoint principal: webhook desde n8n ──────────────────────────────────
app.post('/webhook', requireSecret, async (req, res) => {
  const { wa_phone, text } = req.body;

  if (!wa_phone || typeof wa_phone !== 'string') {
    return res.status(400).json({ error: 'wa_phone requerido (string)' });
  }
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text requerido (string)' });
  }

  // Allowlist de vendedores
  if (!(await isAllowed(wa_phone))) {
    console.log(`[bloqueado] ${wa_phone} — no está en vendedores activos`);
    return res.json({
      text: 'Hola 👋 Este bot es de uso interno de CGS Paraguay. Si sos parte del equipo, pedile acceso al administrador.'
    });
  }

  // Sesión actual
  const session = getSession(wa_phone);

  // Requerir prefijo para iniciar interacción (excepto si hay flujo activo)
  // 204 No Content = "recibido OK, no hay respuesta para enviar".
  // n8n maneja 204 sin parsear body → más limpio que devolver text: null.
  const hasActiveFlow = !!(session.flowStep || session.lastResults?.length);
  if (!hasActiveFlow && !text.startsWith(PREFIX)) {
    return res.status(204).end();
  }

  const cleanText = text.startsWith(PREFIX) ? text.slice(PREFIX.length).trim() : text;
  if (!cleanText) return res.status(204).end();

  const { command, args } = parseIntent(cleanText, session);
  if (!command) return res.status(204).end();

  console.log(`[${new Date().toLocaleTimeString('es-PY')}] ${wa_phone} → ${cleanText} → ${command}`);

  // Limpiar sesión si es un comando nuevo (no es continuación de flujo)
  const isFlowCommand = [
    '__select__',
    '__pedido_buscar_cliente__', '__pedido_alta_cliente__',
    '__pedido_items__', '__pedido_confirmar__'
  ].includes(command);
  if (!isFlowCommand) {
    clearSession(wa_phone);
  }

  // Ejecutar comando
  let result;
  try {
    result = await handleCommand(command, args, supabase, session, wa_phone);
  } catch (err) {
    console.error(`[handleCommand] error en ${command}:`, err);
    return res.json({ text: 'Hubo un error procesando tu mensaje. Intentá de nuevo en un momento.' });
  }

  if (!result) return res.status(204).end();

  // Guardar estado si el handler devolvió uno
  if (result?._session) {
    setSession(wa_phone, result._session);
    return res.json({ text: result.text });
  }

  // result puede ser string directo o { text }
  res.json({ text: typeof result === 'string' ? result : result.text });
});

// ─── Shutdown limpio ────────────────────────────────────────────────────────
let server;

function gracefulShutdown(signal) {
  console.log(`[shutdown] ${signal} recibido. Cerrando servidor...`);
  if (server) {
    server.close(() => {
      console.log('[shutdown] servidor cerrado limpiamente.');
      process.exit(0);
    });
    // Si no cierra en 5s, forzar
    setTimeout(() => process.exit(0), 5000);
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ─── Arrancar ───────────────────────────────────────────────────────────────
server = app.listen(PORT, () => {
  console.log(`\n🚀 CGS Bot v2.0 escuchando en puerto ${PORT}`);
  console.log(`   Healthcheck: GET /health`);
  console.log(`   Webhook:     POST /webhook (auth: X-N8N-Secret header)`);
  console.log(`   Prefijo:     "${PREFIX}"`);
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`   URL pública: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  console.log('');
});
