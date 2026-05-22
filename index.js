import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { promises as fs } from 'fs';
import { handleCommand } from './commands.js';
import { supabase } from './lib/supabase.js';
import { sessions, isAllowed } from './lib/session.js';
import { startAuthServer, updateAuthState, recordAuthError, setResetHandler, setCircuitGetter } from './lib/auth-server.js';
import { logEvent, getDisconnectReason } from './lib/diagnostics.js';
import { send } from './lib/sender.js';

// ─── Validación de variables de entorno al arranque ──────────────────────────
// Falla rápido con mensaje claro antes de que cualquier librería tire un stack trace.

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const RECOMMENDED_ENV = ['ALLOWED_NUMBERS', 'BOT_PREFIX'];

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('\n❌ Faltan variables de entorno obligatorias:\n');
  missing.forEach(k => console.error(`   - ${k}`));
  console.error('\nConfiguralas en Railway → Service → Variables, o en tu .env local.');
  console.error('Referencia: .env.example\n');
  process.exit(1);
}

const warnings = RECOMMENDED_ENV.filter(k => !process.env[k]);
if (warnings.length) {
  console.warn('⚠️  Variables recomendadas sin definir:', warnings.join(', '));
  console.warn('   El bot va a arrancar igual pero con valores por defecto.\n');
}

// Prefijo que activa el bot
const PREFIX = process.env.BOT_PREFIX || '/';

// El bootstrap (startAuthServer + connect) está al final del archivo,
// DESPUÉS de declarar CIRCUIT, forceResetAuth y connect. Si se invoca acá
// arriba, JS tira ReferenceError por Temporal Dead Zone — las `const` no
// se hoistean como las funciones.

// ─── Comandos reconocidos para escape de flujo guiado ────────────────────────
// Cualquiera de estos cancela el flujo activo y se procesa normalmente.
const KNOWN_COMMANDS_RE = /^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo|auto|autos|moto|motos|rod|camion|camiones|extravida|pesado|otros|otro|fluido|fluidos|destacados|populares|recomendados|vender|ventas?( hoy| semana)?|resumen|cuanto vendimos|que vendimos( hoy)?|top( \d+)?|ranking|mas vendidos|mejores|ayuda|help|hola|inicio|que puedo hacer|comandos|menu|salir|chau|chao|bye|exit|adios|cancelar|buscar|busca|busco|search|guia|guía|recomendacion|recomendación|pedido|pedidos|mispedidos|mis pedidos)(\s.+)?$/;

// ─── Parser de intención — pipeline de 12 pasos ──────────────────────────────

