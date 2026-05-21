import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { handleCommand } from './commands.js';
import { supabase } from './lib/supabase.js';
import { sessions, isAllowed } from './lib/session.js';

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

// ─── Comandos reconocidos para escape de flujo guiado ────────────────────────
// Cualquiera de estos cancela el flujo activo y se procesa normalmente.
const KNOWN_COMMANDS_RE = /^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo|auto|autos|moto|motos|rod|camion|camiones|extravida|pesado|otros|otro|fluido|fluidos|destacados|populares|recomendados|vender|ventas?( hoy| semana)?|resumen|cuanto vendimos|que vendimos( hoy)?|top( \d+)?|ranking|mas vendidos|mejores|ayuda|help|hola|inicio|que puedo hacer|comandos|menu|salir|chau|chao|bye|exit|adios|cancelar|buscar|busca|busco|search|guia|guía|recomendacion|recomendación)(\s.+)?$/;

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

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    logger: { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal: console.error, child(){ return this; } }
  });

  sock.ev.on('creds.update', saveCreds);

  // Pairing code (servidor): si hay PHONE_NUMBER y la sesión no está registrada
  if (process.env.PHONE_NUMBER && !state.creds.registered) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const code = await sock.requestPairingCode(process.env.PHONE_NUMBER);
      console.log(`\n══════════════════════════════`);
      console.log(`  PAIRING CODE: ${code}`);
      console.log(`  WhatsApp → Dispositivos vinculados → Vincular con número`);
      console.log(`══════════════════════════════\n`);
    } catch (e) {
      console.error('[pairing] Error al solicitar código:', e.message);
    }
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !process.env.PHONE_NUMBER) {
      console.log('\nEscaneá este QR (Dispositivos vinculados → Vincular dispositivo):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open')  console.log('✅ Bot conectado a WhatsApp');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('Sesión cerrada. Borrá auth_info/ y reiniciá.');
      } else {
        console.log('Reconectando...');
        connect();
      }
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
      const isFlowCommand = ['__select__', '__venta_flujo__', '__venta_cantidad__'].includes(command);
      if (!isFlowCommand) {
        sessions.delete(jid);
      }

      const result = await handleCommand(command, args, supabase, session);
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

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (err) {
    console.error(`[send error] ${err.message}`);
  }
}

connect();
