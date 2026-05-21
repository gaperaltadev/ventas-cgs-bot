// Servidor HTTP que sirve una página de vinculación con QR + pairing code.
// Pensado para Railway: levanta en el puerto que asigna RAILWAY ($PORT),
// y queda accesible vía el dominio público generado.
//
// La página se auto-refresca cada 5 segundos vía polling JSON.
// Toda la información sensible (QR, código) está detrás de un token
// que se envía como query param: ?token=XXX
//
// Si AUTH_SERVER_TOKEN no está en env vars, se genera uno random al
// arrancar y se imprime en logs.

import http from 'http';
import crypto from 'crypto';
import qrcode from 'qrcode';
import { analyze } from './diagnostics.js';

// ─── Token de acceso ─────────────────────────────────────────────────────
const TOKEN = process.env.AUTH_SERVER_TOKEN || crypto.randomBytes(8).toString('hex');

export function getAuthServerToken() { return TOKEN; }

// ─── Estado compartido (mutado desde index.js) ───────────────────────────
const state = {
  qr: null,
  pairingCode: null,
  pairingGeneratedAt: null,
  pairingExpiresAt: null,
  connected: false,
  phoneNumber: process.env.PHONE_NUMBER || null,
  lastEvent: null,
  lastError: null
};

export function updateAuthState(patch) {
  Object.assign(state, patch);
  state.lastEvent = Date.now();
}

export function recordAuthError(message) {
  state.lastError = { message, at: Date.now() };
}

// ─── Servidor ────────────────────────────────────────────────────────────
export function startAuthServer(port = process.env.PORT || 3000) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Healthcheck público (sin token) — para que Railway no marque caído
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      // Validar token
      const token = url.searchParams.get('token');
      if (token !== TOKEN) {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No autorizado. Agregá ?token=... al URL.');
        return;
      }

      // JSON con el estado actual (para polling de la página)
      if (url.pathname === '/api/state') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        // No exponemos el número completo: solo los últimos 4 dígitos.
        const phoneMasked = state.phoneNumber
          ? '···' + state.phoneNumber.slice(-4)
          : null;
        res.end(JSON.stringify({
          connected: state.connected,
          hasQr: !!state.qr,
          pairingCode: state.pairingCode,
          pairingGeneratedAt: state.pairingGeneratedAt,
          pairingExpiresAt: state.pairingExpiresAt,
          phoneMasked,
          hasPhone: !!state.phoneNumber,
          lastError: state.lastError
        }));
        return;
      }

      // Diagnóstico: eventos recientes + análisis de causa
      if (url.pathname === '/api/debug') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          uptime: process.uptime(),
          memory: process.memoryUsage().rss,
          env: {
            hasPhoneNumber: !!process.env.PHONE_NUMBER,
            hasSupabase: !!process.env.SUPABASE_URL,
            hasRailwayDomain: !!process.env.RAILWAY_PUBLIC_DOMAIN,
            nodeVersion: process.version
          },
          ...analyze()
        }, null, 2));
        return;
      }

      // QR como SVG (alta calidad, liviano)
      if (url.pathname === '/qr.svg') {
        if (!state.qr || state.connected) {
          res.writeHead(410, { 'Content-Type': 'text/plain' });
          res.end('No hay QR disponible.');
          return;
        }
        const svg = await qrcode.toString(state.qr, {
          type: 'svg',
          width: 320,
          margin: 1,
          color: { dark: '#0B1426', light: '#FFFFFF' }
        });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        res.end(svg);
        return;
      }

      // Página principal
      if (url.pathname === '/' || url.pathname === '/vincular') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderPage(token));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (e) {
      console.error('[auth-server]', e);
      res.writeHead(500);
      res.end('Server error');
    }
  });

  server.listen(port, () => {
    const localUrl = `http://localhost:${port}/?token=${TOKEN}`;
    const publicHost = process.env.RAILWAY_PUBLIC_DOMAIN;
    console.log(`\n[auth-server] escuchando en puerto ${port}`);
    console.log(`[auth-server] local:    ${localUrl}`);
    if (publicHost) {
      console.log(`[auth-server] PÚBLICO: https://${publicHost}/?token=${TOKEN}`);
    } else {
      console.log(`[auth-server] (Sin RAILWAY_PUBLIC_DOMAIN — habilitá 'Generate Domain' en Railway → Settings → Networking)`);
    }
    console.log('');
  });

  return server;
}

