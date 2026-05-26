// ════════════════════════════════════════════════════════════════════════════
// Router de comandos del bot.
//
// Recibe (command, args, supabase, session, wa_phone) y delega al handler
// correspondiente. La firma se mantiene estable para que el llamador
// (index.js post FASE B) solo arme el payload.
//
// Las decisiones del MVD eliminaron varios comandos:
//   - /vender (venta anónima)  → consolidado en /pedido con CONSUMIDOR FINAL
//   - /destacados              → bajo uso real
//   - Multi-venta              → cubierto por items múltiples en /pedido
// ════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/node';
import { handleBuscar } from './handlers/buscar.js';
import { handleGuia } from './handlers/guia.js';
import {
  handlePedido,
  handlePedidoBuscarCliente,
  handlePedidoSelectCliente,
  handlePedidoAltaRuc,
  handlePedidoAltaNombre,
  handlePedidoAltaConfirm,
  handlePedidoAltaCancel,
  handlePedidoConsumidorFinal,
  handlePedidoConfirmar,
  handlePedidoEsperandoItem,
  handlePedidoSelectProducto,
  handlePedidoSelectPresentacion,
  handlePedidoEsperandoCantidad,
  handlePedidoCartAdd,
  handlePedidoCartDone
} from './handlers/pedido.js';
import { handleMisPedidos } from './handlers/mispedidos.js';
import { CATEGORY_LABELS, CATEGORY_ALIASES, fichaProducto } from './lib/format.js';

// ─── Catálogo de errores ────────────────────────────────────────────────────

const ERR = {
  SIN_ARGS_PRODUCTO: 'Indicá qué producto querés ver.\n👉 Escribí el ID, o un nombre: *elaion 5w30* · *para moto*',
  CATEGORIA_INVALIDA: 'No reconozco esa categoría.\n👉 Opciones: *auto · moto · camion · otros*',
  SIN_LISTA_ACTIVA: 'No hay lista activa para seleccionar.\n👉 Hacé una búsqueda primero. Ej: */buscar 5w30* o */buscar elaion*',
  DB: accion => `Error al ${accion}. Intentá de nuevo en un momento.`,
  ID_NO_EXISTE: id => `No existe el producto [${id}].\n👉 Escribí */catalogo* para ver los IDs disponibles.`,
  SIN_RESULTADOS: term => `No encontré "*${term}*".\n👉 Probá con el ID directo o escribí */catalogo*.`,
  FUERA_DE_RANGO: max => `Ese número no está en la lista (hay ${max} opciones).\n👉 Escribí 1–${max}, o hacé una nueva búsqueda.`
};

// ─── Router ─────────────────────────────────────────────────────────────────

