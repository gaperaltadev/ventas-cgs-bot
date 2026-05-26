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
//
// ─── Fuentes únicas de verdad ────────────────────────────────────────────────
// • CATEGORY_ALIASES (format.js) → alias de categorías y sus slugs de DB.
//   Parser lo importa y deriva CATEGORY_RE de ahí. No se duplica aquí.
// • BOT_COMMANDS (este archivo) → palabras que activan comandos reales del bot.
//   KNOWN_COMMANDS_RE y PEDIDO_FLOW_ESCAPE_RE se construyen desde esta lista.
// ════════════════════════════════════════════════════════════════════════════

import { CATEGORY_ALIASES } from './format.js';

// ─── Comandos reales del bot que pueden escapar un flujo activo ──────────────
// Solo incluir activadores de comandos. NO incluir nombres de producto/categoría
// (esos vienen de CATEGORY_ALIASES en format.js).
const BOT_COMMANDS = [
  // Catálogo
  'catalogo', 'lista', 'productos', 'que tenes', 'que tienen', 'ver todo', 'ver catalogo',
  // Ayuda / navegación
  'ayuda', 'help', 'hola', 'inicio', 'que puedo hacer', 'comandos', 'menu',
  // Salir / cancelar
  'salir', 'chau', 'chao', 'bye', 'exit', 'adios', 'cancelar', 'cancel',
  // Búsqueda explícita
  'buscar', 'busca', 'busco', 'search',
  // Guía de aceite
  'guia', 'guia', 'recomendacion', 'recomendacion',
  // Pedidos
  'pedido', 'pedidos', 'mispedidos', 'mispedidos hoy', 'mispedidos semana',
  'mis pedidos', 'mis pedidos hoy', 'mis pedidos semana',
  // Reportes
  'ventas', 'ventas hoy', 'ventas semana', 'resumen',
  'cuanto vendimos', 'que vendimos', 'que vendimos hoy',
  'top', 'top 5', 'ranking', 'mas vendidos', 'mejores'
];

// ─── Construcción de regexes derivadas ──────────────────────────────────────
// Una sola función; si cambia BOT_COMMANDS o CATEGORY_ALIASES, todo se actualiza.

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildEscapeRe(terms) {
  return new RegExp(`^(${terms.map(escapeRe).join('|')})(\\s.+)?$`);
}

const CATEGORY_ALIAS_KEYS = Object.keys(CATEGORY_ALIASES);

// KNOWN_COMMANDS_RE — escapa cualquier flujo (bot commands + aliases de categoría)
const KNOWN_COMMANDS_RE = buildEscapeRe([...BOT_COMMANDS, ...CATEGORY_ALIAS_KEYS]);

// PEDIDO_FLOW_ESCAPE_RE — solo para pasos donde el input es contenido del formulario
// (pedido_esperando_item, pedido_esperando_cliente): los aliases de categoría NO escapan
// porque el usuario puede querer buscar "extravida", "moto", "elaion", etc. como
// nombre de producto o cliente.
const PEDIDO_FLOW_ESCAPE_RE = buildEscapeRe(BOT_COMMANDS);

// CATEGORY_RE — matchea alias de categoría como comando (fuera de flujo activo)
// Derivado de CATEGORY_ALIASES — no se duplica la lista de claves.
const CATEGORY_RE = new RegExp(`^(?:para\\s+)?(${CATEGORY_ALIAS_KEYS.map(escapeRe).join('|')})$`);

// ────────────────────────────────────────────────────────────────────────────