function parseIntent(text, session) {
  const t = text.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

  // 0. Flujo guiado activo: redirigir según el paso actual
  if (session?.flowStep === 'venta_esperando_producto') {
    // Si es un comando reconocido, escapar al pipeline normal
    if (KNOWN_COMMANDS_RE.test(t) || t.startsWith('!')) {
      // Caer al pipeline normal (continúa debajo)
    } else {
      return { command: '__venta_flujo__', args: t.split(/\s+/) };
    }
  }

  if (session?.flowStep === 'venta_esperando_cantidad') {
    if (/^\d+$/.test(t)) {
      return { command: '__venta_cantidad__', args: [t] };
    }
    // Si no es número → escape al pipeline normal (cancela el flujo)
  }

  // FlowSteps de /pedido
  if (session?.flowStep === 'pedido_esperando_cliente'
      && !KNOWN_COMMANDS_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_buscar_cliente__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_alta_cliente'
      && !KNOWN_COMMANDS_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_alta_cliente__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_esperando_items'
      && !KNOWN_COMMANDS_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_items__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_confirmando') {
    if (/^(si|s|sí|ok|dale|confirmo|confirmar)$/.test(t)) return { command: '__pedido_confirmar__', args: ['si'] };
    if (/^(no|n|cancela|cancelar)$/.test(t))               return { command: '__pedido_confirmar__', args: ['no'] };
    // Cualquier otra cosa → escape (cancela el flujo)
  }

  // 1. Selección numérica de lista activa
  // Guard: NO activa si flowStep='venta_esperando_cantidad' (ya manejado arriba)
  if (/^[1-5]$/.test(t) && session?.lastResults?.length
      && session?.flowStep !== 'venta_esperando_cantidad') {
    return { command: '__select__', args: [parseInt(t) - 1] };
  }

  // 1b. Selección con cantidad embebida "N M" durante venta_esperando_seleccion
  if (/^[1-5]\s+\d+$/.test(t) && session?.flowStep === 'venta_esperando_seleccion') {
    const parts = t.split(/\s+/);
    return { command: '__select__', args: [parseInt(parts[0]) - 1, parseInt(parts[1])] };
  }

  // 2. Comando explícito con !
  if (t.startsWith('!')) {
    const parts = t.split(/\s+/);
    return { command: parts[0], args: parts.slice(1) };
  }

  // 3. Catálogo
  if (/^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo)$/.test(t)) {
    return { command: '!catalogo', args: [] };
  }

  // 4. Ayuda
  if (/^(ayuda|help|hola|inicio|que puedo hacer|comandos|menu)$/.test(t)) {
    return { command: '!ayuda', args: [] };
  }

  // 4b. Salir / cancelar flujo
  if (/^(salir|chau|adios|bye|exit|cancelar|cancel)$/.test(t)) {
    return { command: '!salir', args: [] };
  }

  // 5. Categoría
  const catMatch = t.match(/^(?:para\s+)?(auto|autos|moto|motos|camion|camiones|otros|otro|fluido|fluidos|pesado|rod|elaion|extravida)$/);
  if (catMatch) {
    return { command: '!cat', args: [catMatch[1]] };
  }

  // 6. Venta
  const ventaMatch = t.match(/^(vender|venta|vendi|anotar)(\s+(.+))?$/);
  if (ventaMatch) {
    const ventaArgs = ventaMatch[3] ? ventaMatch[3].split(/\s+/) : [];
    return { command: '!v', args: ventaArgs };
  }

  // 6b. Búsqueda inteligente
  const buscarMatch = t.match(/^(buscar|busca|busco|search)(\s+(.+))?$/);
  if (buscarMatch) {
    const bArgs = buscarMatch[3] ? buscarMatch[3].split(/\s+/) : [];
    return { command: '!buscar', args: bArgs };
  }

  // 6c. Guía de lubricación
  const guiaMatch = t.match(/^(guia|guía|recomendacion|recomendación|que aceite|qué aceite)(\s+(.+))?$/);
  if (guiaMatch) {
    const gArgs = guiaMatch[3] ? guiaMatch[3].split(/\s+/) : [];
    return { command: '!guia', args: gArgs };
  }

  // 6d. Pedido (cliente + items)
  const pedidoMatch = t.match(/^(pedido)(\s+(.+))?$/);
  if (pedidoMatch) {
    const pArgs = pedidoMatch[3] ? pedidoMatch[3].split(/\s+/) : [];
    return { command: '!pedido', args: pArgs };
  }

  // 6e. Mis pedidos (listado)
  if (/^(mispedidos|mis pedidos|pedidos)$/.test(t)) {
    return { command: '!mispedidos', args: [] };
  }

  // 7. Resumen de ventas
  if (/^(ventas|ventas hoy|ventas semana|resumen|cuanto vendimos|que vendimos|que vendimos hoy)$/.test(t)) {
    const args = t.includes('semana') ? ['semana'] : ['hoy'];
    return { command: '!ventas', args };
  }

  // 8. Ranking
  if (/^(top|ranking|mas vendidos|top 5|mejores)$/.test(t)) {
    return { command: '!top', args: [] };
  }

  // 9. Destacados
  if (/^(destacados|populares|recomendados)$/.test(t)) {
    return { command: '!d', args: [] };
  }

  // 10. Solo número (sin sesión activa) → búsqueda por ID
  if (/^\d+$/.test(t)) {
    return { command: '!p', args: [t] };
  }

  // 11. Texto libre → búsqueda
  return { command: '!p', args: t.split(/\s+/) };
}

// ─── Conexión WhatsApp ────────────────────────────────────────────────────────

