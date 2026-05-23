// ════════════════════════════════════════════════════════════════════════════
// parseIntent — pipeline declarativo de detección de intención.
//
// Recibe el texto del usuario + estado de su sesión, devuelve { command, args }
// que el router en commands.js sabe ejecutar.
//
// El pipeline tiene prioridades explícitas:
//   1. Si hay un flowStep activo, el mensaje pertenece a ese flujo
//      (salvo que sea un comando conocido — escape natural).
//   2. Selección numérica de lista activa (cuando lastResults existe).
//   3. Comandos explícitos con prefijo de marcador interno (! para legacy).
//   4. Comandos en lenguaje natural (catalogo, buscar X, vender, etc).
//   5. Solo un número → buscar producto por ID.
//   6. Fallback: texto libre → búsqueda fuzzy.
// ════════════════════════════════════════════════════════════════════════════

// Comandos conocidos: si el usuario los escribe durante un flujo activo,
// se considera "escape" — cancela el flujo y procesa el comando nuevo.
// La regex incluye todos los activadores en lenguaje natural.
const KNOWN_COMMANDS_RE = /^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo|auto|autos|moto|motos|rod|camion|camiones|extravida|pesado|otros|otro|fluido|fluidos|ayuda|help|hola|inicio|que puedo hacer|comandos|menu|salir|chau|chao|bye|exit|adios|cancelar|buscar|busca|busco|search|guia|guía|recomendacion|recomendación|pedido|pedidos|mispedidos|mis pedidos|ventas?( hoy| semana)?|resumen|cuanto vendimos|que vendimos( hoy)?|top( \d+)?|ranking|mas vendidos|mejores)(\s.+)?$/;

function normalize(text) {
  return String(text).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export function parseIntent(text, session = {}) {
  const t = normalize(text);
  if (!t) return { command: null, args: [] };

  // ─── 0. FlowStep activo → routing al sub-handler correspondiente ─────────
  // Excepción: si el usuario escribe un comando conocido, se cancela el flujo
  // y se procesa como comando nuevo (escape natural).

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
    // Cualquier otra cosa → escape al pipeline normal (cancela confirmación)
  }

  // ─── 1. Selección numérica de lista activa ────────────────────────────────
  if (/^[1-5]$/.test(t) && session?.lastResults?.length) {
    return { command: '__select__', args: [parseInt(t) - 1] };
  }

  // ─── 2. Comando con marcador interno (legacy/atajo) ───────────────────────
  if (t.startsWith('!')) {
    const parts = t.split(/\s+/);
    return { command: parts[0], args: parts.slice(1) };
  }

  // ─── 3. Comandos en lenguaje natural ─────────────────────────────────────

  if (/^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo)$/.test(t)) {
    return { command: '!catalogo', args: [] };
  }

  if (/^(ayuda|help|hola|inicio|que puedo hacer|comandos|menu)$/.test(t)) {
    return { command: '!ayuda', args: [] };
  }

  if (/^(salir|chau|adios|bye|exit|cancelar|cancel)$/.test(t)) {
    return { command: '!salir', args: [] };
  }

  const catMatch = t.match(/^(?:para\s+)?(auto|autos|moto|motos|camion|camiones|otros|otro|fluido|fluidos|pesado|rod|elaion|extravida)$/);
  if (catMatch) return { command: '!cat', args: [catMatch[1]] };

  const buscarMatch = t.match(/^(buscar|busca|busco|search)(\s+(.+))?$/);
  if (buscarMatch) {
    const bArgs = buscarMatch[3] ? buscarMatch[3].split(/\s+/) : [];
    return { command: '!buscar', args: bArgs };
  }

  const guiaMatch = t.match(/^(guia|guía|recomendacion|recomendación|que aceite|qué aceite)(\s+(.+))?$/);
  if (guiaMatch) {
    const gArgs = guiaMatch[3] ? guiaMatch[3].split(/\s+/) : [];
    return { command: '!guia', args: gArgs };
  }

  const pedidoMatch = t.match(/^(pedido)(\s+(.+))?$/);
  if (pedidoMatch) {
    const pArgs = pedidoMatch[3] ? pedidoMatch[3].split(/\s+/) : [];
    return { command: '!pedido', args: pArgs };
  }

  if (/^(mispedidos|mis pedidos|pedidos)$/.test(t)) {
    return { command: '!mispedidos', args: [] };
  }

  if (/^(ventas|ventas hoy|ventas semana|resumen|cuanto vendimos|que vendimos|que vendimos hoy)$/.test(t)) {
    const args = t.includes('semana') ? ['semana'] : ['hoy'];
    return { command: '!ventas', args };
  }

  if (/^(top|ranking|mas vendidos|top 5|mejores)$/.test(t)) {
    return { command: '!top', args: [] };
  }

  // ─── 4. Solo número (sin sesión activa) → buscar por ID ──────────────────
  if (/^\d+$/.test(t)) {
    return { command: '!p', args: [t] };
  }

  // ─── 5. Texto libre → búsqueda fuzzy ─────────────────────────────────────
  return { command: '!buscar', args: t.split(/\s+/) };
}

export { KNOWN_COMMANDS_RE };
