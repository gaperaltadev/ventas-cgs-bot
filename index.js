// ════════════════════════════════════════════════════════════════════════════
// CGS Bot — Entry point
//
// ESTADO: STUB POST-DEPRECACIÓN DE BAILEYS.
// La arquitectura cambió a Meta WhatsApp Cloud API + n8n como pasarela.
// Este archivo será reescrito como Express server en FASE B.
//
// FASE B — Pendiente (próxima sesión):
//   - Express server con POST /webhook
//   - Auth por header X-N8N-SECRET
//   - parseIntent + handleCommand reusados de lib/parser.js y commands.js
//   - Sesión in-memory por wa_phone (lib/session.js adaptado)
//
// Ver docs/RETOMAR.md para el plan completo de la migración.
// ════════════════════════════════════════════════════════════════════════════

// Validación mínima de entorno para evitar arrancar sin lo esencial.
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Faltan variables de entorno obligatorias:', missing.join(', '));
  console.error('   Configurar en Railway → Service → Variables o en .env local.');
  process.exit(1);
}

console.log('');
console.log('⏸  CGS Bot — entry point en transición');
console.log('   La integración con Baileys fue deprecada.');
console.log('   La reescritura como webhook receiver (Express + Meta Cloud API)');
console.log('   se ejecutará en FASE B. Ver docs/RETOMAR.md.');
console.log('');
console.log('   Este proceso se queda corriendo en idle para no romper');
console.log('   el deployment actual de Railway. Sin actividad WhatsApp.');
console.log('');

// Mantener el proceso vivo (Railway interpretaría exit como crash).
// Cuando FASE B esté lista, reemplazar por app.listen() de Express.
setInterval(() => {}, 1 << 30);