// Borra el contenido de auth_info/ pero deja la carpeta (sirve en Railway,
// donde la carpeta es el mount point de un volumen y no puede eliminarse).
async function clearAuthInfo() {
  try {
    const files = await fs.readdir('auth_info').catch(() => []);
    await Promise.all(files.map(f =>
      fs.rm(`auth_info/${f}`, { recursive: true, force: true })
    ));
    console.log(`[auth] auth_info limpiado (${files.length} archivos borrados)`);
    logEvent('auth_cleanup', { filesDeleted: files.length });
  } catch (e) {
    console.error('[auth] no se pudo limpiar auth_info:', e.message);
    logEvent('auth_cleanup_error', { message: e.message });
  }
}

// ─── Política de reconexión ───────────────────────────────────────────────────
const RECONNECT = {
  attempts: 0,
  max: 12,                       // máx 12 intentos antes de salir
  base: 3000,                    // 3s inicial
  cap: 60000                     // techo 60s
};

function nextReconnectDelay() {
  // Backoff exponencial: 3, 6, 12, 24, 48, 60, 60, ...
  return Math.min(RECONNECT.base * Math.pow(2, RECONNECT.attempts), RECONNECT.cap);
}

// ─── Circuit breaker para prevenir bans ─────────────────────────────────────
// Si WhatsApp devuelve 401 múltiples veces en sesiones nunca registradas
// (es decir, fallos de pairing repetidos), abrimos el circuito y pausamos
// todos los intentos por un tiempo largo. Esto evita el patrón "loop tight"
// que históricamente causó el ban del número.
export const CIRCUIT = {
  open: false,
  openedAt: 0,
  pauseMs: 60 * 60 * 1000,       // 1 hora de pausa default
  consecutiveAuthFailures: 0,    // 401s seguidos sin sesión registrada
  threshold: 3                   // máximo permitido antes de abrir circuito
};

// Backoff exponencial para reintentos de pairing.
// Cada fallo consecutivo escala el wait. Reset al primer éxito.
const PAIRING_BACKOFF_MS = [
  30_000,       // 30s
  90_000,       // 1.5min
  5 * 60_000,   // 5min
  30 * 60_000,  // 30min
  60 * 60_000   // 1hr (cap)
];

function nextPairingDelay(failures) {
  return PAIRING_BACKOFF_MS[Math.min(failures, PAIRING_BACKOFF_MS.length - 1)];
}

// Helper para forzar reset manual desde el endpoint /api/reset
export async function forceResetAuth() {
  console.log('🔄 Reset manual solicitado: limpiando auth_info y reseteando circuit breaker');
  await clearAuthInfo();
  CIRCUIT.open = false;
  CIRCUIT.openedAt = 0;
  CIRCUIT.consecutiveAuthFailures = 0;
  RECONNECT.attempts = 0;
  setTimeout(connect, 1000);
}