export async function handleCommand(command, args, supabase, session = {}, waPhone = '') {
  switch (command) {
    // Catálogo / consultas
    case '!catalogo':  case '!c':   return cmdCatalogo(supabase);
    case '!producto':  case '!p':   return cmdProducto(args, supabase);
    case '!categoria': case '!cat': return cmdCategoria(args, supabase);
    case '!buscar':    case '!b':   return handleBuscar(args);
    case '!guia':      case '!g':   return handleGuia(args);

    // Pedidos
    case '!pedido':                          return handlePedido(args, waPhone);
    case '!mispedidos':                      return handleMisPedidos(args, waPhone);

    // Reportes
    case '!ventas':                   return cmdVentas(args, supabase);
    case '!top':                      return cmdTop(supabase);

    // Plomería conversacional
    case '!ayuda': case '!a':         return cmdAyuda();
    case '!salir':                    return cmdSalir(session);

    // Comandos internos disparados por el parser (no son visibles al usuario)

    // Flujo de pedido — texto libre (parseIntent)
    case '__pedido_buscar_cliente__':        return handlePedidoBuscarCliente(args, session, waPhone);
    case '__pedido_alta_nombre__':           return handlePedidoAltaNombre(args, session, waPhone);
    case '__pedido_esperando_item__':        return handlePedidoEsperandoItem(args, session, waPhone);
    case '__pedido_esperando_cantidad__':    return handlePedidoEsperandoCantidad(args, session, waPhone);
    case '__pedido_confirmar__':             return handlePedidoConfirmar(args, session, waPhone);

    // Flujo de pedido — interactivos (parseInteractive)
    case '__pedido_select_cliente__':        return handlePedidoSelectCliente(args[0], session, waPhone);
    case '__pedido_alta_ruc__':              return handlePedidoAltaRuc(session, waPhone);
    case '__pedido_alta_confirm__':          return handlePedidoAltaConfirm(session, waPhone);
    case '__pedido_alta_cancel__':           return handlePedidoAltaCancel(session, waPhone);
    case '__pedido_consumidor__':            return handlePedidoConsumidorFinal(session, waPhone);
    case '__pedido_select_prod__':           return handlePedidoSelectProducto(args[0], session, waPhone);
    case '__pedido_select_pres__':           return handlePedidoSelectPresentacion(args[0], session, waPhone);
    case '__pedido_cart_add__':              return handlePedidoCartAdd(session, waPhone);
    case '__pedido_cart_done__':             return handlePedidoCartDone(session, waPhone);

    // Legacy (mantener por compatibilidad con sesiones viejas)
    case '__pedido_alta_cliente__':          return handlePedidoAltaNombre(args, session, waPhone);
    case '__pedido_items__':                 return handlePedidoEsperandoItem(args, session, waPhone);
    case '__select__':
      if (session.lastAction === 'pedido')   return handlePedidoSelectCliente(
        (session.lastResults?.[args[0]]?.ruc), session, waPhone
      );
      return cmdSelect(args, session, supabase);

    default: return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Comandos
// ════════════════════════════════════════════════════════════════════════════

// US-01 — Catálogo completo
async function cmdCatalogo(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[supabase] cmdCatalogo:', error.message, error.code);
    Sentry.captureException(error, { extra: { cmd: 'catalogo' } });
    return ERR.DB('obtener el catálogo');
  }
  if (!data.length) return 'El catálogo está vacío. Contactá al administrador.';

  const grouped = {};
  for (const p of data) {
    const cat = CATEGORY_LABELS[p.category] || p.category;
    (grouped[cat] ??= []).push(`  [${p.id}] ${p.name}`);
  }

  const lines = ['📋 *Catálogo CGS Paraguay*\n'];
  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`*${cat}*`, ...items, '');
  }
  lines.push('👉 Escribí *[ID]* para ver la ficha  o  */pedido [RUC] [ID]* para registrar');
  return lines.join('\n');
}

// US-02 — Ficha por ID
async function cmdProducto(args, supabase) {
  if (!args.length) return ERR.SIN_ARGS_PRODUCTO;

  const num = parseInt(args[0]);
  if (!isNaN(num) && args.length === 1) {
    const { data, error } = await supabase
      .from('products').select('*').eq('id', num).single();
    if (error || !data) {
      if (error) console.error('[supabase] cmdProducto:', error.message, error.code);
      return ERR.ID_NO_EXISTE(num);
    }
    return fichaProducto(data);
  }

  // Si no es solo un ID, delegar a búsqueda fuzzy
  return handleBuscar(args);
}

// US-10 — Filtro por categoría
async function cmdCategoria(args, supabase) {
  if (!args.length) return ERR.CATEGORIA_INVALIDA;

  const aliasKey = String(args[0]).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cat = CATEGORY_ALIASES[aliasKey];
  if (!cat) return ERR.CATEGORIA_INVALIDA;

  const { data, error } = await supabase
    .from('products')
    .select('id, name, viscosity, technology, badge')
    .eq('category', cat)
    .order('sort_order', { ascending: true });

  if (error) return ERR.DB('obtener la categoría');
  if (!data.length) return 'No hay productos en esta categoría.';

  const lines = [`📦 *${CATEGORY_LABELS[cat]}*\n`];
  for (const p of data) {
    const badge = p.badge ? ` 🏷️ ${p.badge}` : '';
    lines.push(`[${p.id}] ${p.name} — ${p.viscosity || p.technology}${badge}`);
  }
  lines.push('\n👉 Escribí *[ID]* para ver la ficha  o  */pedido [RUC] [ID]* para registrar');
  return lines.join('\n');
}

// US-08 — Selección numérica de lista (cuando lastAction !== 'pedido')
async function cmdSelect(args, session, supabase) {
  const idx = parseInt(args[0]);
  const results = session.lastResults || [];

  if (!results.length) return ERR.SIN_LISTA_ACTIVA;
  if (!results[idx]) return ERR.FUERA_DE_RANGO(results.length);

  const selected = results[idx];

  // lastAction === 'ficha' (default): mostrar ficha del producto seleccionado
  // Necesitamos los datos completos del producto; lastResults solo tiene id, name, etc.
  const { data } = await supabase
    .from('products').select('*').eq('id', selected.id).single();
  return data ? fichaProducto(data) : fichaProducto(selected);
}