// ─── HTML de la página de vinculación ────────────────────────────────────
function renderPage(token) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vincular CGS Bot · WhatsApp</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #0451DD 0%, #003BB0 100%);
    color: #0B1426;
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,.2);
    max-width: 480px;
    width: 100%;
    padding: 32px;
  }
  .header { text-align: center; margin-bottom: 24px; }
  .header h1 {
    color: #0451DD;
    font-size: 22px;
    margin: 0 0 4px;
    font-weight: 800;
  }
  .header p { margin: 0; color: #5B6478; font-size: 14px; }

  .status {
    padding: 10px 14px;
    border-radius: 8px;
    background: #F1F5F9;
    color: #5B6478;
    font-size: 13px;
    text-align: center;
    margin-bottom: 20px;
    font-weight: 500;
  }
  .status.connected { background: #ECFDF5; color: #047857; }
  .status.waiting { background: #FFF7ED; color: #B45309; }

  .qr-box {
    background: #F8FAFC;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    margin-bottom: 20px;
  }
  .qr-box img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  .qr-empty {
    height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #5B6478;
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }

  .divider {
    text-align: center;
    color: #5B6478;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin: 24px 0;
    position: relative;
  }
  .divider::before, .divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 35%;
    height: 1px;
    background: #D9DEEA;
  }
  .divider::before { left: 0; }
  .divider::after { right: 0; }

  .code-box {
    background: #0B1426;
    color: #fff;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    margin-bottom: 20px;
  }
  .code-box .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #94A3B8;
    margin-bottom: 12px;
  }
  .code-box .code {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #6EE7B7;
    margin: 0;
  }
  .code-box .meta {
    margin-top: 12px;
    font-size: 11px;
    color: #94A3B8;
  }
  .code-empty {
    background: #F8FAFC;
    color: #5B6478;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    font-size: 13px;
    margin-bottom: 20px;
  }

  .instructions {
    background: #EFF6FF;
    border-left: 4px solid #0451DD;
    border-radius: 8px;
    padding: 16px 18px;
    font-size: 13px;
    line-height: 1.5;
  }
  .instructions h3 {
    margin: 0 0 8px;
    color: #0451DD;
    font-size: 13px;
    font-weight: 700;
  }
  .instructions ol { margin: 0; padding-left: 20px; }
  .instructions li { margin-bottom: 4px; }

  .success-banner {
    background: #ECFDF5;
    border: 2px solid #10B981;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    color: #047857;
  }
  .success-banner .icon { font-size: 48px; margin-bottom: 8px; }
  .success-banner h2 { margin: 0 0 4px; color: #047857; font-size: 20px; }
  .success-banner p { margin: 0; font-size: 14px; }
</style>
</head>
<body>

<div class="card">
  <div class="header">
    <h1>Vincular CGS Bot</h1>
    <p>Conexión con WhatsApp</p>
  </div>

  <div id="status" class="status">Cargando estado…</div>

  <div id="connected-view" style="display:none;">
    <div class="success-banner">
      <div class="icon">✅</div>
      <h2>Vinculado correctamente</h2>
      <p>El bot ya está operativo. Podés cerrar esta página.</p>
    </div>
  </div>

  <div id="vincular-view" style="display:none;">

    <div id="error-banner" style="display:none;background:#FEE2E2;border-left:4px solid #DC2626;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;">
      <strong style="color:#DC2626;">Error:</strong>
      <span id="error-text"></span>
    </div>

    <details id="debug-section" style="display:none;background:#F8FAFC;border:1px solid #D9DEEA;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;">
      <summary style="cursor:pointer;font-weight:600;color:#0451DD;">🔍 Diagnóstico (clic para abrir)</summary>
      <div id="debug-content" style="margin-top:12px;">Cargando…</div>
    </details>

    <!-- Opción 1: QR -->
    <div class="qr-box">
      <div class="qr-empty" id="qr-empty">Esperando QR…</div>
      <img id="qr-img" src="" alt="QR" style="display:none;">
    </div>

    <div class="instructions">
      <h3>📷 Opción 1 — Escanear QR</h3>
      <ol>
        <li>Abrí WhatsApp en el teléfono que querés vincular.</li>
        <li>Configuración → <strong>Dispositivos vinculados</strong>.</li>
        <li>Tocá <strong>Vincular un dispositivo</strong> y escaneá este QR.</li>
      </ol>
      <p style="margin-top:10px;font-size:12px;color:#5B6478;">
        💡 Necesitás otra pantalla para que el celular pueda escanear el QR.
      </p>
    </div>

    <div class="divider">O</div>

    <!-- Opción 2: Pairing Code -->
    <div class="code-empty" id="code-empty">Esperando código…</div>
    <div class="code-box" id="code-box" style="display:none;">
      <div class="label">Pairing Code</div>
      <div class="code" id="code-value">--------</div>
      <div class="meta" id="code-meta"></div>
    </div>

    <div class="instructions">
      <h3>⌨️ Opción 2 — Ingresar código</h3>
      <ol>
        <li>Abrí WhatsApp en el teléfono que querés vincular <span id="phone-hint" style="color:#5B6478;font-size:12px;"></span></li>
        <li>Configuración → <strong>Dispositivos vinculados</strong>.</li>
        <li>Tocá <strong>Vincular con número de teléfono</strong>.</li>
        <li>Ingresá el código de 8 caracteres de arriba.</li>
      </ol>
      <p style="margin-top:10px;font-size:12px;color:#5B6478;">
        💡 Si tarda, el código se regenera automáticamente cada 90s.
      </p>
    </div>

  </div>
</div>

<script>
  const TOKEN = ${JSON.stringify(token)};

  async function poll() {
    try {
      const r = await fetch('/api/state?token=' + encodeURIComponent(TOKEN));
      if (!r.ok) return;
      const s = await r.json();
      render(s);

      // Si hay errores recientes, también cargar el debug
      if (s.lastError) loadDebug();
    } catch {}
  }

  async function loadDebug() {
    try {
      const r = await fetch('/api/debug?token=' + encodeURIComponent(TOKEN));
      if (!r.ok) return;
      const d = await r.json();
      renderDebug(d);
    } catch {}
  }

  function renderDebug(d) {
    const section = document.getElementById('debug-section');
    const content = document.getElementById('debug-content');
    section.style.display = '';

    const likelihoodLabels = {
      banned:        { emoji: '🚫', text: 'Probable BAN del número', color: '#DC2626' },
      rate_limited:  { emoji: '⏱️', text: 'Rate-limiting de WhatsApp', color: '#B45309' },
      unstable:      { emoji: '⚠️', text: 'Conexión inestable', color: '#B45309' },
      cant_pair:     { emoji: '❌', text: 'No se puede vincular', color: '#DC2626' },
      should_work:   { emoji: '✅', text: 'Debería funcionar — esperá el próximo intento', color: '#047857' },
      network_issue: { emoji: '🌐', text: 'Problema de red', color: '#B45309' },
      unknown:       { emoji: '❓', text: 'Aún recolectando datos', color: '#5B6478' }
    };
    const lk = likelihoodLabels[d.likelihood] || likelihoodLabels.unknown;

    const sugList = (d.suggestions || []).map(s => '<li>' + escapeHtml(s) + '</li>').join('');
    const eventsList = (d.recentEvents || []).slice(0, 10).map(e => {
      const typeColors = { open: '#047857', close: '#DC2626', pairing_success: '#047857', pairing_error: '#DC2626', pairing_attempt: '#0451DD', connecting: '#5B6478', qr: '#0451DD', auth_cleanup: '#B45309' };
      const color = typeColors[e.type] || '#5B6478';
      const reasonText = e.reason ? ' · ' + e.reason.name : '';
      const statusText = e.statusCode ? ' [' + e.statusCode + ']' : '';
      const msgText = e.message ? ' — ' + escapeHtml(e.message.slice(0, 80)) : '';
      return '<li><span style="color:#9CA3AF;font-family:monospace;">' + e.relativeTime + '</span> <strong style="color:' + color + ';">' + e.type + '</strong>' + statusText + reasonText + msgText + '</li>';
    }).join('');

    const counters = d.counters || {};
    const countersText = Object.entries(counters)
      .filter(([k, v]) => v > 0)
      .map(([k, v]) => '<code>' + k + '</code>: ' + v)
      .join(' · ');

    content.innerHTML = \`
      <div style="margin-bottom:12px;">
        <strong style="color: \${lk.color};">\${lk.emoji} \${escapeHtml(lk.text)}</strong>
      </div>
      \${sugList ? '<div style="background:#fff;padding:10px;border-radius:6px;margin-bottom:12px;"><strong style="font-size:11px;text-transform:uppercase;color:#5B6478;">Sugerencias</strong><ul style="margin:6px 0 0;padding-left:18px;">' + sugList + '</ul></div>' : ''}
      \${countersText ? '<div style="font-size:11px;color:#5B6478;margin-bottom:12px;">' + countersText + '</div>' : ''}
      <strong style="font-size:11px;text-transform:uppercase;color:#5B6478;">Eventos recientes</strong>
      <ul style="margin:6px 0 0;padding-left:18px;font-family:monospace;font-size:11px;line-height:1.7;">
        \${eventsList || '<li><em>Sin eventos todavía</em></li>'}
      </ul>
    \`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render(s) {
    const statusEl = document.getElementById('status');
    const connectedView = document.getElementById('connected-view');
    const vincularView = document.getElementById('vincular-view');
    const errorBanner = document.getElementById('error-banner');

    if (s.connected) {
      statusEl.className = 'status connected';
      statusEl.textContent = '✓ Conectado a WhatsApp';
      connectedView.style.display = '';
      vincularView.style.display = 'none';
      return;
    }

    statusEl.className = 'status waiting';
    statusEl.textContent = 'Esperando vinculación…';
    connectedView.style.display = 'none';
    vincularView.style.display = '';

    // Error si lo hay
    if (s.lastError && Date.now() - s.lastError.at < 60000) {
      errorBanner.style.display = '';
      document.getElementById('error-text').textContent = s.lastError.message;
    } else {
      errorBanner.style.display = 'none';
    }

    // QR
    const qrImg = document.getElementById('qr-img');
    const qrEmpty = document.getElementById('qr-empty');
    if (s.hasQr) {
      qrImg.src = '/qr.svg?token=' + encodeURIComponent(TOKEN) + '&t=' + Date.now();
      qrImg.style.display = '';
      qrEmpty.style.display = 'none';
    } else {
      qrImg.style.display = 'none';
      qrEmpty.style.display = '';
    }

    // Pairing Code
    const phoneHint = document.getElementById('phone-hint');
    if (phoneHint) {
      phoneHint.textContent = s.phoneMasked ? '(terminado en ' + s.phoneMasked.slice(-4) + ')' : '';
    }

    const codeBox = document.getElementById('code-box');
    const codeEmpty = document.getElementById('code-empty');
    const codeValue = document.getElementById('code-value');
    const codeMeta = document.getElementById('code-meta');
    if (s.pairingCode) {
      codeBox.style.display = '';
      codeEmpty.style.display = 'none';
      codeValue.textContent = s.pairingCode;
      if (s.pairingExpiresAt) {
        const ms = s.pairingExpiresAt - Date.now();
        const secs = Math.max(0, Math.floor(ms / 1000));
        codeMeta.textContent = 'Se renueva en ' + secs + 's';
      } else {
        codeMeta.textContent = '';
      }
    } else {
      codeBox.style.display = 'none';
      codeEmpty.style.display = '';
    }
  }

  poll();
  setInterval(poll, 4000);
</script>

</body>
</html>`;
}