// Pide el pairing code reintentando si la conexión todavía no está lista.
// Baileys necesita que el WebSocket haya pasado el noise handshake;
// en redes con latencia (Railway → Meta) eso puede tardar varios segundos.
async function requestPairingWithRetry(sock, phoneNumber, maxRetries = 4) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const code = await sock.requestPairingCode(phoneNumber);
      return code;
    } catch (e) {
      const isClosed = /Connection Closed|not.*connected|timed.out/i.test(e.message);
      if (!isClosed || i === maxRetries - 1) throw e;
      const wait = 4000 + i * 2000;   // 4s, 6s, 8s, 10s
      console.log(`[pairing] WS no listo, reintentando en ${wait/1000}s... (${i+1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// Cada cuánto regeneramos el pairing code (debe ser < expiración de WhatsApp ~120s)
const PAIRING_REFRESH_MS = 90 * 1000;

function mostrarPairingCode(code, phoneNumber, attempt) {
  const ahora = new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const renueva = new Date(Date.now() + PAIRING_REFRESH_MS).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`\n══════════════════════════════`);
  console.log(`  PAIRING CODE: ${code}     ${attempt > 1 ? `(código #${attempt})` : ''}`);
  console.log(`  Generado: ${ahora} · Se renueva: ${renueva}`);
  console.log(``);
  console.log(`  Para vincular ${phoneNumber}:`);
  console.log(`  1. Abrí WhatsApp en ese teléfono`);
  console.log(`  2. Configuración → Dispositivos vinculados`);
  console.log(`  3. Vincular con número de teléfono`);
  console.log(`  4. Ingresá el código de 8 caracteres`);
  console.log(``);
  console.log(`  💡 Si tardás, esperá al próximo código (cada 90s).`);
  console.log(`══════════════════════════════\n`);
}

async function connect() {
  // Si el circuit breaker está abierto, no intentamos conectar.
  if (CIRCUIT.open) {
    const remainingMs = CIRCUIT.openedAt + CIRCUIT.pauseMs - Date.now();
    if (remainingMs > 0) {
      console.log(`🚫 Circuit breaker abierto. Restan ${Math.ceil(remainingMs/60000)} min antes de reintentar.`);
      console.log(`   Para forzar reset: usá el botón en la UI o /api/reset?token=XXX`);
      return;
    }
    // Tiempo cumplido, cerrar circuit breaker
    CIRCUIT.open = false;
    CIRCUIT.consecutiveAuthFailures = 0;
    console.log('✓ Circuit breaker cerrado, reintentando conexión...');
  }

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  // Siempre usar la última versión de WhatsApp Web que Meta acepta.
  // Si la versión bundleada con Baileys se deprecó, este fetch trae la actual.
  let waVersion;
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    waVersion = version;
    console.log(`[wa] usando WhatsApp Web v${version.join('.')} (isLatest=${isLatest})`);
  } catch (e) {
    console.warn(`[wa] no se pudo obtener versión latest, usando bundleada:`, e.message);
  }

  const sock = makeWASocket({
    auth: state,
    version: waVersion,                       // versión actualizada (o default si falla)
    browser: Browsers.macOS('Desktop'),       // fingerprint legítimo (no "Baileys")
    printQRInTerminal: false,
    syncFullHistory: false,                   // no descargar historial completo (lento + sospechoso)
    markOnlineOnConnect: false,               // NO anunciarse "online" 24/7
    emitOwnEvents: false,                     // no procesar mensajes propios
    generateHighQualityLinkPreview: false,    // no generar previews (más tráfico, más detección)
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    // Solo conversaciones 1:1: ignorar grupos, broadcasts, status updates.
    // Reduce superficie de detección — un humano en grupo no responde a todos.
    shouldIgnoreJid: jid =>
      !jid ||
      jid.endsWith('@g.us') ||                // grupos
      jid.endsWith('@broadcast') ||           // listas de difusión
      jid === 'status@broadcast',             // historias
    logger: { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal: console.error, child(){ return this; } }
  });

  // Exponer el socket globalmente para shutdown limpio (SIGTERM/SIGINT)
  globalThis._sock = sock;

  sock.ev.on('creds.update', saveCreds);

  // ─── Pairing code con regeneración automática ─────────────────────────
  // WhatsApp expira el código en ~120s. Lo regeneramos cada 90s para que
  // siempre haya uno fresco en los logs. Se detiene cuando la conexión
  // se abre o se cierra.
  let pairingTimer = null;
  let pairingAttempt = 0;

  async function ciclarPairingCode() {
    if (state.creds.registered) return;
    pairingAttempt++;
    logEvent('pairing_attempt', { attempt: pairingAttempt });
    try {
      const code = await requestPairingWithRetry(sock, process.env.PHONE_NUMBER);
      mostrarPairingCode(code, process.env.PHONE_NUMBER, pairingAttempt);
      logEvent('pairing_success', { attempt: pairingAttempt });
      updateAuthState({
        pairingCode: code,
        pairingGeneratedAt: Date.now(),
        pairingExpiresAt: Date.now() + PAIRING_REFRESH_MS
      });
    } catch (e) {
      console.error(`[pairing] Error en intento ${pairingAttempt}:`, e.message);
      logEvent('pairing_error', { attempt: pairingAttempt, message: e.message });
      recordAuthError(`Error al generar pairing code: ${e.message}`);
    }
  }

  if (process.env.PHONE_NUMBER && !state.creds.registered) {
    // Disparar el primero ya
    ciclarPairingCode();
    // Y renovar cada 90s
    pairingTimer = setInterval(ciclarPairingCode, PAIRING_REFRESH_MS);
  }

  function stopPairingTimer() {
    if (pairingTimer) {
      clearInterval(pairingTimer);
      pairingTimer = null;
      updateAuthState({ pairingCode: null, pairingGeneratedAt: null, pairingExpiresAt: null });
    }
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // ─── QR — siempre se captura para la página web de vinculación ───────
    if (qr) {
      updateAuthState({ qr });
      logEvent('qr');
      // En terminal solo lo mostramos cuando NO hay PHONE_NUMBER (modo dev)
      if (!process.env.PHONE_NUMBER) {
        console.log('\nEscaneá este QR (Dispositivos vinculados → Vincular dispositivo):\n');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'connecting') {
      logEvent('connecting');
    }

    // ─── Conexión exitosa: resetear contador ──────────────────────────────
    if (connection === 'open') {
      stopPairingTimer();
      updateAuthState({ connected: true, qr: null, pairingCode: null });
      logEvent('open');
      console.log('✅ Bot conectado a WhatsApp');
      RECONNECT.attempts = 0;
    }

    // ─── Conexión cerrada: decidir reconexión vs logout ───────────────────
    if (connection === 'close') {
      stopPairingTimer();
      updateAuthState({ connected: false });
      const code = lastDisconnect?.error?.output?.statusCode;
      const message = lastDisconnect?.error?.message;
      const reasonInfo = getDisconnectReason(code);
      logEvent('close', { statusCode: code, message, reasonName: reasonInfo?.name });

      // Log detallado en consola (Railway logs)
      console.log(`[close] code=${code ?? '?'} reason=${reasonInfo?.name ?? 'unknown'} message="${message ?? ''}"`);
      if (reasonInfo) {
        console.log(`[close] interpretación: ${reasonInfo.meaning} (severidad: ${reasonInfo.severity})`);
      }

      if (code === DisconnectReason.loggedOut) {
        // CRÍTICO: diferenciar entre "logout real" y "pairing nunca completado"
        // - Si la sesión SÍ estaba registrada → real logout, limpiar
        // - Si NUNCA estuvo registrada → pairing falló, NO limpiar (eso amplía
        //   el problema), aplicar backoff y eventualmente circuit-breaker
        if (state.creds.registered) {
          console.log('⚠️  Sesión cerrada en WhatsApp (logout real). Limpiando credenciales y reiniciando...');
          await clearAuthInfo();
          RECONNECT.attempts = 0;
          CIRCUIT.consecutiveAuthFailures = 0;  // reset, era una sesión válida
          setTimeout(connect, 5000);
          return;
        }

        // 401 sin sesión registrada = fallo de pairing
        CIRCUIT.consecutiveAuthFailures++;
        console.log(`⚠️  Pairing fallido con 401 (intento ${CIRCUIT.consecutiveAuthFailures}/${CIRCUIT.threshold}). NO limpiamos auth_info.`);

        if (CIRCUIT.consecutiveAuthFailures >= CIRCUIT.threshold) {
          // Activar circuit breaker — el número probablemente está siendo limitado o baneado
          CIRCUIT.open = true;
          CIRCUIT.openedAt = Date.now();
          recordAuthError(`Múltiples fallos de pairing detectados. Bot pausado ${CIRCUIT.pauseMs/60000} min para evitar ban permanente. Usá el botón "Reset manual" cuando hayas esperado al menos esa cantidad de tiempo.`);
          console.error(`🚫 CIRCUIT BREAKER ACTIVADO. Pausando ${CIRCUIT.pauseMs/60000} min.`);
          console.error(`   Para reactivar antes de tiempo: usá el botón en la UI o /api/reset?token=XXX`);
          return;
        }

        // Backoff exponencial antes de reintentar
        const wait = nextPairingDelay(CIRCUIT.consecutiveAuthFailures);
        console.log(`⏱  Esperando ${wait/1000}s antes del próximo intento (backoff anti-ban)`);
        setTimeout(connect, wait);
        return;
      }

      if (RECONNECT.attempts >= RECONNECT.max) {
        console.error(`❌ ${RECONNECT.attempts} intentos de reconexión fallidos. Saliendo para que Railway reinicie el contenedor desde cero.`);
        process.exit(1);
      }

      const delay = nextReconnectDelay();
      RECONNECT.attempts++;
      console.log(`Reconectando en ${delay / 1000}s (intento ${RECONNECT.attempts}/${RECONNECT.max})...`);
      setTimeout(connect, delay);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
      ).trim();

      if (!text) continue;

      const jid = msg.key.remoteJid;

      // Avisar y bloquear números no autorizados
      if (!msg.key.fromMe && !(await isAllowed(jid))) {
        console.log(`[bloqueado] ${jid} — no está en vendedores activos`);
        await send(sock, jid, 'Hola 👋 Este bot es de uso interno de CGS Paraguay. Si sos parte del equipo, pedile acceso al administrador.');
        continue;
      }

      const session = sessions.get(jid) || {
        lastResults: null,
        lastAction: null,
        pendingVenta: null,
        flowStep: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const hasActiveFlow = !!(session.flowStep || session.lastResults?.length);

      // Requerir prefijo para iniciar; flujos activos no lo necesitan
      if (!hasActiveFlow && !text.startsWith(PREFIX)) continue;

      // Quitar el prefijo antes de parsear
      const cleanText = text.startsWith(PREFIX) ? text.slice(PREFIX.length).trim() : text;
      if (!cleanText) continue;

      const { command, args } = parseIntent(cleanText, session);

      // Ignorar mensajes propios que no sean comandos ni flujos activos
      if (msg.key.fromMe && command === '!p' && !cleanText.startsWith('!')) continue;

      console.log(`[${new Date().toLocaleTimeString()}] ${jid.split('@')[0]} → ${cleanText}`);

      // Limpiar sesión si es un comando nuevo (no selección ni flujo activo)
      const isFlowCommand = [
        '__select__',
        '__venta_flujo__', '__venta_cantidad__',
        '__pedido_buscar_cliente__', '__pedido_alta_cliente__',
        '__pedido_items__', '__pedido_confirmar__'
      ].includes(command);
      if (!isFlowCommand) {
        sessions.delete(jid);
      }

      const result = await handleCommand(command, args, supabase, session, jid);
      if (!result) continue;

      if (result?._session) {
        sessions.set(jid, {
          ...result._session,
          createdAt: session.createdAt || Date.now(),
          updatedAt: Date.now()
        });
        await send(sock, jid, result.text);
      } else {
        await send(sock, jid, typeof result === 'string' ? result : result.text);
      }
    }
  });
}

// send() viene de lib/sender.js con rate limit + delay humano simulado.

// ─── Shutdown limpio ────────────────────────────────────────────────────────
// Si Railway envía SIGTERM (deploy nuevo, escala a cero, etc.) hay que cerrar
// la conexión WhatsApp con un end() formal. Sin esto, Meta ve disconnect
// abrupto y eso suma puntos al score antifraude.
function gracefulShutdown(signal) {
  console.log(`\n[shutdown] ${signal} recibido. Cerrando conexión WhatsApp...`);
  try {
    if (globalThis._sock) {
      globalThis._sock.end(undefined);
    }
  } catch (e) {
    console.error('[shutdown] error al cerrar sock:', e.message);
  }
  // Pequeño delay para que el end() viaje al WS antes de matar el proceso
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ═════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP — corre al final para que todas las `const` y funciones estén
// inicializadas antes de invocar connect(). Mover esto arriba causa
// ReferenceError por TDZ (CIRCUIT y forceResetAuth son `const`, no funciones).
// ═════════════════════════════════════════════════════════════════════════════

setResetHandler(() => forceResetAuth());
setCircuitGetter(() => CIRCUIT);
startAuthServer();

if (process.env.BOT_PAUSED === 'true') {
  console.log('');
  console.log('⏸  ═══════════════════════════════════════════════════');
  console.log('⏸  BOT_PAUSED=true — bot pausado intencionalmente.');
  console.log('⏸  Las conexiones a WhatsApp están detenidas.');
  console.log('⏸  Para reactivar: quitá BOT_PAUSED de las env vars y redeploy.');
  console.log('⏸  ═══════════════════════════════════════════════════');
  console.log('');
  recordAuthError('Bot pausado por BOT_PAUSED=true. Quitá la variable y redeploy para reactivar.');
} else {
  connect();
}