// US-06 — Resumen de ventas (lee de pedido_items unidos a pedidos)
async function cmdVentas(args, supabase) {
  const periodo = (args[0] || 'hoy').toLowerCase();
  let desde;

  if (periodo === 'hoy') {
    desde = new Date(); desde.setHours(0, 0, 0, 0);
  } else if (periodo === 'semana') {
    desde = new Date(); desde.setDate(desde.getDate() - 7);
  } else {
    return `Período no reconocido: "${periodo}".\n👉 Usá */ventas* o */ventas semana*.`;
  }

  // Leemos pedido_items con join a pedidos para tener categoría/fecha.
  // Como ya consolidamos /vender en /pedido, no necesitamos UNION con sales.
  const { data, error } = await supabase
    .from('pedido_items')
    .select('product_name, quantity, products(category), pedidos!inner(created_at)')
    .gte('pedidos.created_at', desde.toISOString())
    .order('pedidos(created_at)', { ascending: false });

  if (error) return ERR.DB('obtener ventas');

  const titulo = periodo === 'hoy' ? 'de hoy' : 'de la semana';
  if (!data?.length) return `Sin ventas registradas ${titulo}.\n👉 Registrá la primera con */pedido*.`;

  const totCat = {};
  let total = 0;
  for (const item of data) {
    const catKey = item.products?.category || 'otros';
    const label = CATEGORY_LABELS[catKey] || 'Sin categoría';
    totCat[label] = (totCat[label] || 0) + item.quantity;
    total += item.quantity;
  }

  const resumenCat = Object.entries(totCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, qty]) => `  ${cat}: *${qty} uds*`).join('\n');

  const detalle = data.slice(0, 8).map(item => {
    const hora = new Date(item.pedidos.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
    return `  ${hora} · ${item.product_name} ×${item.quantity}`;
  }).join('\n');

  return [
    `📊 *Ventas ${titulo}*\n`,
    resumenCat,
    `*Total: ${total} uds* (${data.length} ítems)\n`,
    '*Detalle:*',
    detalle,
    data.length > 8 ? `  ...y ${data.length - 8} más` : ''
  ].filter(Boolean).join('\n');
}

// US-07 — Ranking top 5 (últimos 7 días)
async function cmdTop(supabase) {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);

  const { data, error } = await supabase
    .from('pedido_items')
    .select('product_name, quantity, pedidos!inner(created_at)')
    .gte('pedidos.created_at', desde.toISOString());

  if (error) return ERR.DB('obtener el ranking');
  if (!data?.length) return 'Sin ventas en los últimos 7 días.\n👉 Registrá la primera con */pedido*.';

  const agg = {};
  for (const item of data) agg[item.product_name] = (agg[item.product_name] || 0) + item.quantity;

  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lines = ['🏆 *Top productos — últimos 7 días*\n'];
  top.forEach(([name, qty], i) => lines.push(`${i + 1}. ${name} — *${qty} uds*`));
  return lines.join('\n');
}

// US-12 — Ayuda
function cmdAyuda() {
  return [
    '🤖 *CGS Bot — Qué puedo hacer*\n',
    '*Registrar un pedido*',
    '  /pedido           → Te guío paso a paso con botones',
    '  /mispedidos       → Tus pedidos de hoy',
    '  /mispedidos semana → Tus pedidos de los últimos 7 días',
    '',
    '*Consultar productos*',
    '  /catalogo         → Lista completa de productos',
    '  /auto  /moto  /camion  → Filtrar por categoría',
    '  /buscar elaion 5w30    → Búsqueda por nombre o viscosidad',
    '  /guia toyota corolla 2018 → Aceite recomendado por vehículo',
    '',
    '*Reportes*',
    '  /ventas           → Lo que se vendió hoy',
    '  /ventas semana    → Últimos 7 días',
    '  /ranking          → Top 5 productos de la semana',
    '',
    '💡 En el flujo de pedido usá los botones y listas que aparecen.',
    '💡 Escribí */salir* en cualquier momento para cancelar.'
  ].join('\n');
}

// US-15 — Cancelar flujo activo
function cmdSalir(session) {
  const hayFlujo = !!(session?.flowStep || session?.lastResults?.length);
  return hayFlujo
    ? 'Listo, cancelé lo que tenías abierto. 👋\n👉 Escribí */ayuda* cuando quieras retomar.'
    : 'Hasta luego 👋 Cuando necesites algo, escribí */ayuda*.';
}
