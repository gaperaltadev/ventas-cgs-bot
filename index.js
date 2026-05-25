// ════════════════════════════════════════════════════════════════════════════
// CGS Bot — Servidor Express + Worker de cola asíncrona.
//
// Arquitectura (post FASE 3 — async queue):
//   1. Vendedor escribe en WhatsApp
//   2. Meta envía webhook a n8n
//   3. n8n responde 200 OK inmediato a Meta e inserta en bot_queue (Supabase)
//   4. Este worker hace polling a bot_queue cada WORKER_INTERVAL_MS ms
//   5. Por cada mensaje 'pendiente': procesa → responde vía Meta Cloud API
//
// Express solo expone healthchecks. El webhook ya no existe.
// Para detalle: docs/TECHNICAL_DESIGN.md
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';
import express from 'express';
import { startWorker, stopWorker } from './lib/worker.js';

// ─── Sentry ─────────────────────────────────────────────────────────────────
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'development',
  tracesSampleRate: 0,   // sin performance tracing — solo errores
  enabled: !!process.env.SENTRY_DSN,
});

// ─── Validación de entorno ──────────────────────────────────────────────────
const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'META_PHONE_NUMBER_ID',
  'META_ACCESS_TOKEN'
];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Faltan variables de entorno obligatorias:', missing.join(', '));
  console.error('   Configurar en Railway → Service → Variables o en .env local.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// ─── App ────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '64kb' }));

// Healthcheck público
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});


// Info del servicio
app.get('/', (req, res) => {
  res.json({
    service:      'cgs-bot',
    version:      '3.0.0',
    architecture: 'async-queue — n8n → supabase bot_queue → worker → meta-cloud-api',
    healthcheck:  'GET /health',
    worker:       `polling bot_queue cada ${process.env.WORKER_INTERVAL_MS || 2000}ms`
  });
});

// ─── Shutdown limpio ────────────────────────────────────────────────────────
let server;

function gracefulShutdown(signal) {
  console.log(`[shutdown] ${signal} recibido. Cerrando...`);
  stopWorker();
  if (server) {
    server.close(() => {
      console.log('[shutdown] servidor cerrado limpiamente.');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ─── Arrancar ───────────────────────────────────────────────────────────────
server = app.listen(PORT, () => {
  console.log(`\n🚀 CGS Bot v3.0 escuchando en puerto ${PORT}`);
  console.log(`   Healthcheck: GET /health`);
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    console.log(`   URL pública: https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  console.log('');
  startWorker();
});
