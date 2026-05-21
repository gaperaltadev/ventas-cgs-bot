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
  // Modo de vinculación: 'code' si hay PHONE_NUMBER, 'qr' si no.
  // En modo 'code' Baileys no emite QR y solo se usa pairing code.
  // En modo 'qr' Baileys emite QR y no se genera pairing code.
  mode: process.env.PHONE_NUMBER ? 'code' : 'qr',
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
        res.end(JSON.stringify({
          mode: state.mode,
          connected: state.connected,
          hasQr: !!state.qr,
          pairingCode: state.pairingCode,
          pairingGeneratedAt: state.pairingGeneratedAt,
          pairingExpiresAt: state.pairingExpiresAt,
          phoneNumber: state.phoneNumber,
          lastError: state.lastError
        }));
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

    <!-- Modo QR -->
    <div id="qr-section" style="display:none;">
      <div class="qr-box">
        <div class="qr-empty" id="qr-empty">Generando código QR…</div>
        <img id="qr-img" src="" alt="QR" style="display:none;">
      </div>

      <div class="instructions">
        <h3>📷 Cómo vincular con QR</h3>
        <ol>
          <li>Abrí WhatsApp en el teléfono que querés vincular.</li>
          <li>Configuración → <strong>Dispositivos vinculados</strong>.</li>
          <li>Tocá <strong>Vincular un dispositivo</strong> y escaneá este QR con la cámara.</li>
        </ol>
      </div>
    </div>

    <!-- Modo Pairing Code -->
    <div id="code-section" style="display:none;">
      <div class="code-empty" id="code-empty">Generando código…</div>
      <div class="code-box" id="code-box" style="display:none;">
        <div class="label">Pairing Code</div>
        <div class="code" id="code-value">--------</div>
        <div class="meta" id="code-meta"></div>
      </div>

      <div class="instructions">
        <h3>⌨️ Cómo vincular con código</h3>
        <ol>
          <li>Abrí WhatsApp en el teléfono cuyo número es <strong id="phone-display">…</strong></li>
          <li>Configuración → <strong>Dispositivos vinculados</strong>.</li>
          <li>Tocá <strong>Vincular con número de teléfono</strong>.</li>
          <li>Ingresá el código de 8 caracteres de arriba.</li>
        </ol>
        <p style="margin-top:10px;font-size:12px;color:#5B6478;">
          💡 Si el código expira, esperá 90s — se regenera automáticamente.
        </p>
      </div>
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
    } catch {}
  }

  function render(s) {
    const statusEl = document.getElementById('status');
    const connectedView = document.getElementById('connected-view');
    const vincularView = document.getElementById('vincular-view');
    const qrSection = document.getElementById('qr-section');
    const codeSection = document.getElementById('code-section');
    const errorBanner = document.getElementById('error-banner');

    if (s.connected) {
      statusEl.className = 'status connected';
      statusEl.textContent = '✓ Conectado a WhatsApp';
      connectedView.style.display = '';
      vincularView.style.display = 'none';
      return;
    }

    statusEl.className = 'status waiting';
    statusEl.textContent = 'Esperando vinculación · modo ' + (s.mode === 'qr' ? 'QR' : 'Pairing Code');
    connectedView.style.display = 'none';
    vincularView.style.display = '';

    // Mostrar solo el modo activo
    qrSection.style.display = s.mode === 'qr' ? '' : 'none';
    codeSection.style.display = s.mode === 'code' ? '' : 'none';

    // Error si lo hay
    if (s.lastError && Date.now() - s.lastError.at < 60000) {
      errorBanner.style.display = '';
      document.getElementById('error-text').textContent = s.lastError.message;
    } else {
      errorBanner.style.display = 'none';
    }

    // Render QR (modo qr)
    if (s.mode === 'qr') {
      const qrImg = document.getElementById('qr-img');
      const qrEmpty = document.getElementById('qr-empty');
      if (s.hasQr) {
        qrImg.src = '/qr.svg?token=' + encodeURIComponent(TOKEN) + '&t=' + Date.now();
        qrImg.style.display = '';
        qrEmpty.style.display = 'none';
      } else {
        qrImg.style.display = 'none';
        qrEmpty.style.display = '';
        qrEmpty.textContent = 'Esperando QR de WhatsApp… (puede tardar 10–30s al arrancar)';
      }
    }

    // Render Pairing Code (modo code)
    if (s.mode === 'code') {
      const phoneDisplay = document.getElementById('phone-display');
      if (phoneDisplay) phoneDisplay.textContent = s.phoneNumber || '—';

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
          codeMeta.textContent = 'Para el número ' + s.phoneNumber + ' · se renueva en ' + secs + 's';
        } else {
          codeMeta.textContent = 'Para el número ' + s.phoneNumber;
        }
      } else {
        codeBox.style.display = 'none';
        codeEmpty.style.display = '';
        codeEmpty.textContent = 'Generando código… (puede tardar 5–15s al arrancar)';
      }
    }
  }

  poll();
  setInterval(poll, 4000);
</script>

</body>
</html>`;
}
