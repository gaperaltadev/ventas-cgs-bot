// Handler de /pedido — flujo interactivo completo con botones y listas Meta.
//
// Respuestas que devuelve:
//   string                               → texto plano (worker → sendToMeta)
//   { text, _session? }                  → texto plano con sesión
//   { _type:'buttons', body, buttons, _session? }
//   { _type:'list', body, buttonText, sections, _session? }
//
// FlowSteps con texto libre (parseIntent los captura):
//   pedido_esperando_cliente   → handlePedidoBuscarCliente
//   pedido_alta_nombre         → handlePedidoAltaNombre
//   pedido_esperando_item      → handlePedidoEsperandoItem
//   pedido_esperando_cantidad  → handlePedidoEsperandoCantidad
//
// FlowSteps interactivos (parseInteractive los resuelve a commands):
//   cli_*           → __pedido_select_cliente__ / __pedido_consumidor__ / __pedido_alta_ruc__
//   alta_confirm    → __pedido_alta_confirm__
//   alta_cancel     → __pedido_alta_cancel__
//   buscar_otro     → __pedido_buscar_cliente__ (sin args)
//   confirm_yes/no  → __pedido_confirmar__ (dual: confirma cliente O confirma pedido)
//   prod_*          → __pedido_select_prod__
//   pres_*          → __pedido_select_pres__
//   cart_add        → __pedido_cart_add__
//   cart_done       → __pedido_cart_done__

import {
  buscarCliente,
  crearCliente,
  crearPedido,
  buscarProductosPorNombre,
  buscarProductoPorId,
  buscarPresentaciones
} from '../lib/pedidos.js';
import { getExchangeRate, formatPrice, formatPyg } from '../lib/prices.js';

// RUC fijo para ventas sin cliente identificado (insertado en SQL 09)
const RUC_CF = '00000000-0';

// ─── Helpers de respuesta ────────────────────────────────────────────────────

function textReply(text, session = null) {
  if (!session) return text;
  return { text, _session: session };
}

function buttonsReply(body, buttons, session = null) {
  const res = { _type: 'buttons', body, buttons };
  if (session) res._session = session;
  return res;
}

function listReply(body, buttonText, sections, session = null) {
  const res = { _type: 'list', body, buttonText, sections };
  if (session) res._session = session;
  return res;
}

// ─── Helpers de carrito ──────────────────────────────────────────────────────

function totalUnidades(carrito) {
  return carrito.reduce((s, i) => s + i.qty, 0);
}

