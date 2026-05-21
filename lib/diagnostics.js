// Sistema de diagnóstico para problemas de vinculación.
// Captura todos los eventos de conexión y los expone vía /api/debug.

const MAX_EVENTS = 30;
const events = [];   // ring buffer
const counters = {
  connectingEvents: 0,
  openEvents: 0,
  closeEvents: 0,
  pairingAttempts: 0,
  pairingSuccess: 0,
  pairingErrors: 0,
  qrEvents: 0,
  authInfoCleanups: 0
};

// Mapa de DisconnectReason → interpretación humana.
// (Códigos vienen de @hapi/boom / Baileys DisconnectReason enum)
const DISCONNECT_REASONS = {
  401: { name: 'loggedOut',            severity: 'high',   meaning: 'Sesión cerrada. WhatsApp invalidó la sesión.' },
  403: { name: 'badSession',           severity: 'high',   meaning: 'Sesión inválida o número baneado.' },
  405: { name: 'connectionReplaced',   severity: 'medium', meaning: 'Otra sesión tomó el lugar.' },
  408: { name: 'timedOut',             severity: 'low',    meaning: 'Timeout. Probablemente red lenta.' },
  410: { name: 'restartRequired',      severity: 'low',    meaning: 'Hay que reiniciar la conexión (normal).' },
  411: { name: 'multideviceMismatch',  severity: 'medium', meaning: 'Problema con multi-device. Limpiar auth_info.' },
  428: { name: 'connectionLost',       severity: 'low',    meaning: 'Conexión perdida (red).' },
  440: { name: 'connectionReplaced',   severity: 'medium', meaning: 'Reemplazada por otra conexión.' },
  500: { name: 'restartRequired',      severity: 'low',    meaning: 'Reinicio requerido (normal en flujos largos).' },
  503: { name: 'serviceUnavailable',   severity: 'medium', meaning: 'WhatsApp temporalmente no disponible.' },
  515: { name: 'streamErrored',        severity: 'low',    meaning: 'Stream error, requiere reconectar.' }
};

export function logEvent(type, detail = {}) {
  const event = {
    type,
    at: Date.now(),
    ...detail
  };

  events.unshift(event);
  if (events.length > MAX_EVENTS) events.pop();

  // Actualizar contadores
  if (type === 'connecting')        counters.connectingEvents++;
  if (type === 'open')              counters.openEvents++;
  if (type === 'close')             counters.closeEvents++;
  if (type === 'pairing_attempt')   counters.pairingAttempts++;
  if (type === 'pairing_success')   counters.pairingSuccess++;
  if (type === 'pairing_error')     counters.pairingErrors++;
  if (type === 'qr')                counters.qrEvents++;
  if (type === 'auth_cleanup')      counters.authInfoCleanups++;
}

// Analiza los eventos recientes para diagnosticar el problema.
export function analyze() {
  const recentCloses = events.filter(e => e.type === 'close').slice(0, 10);
  const recentPairingErrors = events.filter(e => e.type === 'pairing_error').slice(0, 10);

  // Detección de baneo: muchos cierres en poco tiempo con errores 401/403
  const banSignals = recentCloses.filter(e =>
    e.statusCode === 401 || e.statusCode === 403
  );

  // Detección de "Connection Closed" repetido sin código → IP block / rate limit
  const connectionClosedWithoutCode = recentPairingErrors.filter(e =>
    /Connection Closed|connection closed|not.*connected/i.test(e.message || '')
  );

  const now = Date.now();
  const last5MinErrors = recentPairingErrors.filter(e => now - e.at < 5 * 60 * 1000);

  let likelihood = 'unknown';
  let suggestions = [];

  // Reglas de decisión
  if (banSignals.length >= 2) {
    likelihood = 'banned';
    suggestions.push('Múltiples desconexiones con código 401/403 sugieren BAN del número.');
    suggestions.push('Esperá 24-48h antes de volver a intentar.');
    suggestions.push('Si persiste, el número de WhatsApp puede haber sido bloqueado permanentemente.');
  } else if (connectionClosedWithoutCode.length >= 5 && last5MinErrors.length >= 5) {
    likelihood = 'rate_limited';
    suggestions.push('Más de 5 "Connection Closed" en los últimos 5 minutos.');
    suggestions.push('WhatsApp está rate-limiting al número o a la IP de Railway.');
    suggestions.push('Esperá 15-30 minutos sin reintentar. El bot va a seguir intentando, considerá pausar el deploy.');
    suggestions.push('Si pasa esto seguido, considerá usar otro número de WhatsApp Business para el bot.');
  } else if (connectionClosedWithoutCode.length >= 2) {
    likelihood = 'unstable';
    suggestions.push('"Connection Closed" recurrente. Causas posibles: red Railway-Meta inestable, estado parcial en auth_info, o cuenta de WhatsApp con restricciones.');
    suggestions.push('Probá: 1) esperá unos minutos, 2) si persiste, redeployá para forzar limpieza de auth_info.');
  } else if (counters.pairingAttempts > 0 && counters.pairingSuccess === 0) {
    likelihood = 'cant_pair';
    suggestions.push('Intentos de pairing fallan consistentemente.');
    suggestions.push('Verificá: 1) PHONE_NUMBER es el correcto y tiene WhatsApp instalado, 2) el número no tiene 2FA con WhatsApp Business, 3) probá redeployar.');
  } else if (counters.pairingSuccess > 0) {
    likelihood = 'should_work';
    suggestions.push('El último intento de pairing fue exitoso. Si la persona no completó la vinculación a tiempo, esperá el próximo código.');
  } else if (counters.openEvents === 0 && counters.connectingEvents > 3) {
    likelihood = 'network_issue';
    suggestions.push('Múltiples intentos de conexión sin llegar al estado "open".');
    suggestions.push('Posible problema de red entre Railway y servidores de Meta.');
  }

  return {
    likelihood,
    suggestions,
    counters,
    recentEvents: events.slice(0, 15).map(e => ({
      type: e.type,
      at: e.at,
      relativeTime: humanRelTime(now - e.at),
      message: e.message,
      statusCode: e.statusCode,
      reason: e.statusCode ? DISCONNECT_REASONS[e.statusCode] : undefined
    }))
  };
}

function humanRelTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function getDisconnectReason(statusCode) {
  return DISCONNECT_REASONS[statusCode];
}