function normalize(text) {
  return String(text).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export function parseIntent(text, session = {}) {
  const t = normalize(text);
  if (!t) return { command: null, args: [] };

  // ─── 1. FlowStep activo → routing al sub-handler correspondiente ─────────
  // En pasos de "búsqueda libre" (cliente, ítem) usamos PEDIDO_FLOW_ESCAPE_RE
  // para que nombres de producto/categoría lleguen al handler y no escapen.
  // En otros pasos usamos KNOWN_COMMANDS_RE (más amplia).

  if (session?.flowStep === 'pedido_esperando_cliente'
      && !PEDIDO_FLOW_ESCAPE_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_buscar_cliente__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_alta_nombre'
      && !KNOWN_COMMANDS_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_alta_nombre__', args: t.split(/\s+/) };
  }
  // Legacy: pedido_alta_cliente → mismo handler que alta_nombre
  if (session?.flowStep === 'pedido_alta_cliente'
      && !KNOWN_COMMANDS_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_alta_nombre__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_esperando_item'
      && !PEDIDO_FLOW_ESCAPE_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_esperando_item__', args: t.split(/\s+/) };
  }
  // Legacy: pedido_esperando_items → mismo handler que esperando_item
  if (session?.flowStep === 'pedido_esperando_items'
      && !PEDIDO_FLOW_ESCAPE_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_esperando_item__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_esperando_cantidad'
      && !KNOWN_COMMANDS_RE.test(t) && !t.startsWith('!')) {
    return { command: '__pedido_esperando_cantidad__', args: t.split(/\s+/) };
  }
  if (session?.flowStep === 'pedido_confirmando') {
    if (/^(si|s|sí|ok|dale|confirmo|confirmar)$/.test(t)) return { command: '__pedido_confirmar__', args: ['si'] };
    if (/^(no|n|cancela|cancelar)$/.test(t))               return { command: '__pedido_confirmar__', args: ['no'] };
  }

  // ─── 2. Selección numérica de lista activa ────────────────────────────────
  if (/^[1-5]$/.test(t) && session?.lastResults?.length) {
    return { command: '__select__', args: [parseInt(t) - 1] };
  }

  // ─── 3. Comando con marcador interno (legacy/atajo) ───────────────────────
  if (t.startsWith('!')) {
    const parts = t.split(/\s+/);
    return { command: parts[0], args: parts.slice(1) };
  }

  // ─── 4. Comandos en lenguaje natural ─────────────────────────────────────

  if (/^(catalogo|lista|productos|que tenes|que tienen|ver todo|ver catalogo)$/.test(t)) {
    return { command: '!catalogo', args: [] };
  }

  if (/^(ayuda|help|hola|inicio|que puedo hacer|comandos|menu)$/.test(t)) {
    return { command: '!ayuda', args: [] };
  }

  if (/^(salir|chau|adios|bye|exit|cancelar|cancel)$/.test(t)) {
    return { command: '!salir', args: [] };
  }

  // Categorías — derivado de CATEGORY_ALIASES en format.js (fuente única)
  const catMatch = t.match(CATEGORY_RE);
  if (catMatch) return { command: '!cat', args: [catMatch[1]] };

  const buscarMatch = t.match(/^(buscar|busca|busco|search)(\s+(.+))?$/);
  if (buscarMatch) {
    const bArgs = buscarMatch[3] ? buscarMatch[3].split(/\s+/) : [];
    return { command: '!buscar', args: bArgs };
  }

  const guiaMatch = t.match(/^(guia|guia|recomendacion|recomendacion|que aceite|que aceite)(\s+(.+))?$/);
  if (guiaMatch) {
    const gArgs = guiaMatch[3] ? guiaMatch[3].split(/\s+/) : [];
    return { command: '!guia', args: gArgs };
  }

  const pedidoMatch = t.match(/^(pedido)(\s+(.+))?$/);
  if (pedidoMatch) {
    const pArgs = pedidoMatch[3] ? pedidoMatch[3].split(/\s+/) : [];
    return { command: '!pedido', args: pArgs };
  }

  const mispedidosMatch = t.match(/^(mispedidos|mis pedidos|pedidos)(\s+(semana|hoy))?$/);
  if (mispedidosMatch) {
    return { command: '!mispedidos', args: mispedidosMatch[3] ? [mispedidosMatch[3]] : [] };
  }

  if (/^(ventas|ventas hoy|ventas semana|resumen|cuanto vendimos|que vendimos|que vendimos hoy)$/.test(t)) {
    const args = t.includes('semana') ? ['semana'] : ['hoy'];
    return { command: '!ventas', args };
  }

  if (/^(top|ranking|mas vendidos|top 5|mejores)$/.test(t)) {
    return { command: '!top', args: [] };
  }

  // ─── 5. Solo número (sin sesión activa) → buscar por ID ──────────────────
  if (/^\d+$/.test(t)) {
    return { command: '!p', args: [t] };
  }

  // ─── 6. Texto libre → búsqueda fuzzy ─────────────────────────────────────
  return { command: '!buscar', args: t.split(/\s+/) };
}

export { KNOWN_COMMANDS_RE };

// ─── API pública para mensajes interactivos ──────────────────────────────────
// El worker llama a esta función cuando message_body es de tipo 'interactive'.
// Recibe el ID del botón o lista directamente desde el JSON de Meta.
export function parseInteractive(interactiveId, session = {}) {
  return routeInteractive(interactiveId, session);
}

// ─── Router interno de replies interactivos ──────────────────────────────────
// Mapea el ID del botón/lista al command interno según el flowStep activo.
// Convención de IDs definida en docs/arquitectura.md → "IDs de interactivos".

function routeInteractive(id, session) {
  const step = session?.flowStep;

  // Confirmaciones genéricas (funcionan en cualquier flowStep de confirmación)
  if (id === 'confirm_yes' || id === 'confirm_no') {
    return { command: '__pedido_confirmar__', args: [id === 'confirm_yes' ? 'si' : 'no'] };
  }

  // Selección de cliente desde lista
  if (id.startsWith('cli_')) {
    if (id === 'cli_new')  return { command: '__pedido_alta_ruc__',   args: [] };
    if (id === 'cli_cf')   return { command: '__pedido_consumidor__', args: [] };
    const ruc = id.slice(4);
    return { command: '__pedido_select_cliente__', args: [ruc] };
  }

  // Selección de presentación desde lista
  if (id.startsWith('pres_')) {
    const presId = id.slice(5);
    return { command: '__pedido_select_pres__', args: [presId] };
  }

  // Selección de producto desde lista
  if (id.startsWith('prod_')) {
    const prodId = id.slice(5);
    return { command: '__pedido_select_prod__', args: [prodId] };
  }

  // Acciones del carrito
  if (id === 'cart_add')  return { command: '__pedido_cart_add__',  args: [] };
  if (id === 'cart_done') return { command: '__pedido_cart_done__', args: [] };

  // Alta de cliente nuevo
  if (id === 'alta_confirm') return { command: '__pedido_alta_confirm__', args: [] };
  if (id === 'alta_cancel')  return { command: '__pedido_alta_cancel__',  args: [] };
  if (id === 'alta_nuevo')   return { command: '__pedido_alta_ruc__',     args: [] };
  if (id === 'buscar_otro')  return { command: '__pedido_buscar_cliente__', args: [] };

  // ID no reconocido — loguear y dejar caer al fallback
  console.warn('[parser] interactive ID no reconocido:', id, '| flowStep:', step);
  return { command: null, args: [] };
}