function totalCarritoUsd(carrito) {
  return carrito.reduce((s, i) => s + (i.priceUsd || 0) * i.qty, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 1 — Entrada: /pedido
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedido(args, waPhone) {
  return textReply(
    '¿Para qué cliente? Escribí el nombre o RUC.\n' +
    '👉 Ej: *80012345-1* · *distribuidora lopez*',
    { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2 — Buscar cliente (texto libre)
// flowStep: pedido_esperando_cliente
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoBuscarCliente(args, session, waPhone) {
  // Sin args: viene del botón buscar_otro → reiniciar búsqueda
  if (!args.length || !args[0]) {
    return textReply(
      '¿Para qué cliente? Escribí el nombre o RUC:',
      { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
    );
  }

  const termino = args.join(' ').trim();
  const busqueda = await buscarCliente(termino);

  // Encontrado exacto por RUC → botones confirmar/buscar otro
  if (busqueda.exact) {
    const c = busqueda.exact;
    return buttonsReply(
      `✅ *Cliente encontrado*\n${c.razon_social}\nRUC: ${c.ruc}${c.ciudad ? ` · ${c.ciudad}` : ''}`,
      [
        { id: 'confirm_yes', title: 'Continuar ▶' },
        { id: 'confirm_no',  title: 'Buscar otro' }
      ],
      { flowStep: 'pedido_cliente_confirmado', pedidoDraft: { cliente: c } }
    );
  }

  // RUC escrito pero no existe → botones alta/CF/buscar otro
  if (busqueda.rucProbable) {
    return buttonsReply(
      `No tengo registrado el RUC *${busqueda.rucProbable}*.\n¿Qué hacemos?`,
      [
        { id: 'alta_nuevo',  title: '➕ Dar de alta' },
        { id: 'cli_cf',      title: '👤 Consumidor final' },
        { id: 'buscar_otro', title: '🔍 Buscar otro' }
      ],
      {
        flowStep: 'pedido_ruc_no_encontrado',
        pedidoDraft: { rucNuevo: busqueda.rucProbable }
      }
    );
  }

  // Múltiples matches por nombre → lista interactiva
  if (busqueda.matches.length > 0) {
    const rows = busqueda.matches.slice(0, 8).map(c => ({
      id:          `cli_${c.ruc}`,
      title:       c.razon_social.slice(0, 24),
      description: `RUC: ${c.ruc}${c.ciudad ? ' · ' + c.ciudad : ''}`
    }));
    rows.push({ id: 'cli_new', title: '➕ Crear cliente nuevo',  description: 'El cliente no está en la lista' });
    rows.push({ id: 'cli_cf',  title: '👤 Consumidor final',    description: 'Venta sin RUC' });

    return listReply(
      'Encontré estos clientes:',
      'Elegir',
      [{ title: 'Clientes', rows }],
      { flowStep: 'pedido_seleccionar_cliente', pedidoDraft: {} }
    );
  }

  // Sin resultados
  return textReply(
    `No encontré ningún cliente con "*${termino}*".\n` +
    '👉 Probá con el RUC completo o con otro nombre.',
    { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2B — Seleccionar cliente de lista interactiva
// command: __pedido_select_cliente__  args: [ruc]
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoSelectCliente(ruc, session, waPhone) {
  const busqueda = await buscarCliente(ruc);
  const c = busqueda.exact;
  if (!c) {
    return textReply(
      '⚠️ No pude encontrar ese cliente. Intentá buscar de nuevo:',
      { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
    );
  }
  return buttonsReply(
    `✅ *${c.razon_social}*\nRUC: ${c.ruc}${c.ciudad ? ` · ${c.ciudad}` : ''}`,
    [
      { id: 'confirm_yes', title: 'Continuar ▶' },
      { id: 'confirm_no',  title: 'Buscar otro' }
    ],
    { flowStep: 'pedido_cliente_confirmado', pedidoDraft: { cliente: c } }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2D — Alta de cliente: botón "alta_nuevo" → pedir nombre
// command: __pedido_alta_ruc__
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoAltaRuc(session, waPhone) {
  const rucNuevo = session.pedidoDraft?.rucNuevo;
  if (rucNuevo) {
    // El RUC ya está en el draft (viene del estado ruc_no_encontrado)
    return textReply(
      `Escribí el nombre o razón social del cliente:\n_(RUC: ${rucNuevo})_`,
      { flowStep: 'pedido_alta_nombre', pedidoDraft: { rucNuevo } }
    );
  }
  // cli_new desde lista: no hay RUC previo → pedir RUC primero
  return textReply(
    'Escribí el *RUC* del nuevo cliente:',
    { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2D — Alta de cliente: texto con razón social
// flowStep: pedido_alta_nombre
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoAltaNombre(args, session, waPhone) {
  const razonSocial = args.join(' ').trim();
  if (razonSocial.length < 3) {
    return textReply(
      'Necesito el nombre completo del cliente (mínimo 3 caracteres).',
      { ...session }
    );
  }
  const rucNuevo = session.pedidoDraft?.rucNuevo;
  if (!rucNuevo) {
    return textReply('Perdí el RUC. Empezá de nuevo con */pedido*.');
  }
  return buttonsReply(
    `¿Confirmar nuevo cliente?\nRUC: *${rucNuevo}*\nNombre: *${razonSocial}*`,
    [
      { id: 'alta_confirm', title: '✅ Registrar' },
      { id: 'alta_cancel',  title: '❌ Cancelar' }
    ],
    {
      flowStep: 'pedido_alta_confirmando',
      pedidoDraft: { rucNuevo, razonSocialNuevo: razonSocial }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2D — Alta confirmar
// command: __pedido_alta_confirm__
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoAltaConfirm(session, waPhone) {
  const { rucNuevo, razonSocialNuevo } = session.pedidoDraft || {};
  if (!rucNuevo || !razonSocialNuevo) {
    return textReply('Perdí los datos del cliente. Empezá de nuevo con */pedido*.');
  }
  const alta = await crearCliente({ ruc: rucNuevo, razonSocial: razonSocialNuevo, vendedorTelefono: waPhone });
  if (alta.error) {
    if (alta.error === 'cliente_ya_existe') {
      return textReply(
        `⚠️ El RUC *${rucNuevo}* ya existe.\n👉 Buscalo con */pedido ${rucNuevo}*.`
      );
    }
    return textReply('❌ Error al registrar el cliente. Avisá al admin.');
  }
  const c = alta.cliente;
  return textReply(
    `✅ *${c.razon_social}* dado de alta\n\n` +
    `¿Qué productos? Escribí nombre o ID.\n👉 Ej: *elaion 20w50* · *37*`,
    { flowStep: 'pedido_esperando_item', pedidoDraft: { cliente: c, carrito: [] } }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2D — Alta cancelar
// command: __pedido_alta_cancel__
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoAltaCancel(session, waPhone) {
  return textReply(
    '¿Para qué cliente? Escribí el nombre o RUC:',
    { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Consumidor final
// command: __pedido_consumidor__
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoConsumidorFinal(session, waPhone) {
  const busqueda = await buscarCliente(RUC_CF);
  const cf = busqueda.exact || { ruc: RUC_CF, razon_social: 'CONSUMIDOR FINAL', ciudad: null };
  return textReply(
    `✅ Vendiendo a *${cf.razon_social}*\n\n` +
    `¿Qué productos? Escribí nombre o ID.\n👉 Ej: *elaion 20w50* · *extravida* · *37*`,
    { flowStep: 'pedido_esperando_item', pedidoDraft: { cliente: cf, carrito: [] } }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// confirm_yes / confirm_no — uso dual según flowStep activo
// command: __pedido_confirmar__
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoConfirmar(args, session, waPhone) {
  const si   = args[0] === 'si';
  const step = session.flowStep;

  // — Confirmar cliente encontrado por RUC (Paso 2B) —
  if (step === 'pedido_cliente_confirmado') {
    if (!si) {
      return textReply(
        '¿Para qué cliente? Escribí el nombre o RUC:',
        { flowStep: 'pedido_esperando_cliente', pedidoDraft: {} }
      );
    }
    const cliente = session.pedidoDraft?.cliente;
    if (!cliente) return textReply('Perdí el estado. Empezá de nuevo con */pedido*.');
    return textReply(
      `✅ Cliente: *${cliente.razon_social}*\n\n` +
      `¿Qué productos? Escribí nombre o ID.\n👉 Ej: *elaion 20w50* · *extravida* · *37*`,
      { flowStep: 'pedido_esperando_item', pedidoDraft: { cliente, carrito: [] } }
    );
  }

  // — Confirmar alta de cliente nuevo (Paso 2D) —
  if (step === 'pedido_alta_confirmando') {
    return si
      ? handlePedidoAltaConfirm(session, waPhone)
      : handlePedidoAltaCancel(session, waPhone);
  }

  // — Confirmación final del pedido (Paso 4) —
  if (!si) {
    return textReply('Pedido cancelado. 👋\n👉 Escribí */pedido* para empezar de nuevo.');
  }

  const draft = session.pedidoDraft;
  if (!draft?.cliente || !draft?.carrito?.length) {
    return textReply('Perdí el estado del pedido. Empezá de nuevo con */pedido*.');
  }

  const rate = await getExchangeRate();
  const res  = await crearPedido({
    clienteRuc:       draft.cliente.ruc,
    vendedorTelefono: waPhone,
    items: draft.carrito.map(i => ({
      productId:         i.productId,
      productName:       i.productName,
      presentacionId:    i.presId    ?? null,
      presentacionLabel: i.presLabel ?? null,
      quantity:          i.qty,
      priceUsd:          i.priceUsd  ?? null,
      exchangeRate:      rate
    }))
  });

  if (res.error) {
    const msg = {
      cliente_no_existe:      'El cliente ya no existe en el sistema.',
      vendedor_no_autorizado: 'Tu número no está autorizado. Contactá al admin.',
      db_error:               res.message || 'Error de base de datos.'
    }[res.error] || res.error;
    return textReply(
      `❌ No se pudo registrar: ${msg}\n👉 Intentá de nuevo o avisá al admin.`,
      { ...session }
    );
  }

  const totalUds = totalUnidades(draft.carrito);
  const totalUsd = totalCarritoUsd(draft.carrito);
  return textReply(
    `✅ *Pedido #${res.pedidoId} registrado*\n` +
    `Cliente: ${draft.cliente.razon_social}\n` +
    `${totalUds} unidades · ${formatPrice(totalUsd, rate)}\n` +
    `🕐 ${new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}\n\n` +
    `👉 */mispedidos* para ver tus pedidos del día`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 3 — Esperando ítem (texto libre)
// flowStep: pedido_esperando_item
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoEsperandoItem(args, session, waPhone) {
  const termino = args.join(' ').trim();
  const draft   = session.pedidoDraft;
  if (!draft?.cliente) return textReply('Perdí el estado del pedido. Empezá de nuevo con */pedido*.');

  const rate = await getExchangeRate();

  // ID numérico directo
  if (/^\d+$/.test(termino)) {
    const { producto } = await buscarProductoPorId(parseInt(termino));
    if (!producto) {
      return textReply(
        `No existe el producto [${termino}].\n👉 Escribí */catalogo* para ver los IDs.`,
        { flowStep: 'pedido_esperando_item', pedidoDraft: draft }
      );
    }
    return mostrarPresentaciones(producto, draft, rate);
  }

  // Búsqueda por nombre
  const { items: prods } = await buscarProductosPorNombre(termino);
  if (!prods.length) {
    return textReply(
      `No encontré "*${termino}*".\n👉 Probá con otro nombre o con el ID del producto.`,
      { flowStep: 'pedido_esperando_item', pedidoDraft: draft }
    );
  }

  // Un solo resultado → presentaciones directamente
  if (prods.length === 1) {
    return mostrarPresentaciones(prods[0], draft, rate);
  }

  // Múltiples → lista
  const rows = prods.slice(0, 10).map(p => ({
    id:          `prod_${p.id}`,
    title:       p.name.slice(0, 24),
    description: p.category || ''
  }));
  return listReply(
    'Encontré varios productos — ¿cuál?',
    'Elegir',
    [{ title: 'Productos', rows }],
    { flowStep: 'pedido_seleccionar_producto', pedidoDraft: draft }
  );
}

// ─── Seleccionar producto de lista ──────────────────────────────────────────
// command: __pedido_select_prod__   args: [prodId]

export async function handlePedidoSelectProducto(prodId, session, waPhone) {
  const draft = session.pedidoDraft;
  const { producto } = await buscarProductoPorId(parseInt(prodId));
  if (!producto) {
    return textReply(
      '⚠️ No encontré ese producto. Intentá de nuevo:',
      { flowStep: 'pedido_esperando_item', pedidoDraft: draft }
    );
  }
  const rate = await getExchangeRate();
  return mostrarPresentaciones(producto, draft, rate);
}

// ─── Helper: mostrar presentaciones de un producto ───────────────────────────

async function mostrarPresentaciones(producto, draft, rate) {
  const { items: pres } = await buscarPresentaciones(producto.id);

  if (!pres.length) {
    return textReply(
      `*${producto.name}* no tiene presentaciones cargadas.\n👉 Avisá al admin para que las cargue.`,
      { flowStep: 'pedido_esperando_item', pedidoDraft: draft }
    );
  }

  const itemEnCurso = { productId: producto.id, productName: producto.name };

  // Una sola presentación → saltar directo a cantidad
  if (pres.length === 1) {
    const p = pres[0];
    return textReply(
      `¿Cuántas unidades de *${producto.name} — ${p.label}*?` +
      (p.price_usd ? `\n💵 ${formatPrice(Number(p.price_usd), rate)}` : ''),
      {
        flowStep: 'pedido_esperando_cantidad',
        pedidoDraft: {
          ...draft,
          itemEnCurso: { ...itemEnCurso, presId: p.id, presLabel: p.label, priceUsd: p.price_usd ? Number(p.price_usd) : null }
        }
      }
    );
  }

  // Múltiples → lista de presentaciones
  const rows = pres.map(p => ({
    id:          `pres_${p.id}`,
    title:       p.label.slice(0, 24),
    description: p.price_usd ? formatPrice(Number(p.price_usd), rate) : 'Sin precio cargado'
  }));
  return listReply(
    `*${producto.name}* — elegí la presentación:`,
    'Elegir',
    [{ title: 'Presentaciones', rows }],
    {
      flowStep: 'pedido_seleccionar_presentacion',
      pedidoDraft: { ...draft, itemEnCurso }
    }
  );
}

// ─── Seleccionar presentación de lista ──────────────────────────────────────
// command: __pedido_select_pres__   args: [presId]

export async function handlePedidoSelectPresentacion(presId, session, waPhone) {
  const draft      = session.pedidoDraft;
  const itemEnCurso = draft?.itemEnCurso;
  if (!itemEnCurso) return textReply('Perdí el estado. Empezá de nuevo con */pedido*.');

  const { items: allPres } = await buscarPresentaciones(itemEnCurso.productId);
  const pres = allPres.find(p => String(p.id) === String(presId));
  if (!pres) {
    return textReply(
      '⚠️ No encontré esa presentación.',
      { flowStep: 'pedido_esperando_item', pedidoDraft: draft }
    );
  }
  const rate = await getExchangeRate();
  return textReply(
    `¿Cuántas unidades de *${itemEnCurso.productName} — ${pres.label}*?` +
    (pres.price_usd ? `\n💵 ${formatPrice(Number(pres.price_usd), rate)}` : ''),
    {
      flowStep: 'pedido_esperando_cantidad',
      pedidoDraft: {
        ...draft,
        itemEnCurso: { ...itemEnCurso, presId: pres.id, presLabel: pres.label, priceUsd: pres.price_usd ? Number(pres.price_usd) : null }
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 3 — Cantidad del ítem
// flowStep: pedido_esperando_cantidad
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoEsperandoCantidad(args, session, waPhone) {
  const qty  = parseInt(args[0]);
  const draft = session.pedidoDraft;
  const item  = draft?.itemEnCurso;

  if (!item || !draft?.cliente) return textReply('Perdí el estado. Empezá de nuevo con */pedido*.');
  if (isNaN(qty) || qty <= 0) {
    return textReply(
      '⚠️ Cantidad inválida. Escribí un número mayor a 0.',
      { flowStep: 'pedido_esperando_cantidad', pedidoDraft: draft }
    );
  }

  const rate = await getExchangeRate();
  const subtotalUsd = item.priceUsd ? item.priceUsd * qty : null;

  const carrito = [...(draft.carrito || []), {
    productId:   item.productId,
    productName: item.productName,
    presId:      item.presId   ?? null,
    presLabel:   item.presLabel ?? '',
    priceUsd:    item.priceUsd ?? null,
    qty
  }];

  const totalUds = totalUnidades(carrito);
  const totalUsd = totalCarritoUsd(carrito);

  let carritoInfo = `Carrito: ${carrito.length} producto${carrito.length > 1 ? 's' : ''} · ${totalUds} uds`;
  if (totalUsd > 0) carritoInfo += ` · ${formatPrice(totalUsd, rate)}`;

  const addedMsg =
    `✅ *Agregado al carrito*\n` +
    `${qty}× ${item.productName}${item.presLabel ? ' ' + item.presLabel : ''}` +
    (subtotalUsd ? `\n${formatPrice(subtotalUsd, rate)}` : '') +
    `\n\n${carritoInfo}`;

  return buttonsReply(
    addedMsg,
    [
      { id: 'cart_add',  title: '➕ Agregar otro' },
      { id: 'cart_done', title: '📋 Ver resumen' }
    ],
    { flowStep: 'pedido_esperando_item', pedidoDraft: { cliente: draft.cliente, carrito } }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 3 — Cart add / Cart done
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePedidoCartAdd(session, waPhone) {
  const draft = session.pedidoDraft;
  if (!draft?.cliente) return textReply('Perdí el estado. Empezá de nuevo con */pedido*.');
  return textReply(
    '¿Qué más agregamos? Escribí nombre o ID del producto.',
    { flowStep: 'pedido_esperando_item', pedidoDraft: { cliente: draft.cliente, carrito: draft.carrito || [] } }
  );
}

export async function handlePedidoCartDone(session, waPhone) {
  const draft   = session.pedidoDraft;
  const carrito = draft?.carrito;

  if (!carrito?.length) {
    return textReply(
      'El carrito está vacío. Agregá al menos un producto.',
      { flowStep: 'pedido_esperando_item', pedidoDraft: draft }
    );
  }

  const rate    = await getExchangeRate();
  const totalUds = totalUnidades(carrito);
  const totalUsd = totalCarritoUsd(carrito);

  const items = carrito.map(i => {
    const label = i.presLabel ? ` ${i.presLabel}` : '';
    const precio = i.priceUsd ? `\n  ${formatPrice(i.priceUsd * i.qty, rate)}` : '';
    return `• ${i.qty}× ${i.productName}${label}${precio}`;
  }).join('\n');

  let body = `📋 *PEDIDO — ${draft.cliente.razon_social}*\n\n${items}\n\n`;
  body += `Total: *${totalUds} unidades*`;
  if (totalUsd > 0) {
    body += `\n${formatPrice(totalUsd, rate)}`;
    if (rate) body += `\n_(1 USD = ${formatPyg(rate)})_`;
  }

  return buttonsReply(
    body,
    [
      { id: 'confirm_yes', title: '✅ Confirmar pedido' },
      { id: 'confirm_no',  title: '❌ Cancelar' }
    ],
    { flowStep: 'pedido_confirmando', pedidoDraft: draft }
  );
}
