// Handler de /pedido con flujo guiado multi-paso + atajo directo.
//
// FlowSteps que usa:
//   pedido_esperando_cliente  → el usuario tiene que escribir RUC o nombre
//   pedido_seleccionar_cliente→ el usuario tiene que elegir N de una lista
//   pedido_alta_cliente       → el RUC no existe, esperando razón social
//   pedido_esperando_items    → cliente confirmado, esperando items
//   pedido_confirmando        → resumen mostrado, esperando si/no

import {
  buscarCliente,
  crearCliente,
  crearPedido,
  parseItemsString,
  validarItems,
  looksLikeRuc,
  normalizeRuc
} from '../lib/pedidos.js';
import { supabase } from '../lib/supabase.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers de formato
// ═══════════════════════════════════════════════════════════════════════════

function resumenItems(items, prodNameMap) {
  return items.map(i => {
    const name = prodNameMap ? (prodNameMap.get(i.productId) || `[${i.productId}]`) : `[${i.productId}]`;
    return `  • ${name} ×${i.quantity}`;
  }).join('\n');
}

function totalUnidades(items) {
  return items.reduce((s, i) => s + i.quantity, 0);
}

function mensajeConfirmacion(cliente, items, prodNameMap) {
  const total = totalUnidades(items);
  return [
    '*Confirmá el pedido*',
    '',
    `Cliente: *${cliente.razon_social}*`,
    `RUC: ${cliente.ruc}` + (cliente.ciudad ? ` · ${cliente.ciudad}` : ''),
    '',
    resumenItems(items, prodNameMap),
    '',
    `Total: *${total} unidad${total > 1 ? 'es' : ''}* (${items.length} producto${items.length > 1 ? 's' : ''})`,
    '',
    '👉 Respondé *si* para confirmar o *no* para cancelar.'
  ].join('\n');
}

// Resuelve nombres de productos en bloque (1 query)
async function fetchProdNames(items) {
  const ids = items.map(i => i.productId);
  const { data } = await supabase
    .from('products')
    .select('id, name')
    .in('id', ids);
  return new Map((data ?? []).map(p => [p.id, `[${p.id}] ${p.name}`]));
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry point: /pedido [args]
// ═══════════════════════════════════════════════════════════════════════════
export async function handlePedido(args, jid) {
  const vendedorTelefono = jid.split('@')[0];

  // /pedido sin args → flujo guiado paso 1
  if (!args.length) {
    return {
      text: '¿Para qué cliente? Escribí *RUC* o *nombre*.\n👉 Ej: *80012345-1* o *autorepuestos san lorenzo*',
      _session: {
        flowStep: 'pedido_esperando_cliente',
        pedidoDraft: {}
      }
    };
  }

  // /pedido RUC items... → atajo directo
  const primerArg = args[0];
  const itemsRaw = args.slice(1).join(' ');

  const busqueda = await buscarCliente(primerArg);

  if (!busqueda.exact) {
    // ¿El primer arg parecía un RUC pero no existe? Ofrecer alta.
    if (busqueda.rucProbable) {
      return {
        text: `No tengo registrado el RUC *${busqueda.rucProbable}*.\n👉 Mandame el *nombre / razón social* del cliente para darlo de alta.`,
        _session: {
          flowStep: 'pedido_alta_cliente',
          pedidoDraft: { rucNuevo: busqueda.rucProbable, itemsRaw }
        }
      };
    }
    // No parecía RUC y no encontró nada → tratar como búsqueda guiada
    if (busqueda.matches.length === 0) {
      return `No encontré ningún cliente con "*${primerArg}*".\n👉 Probá con el RUC, o creá uno nuevo escribiendo el RUC completo.`;
    }
    // Múltiples matches por nombre → lista para elegir
    return mostrarSeleccionClientes(busqueda.matches, itemsRaw);
  }

  // Cliente exacto encontrado por RUC
  return await procesarConCliente(busqueda.exact, itemsRaw, vendedorTelefono);
}

// ═══════════════════════════════════════════════════════════════════════════
// FlowStep: pedido_esperando_cliente
// El usuario respondió con RUC o texto. Misma lógica que /pedido <arg>.
// ═══════════════════════════════════════════════════════════════════════════
export async function handlePedidoBuscarCliente(args, session, jid) {
  return handlePedido(args, jid);
}

// ═══════════════════════════════════════════════════════════════════════════
// FlowStep: pedido_seleccionar_cliente (lista de matches por nombre)
// Usa __select__ → reenviamos acá si el lastAction === 'pedido'
// ═══════════════════════════════════════════════════════════════════════════
function mostrarSeleccionClientes(matches, itemsRaw = '') {
  const lineas = matches.slice(0, 5).map((c, i) =>
    `  ${i + 1}. ${c.razon_social} · RUC ${c.ruc}${c.ciudad ? ' · ' + c.ciudad : ''}`
  ).join('\n');

  return {
    text: `Encontré varios clientes:\n\n${lineas}\n\n👉 Escribí *1*, *2*... para elegir.`,
    _session: {
      lastResults: matches.slice(0, 5),
      lastAction: 'pedido',
      flowStep: 'pedido_seleccionar_cliente',
      pedidoDraft: { itemsRaw }
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FlowStep: pedido_alta_cliente
// El usuario escribió el nombre del cliente nuevo.
// ═══════════════════════════════════════════════════════════════════════════
export async function handlePedidoAltaCliente(args, session, jid) {
  const vendedorTelefono = jid.split('@')[0];
  const razonSocial = args.join(' ').trim();

  if (razonSocial.length < 3) {
    return {
      text: 'Necesito el nombre completo (al menos 3 caracteres).\n👉 Ej: *Lubricentro El Roble SRL*',
      _session: { ...session }
    };
  }

  const { rucNuevo, itemsRaw } = session.pedidoDraft || {};
  if (!rucNuevo) {
    return 'Perdí el estado del pedido. Empezá de nuevo con */pedido*.';
  }

  const alta = await crearCliente({
    ruc: rucNuevo,
    razonSocial,
    vendedorTelefono
  });

  if (alta.error) {
    return `Error al dar de alta el cliente: ${alta.error}\n👉 Intentá de nuevo o avisá al admin.`;
  }

  // Cliente creado. Si hay itemsRaw, seguimos con el pedido directamente.
  return await procesarConCliente(alta.cliente, itemsRaw, vendedorTelefono, {
    extraMsg: `✅ Cliente dado de alta: *${alta.cliente.razon_social}*\n\n`
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FlowStep: pedido_esperando_items
// Cliente confirmado, el usuario manda los items "ID cant, ID cant".
// ═══════════════════════════════════════════════════════════════════════════
export async function handlePedidoItems(args, session, jid) {
  const vendedorTelefono = jid.split('@')[0];
  const itemsRaw = args.join(' ');
  const cliente = session.pedidoDraft?.cliente;

  if (!cliente) {
    return 'Perdí el estado del pedido. Empezá de nuevo con */pedido*.';
  }

  return await procesarItems(cliente, itemsRaw, vendedorTelefono);
}

// ═══════════════════════════════════════════════════════════════════════════
// FlowStep: pedido_confirmando
// El usuario respondió si/no a la confirmación.
// ═══════════════════════════════════════════════════════════════════════════
export async function handlePedidoConfirmar(args, session, jid) {
  const respuesta = (args[0] || '').toLowerCase();
  const draft = session.pedidoDraft;

  if (!draft?.cliente || !draft?.items) {
    return 'Perdí el estado del pedido. Empezá de nuevo con */pedido*.';
  }

  if (respuesta === 'no' || respuesta === 'cancelar') {
    return 'Pedido cancelado. 👋';
  }

  // Confirmar → crear el pedido
  const vendedorTelefono = jid.split('@')[0];
  const res = await crearPedido({
    clienteRuc: draft.cliente.ruc,
    vendedorTelefono,
    items: draft.items
  });

  if (res.error) {
    return {
      text: `Error al registrar el pedido: ${res.error === 'db_error' ? res.message : res.error}\n👉 Intentá de nuevo o avisá al admin.`,
      _session: { ...session }  // mantiene el draft para reintento
    };
  }

  const total = totalUnidades(draft.items);
  return [
    `✅ *Pedido #${res.pedidoId} registrado*`,
    `Cliente: ${draft.cliente.razon_social}`,
    `Total: ${total} unidades · ${draft.items.length} producto${draft.items.length > 1 ? 's' : ''}`,
    `🕐 ${new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`,
    '',
    '👉 */mispedidos* para ver tus pedidos del día'
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: __select__ delegado a /pedido cuando lastAction='pedido'
// ═══════════════════════════════════════════════════════════════════════════
export async function handleSelectCliente(idx, session, jid) {
  const cliente = (session.lastResults || [])[idx];
  if (!cliente) {
    return `Ese número no está en la lista.\n👉 Probá de nuevo.`;
  }

  const itemsRaw = session.pedidoDraft?.itemsRaw || '';
  const vendedorTelefono = jid.split('@')[0];
  return await procesarConCliente(cliente, itemsRaw, vendedorTelefono);
}

// ═══════════════════════════════════════════════════════════════════════════
// Lógica común: con cliente confirmado, procesar items (o pedirlos)
// ═══════════════════════════════════════════════════════════════════════════
async function procesarConCliente(cliente, itemsRaw, vendedorTelefono, { extraMsg = '' } = {}) {
  // Si no hay items todavía → pedirlos
  if (!itemsRaw || !itemsRaw.trim()) {
    return {
      text: `${extraMsg}✅ Cliente: *${cliente.razon_social}*\n\n¿Qué productos vas a cargar?\nFormato: *ID cantidad, ID cantidad...*\n👉 Ej: *20 5, 26 2*`,
      _session: {
        flowStep: 'pedido_esperando_items',
        pedidoDraft: { cliente }
      }
    };
  }
  return await procesarItems(cliente, itemsRaw, vendedorTelefono, { extraMsg });
}

// ═══════════════════════════════════════════════════════════════════════════
// Lógica común: parsear y validar items, mostrar confirmación
// ═══════════════════════════════════════════════════════════════════════════
async function procesarItems(cliente, itemsRaw, vendedorTelefono, { extraMsg = '' } = {}) {
  const items = parseItemsString(itemsRaw);
  const v = validarItems(items);

  if (!v.ok) {
    const errMsg = {
      sin_items: 'No reconocí ningún producto.',
      id_invalido: `Formato inválido en: "${v.raw}".`,
      cantidad_invalida: `Cantidad inválida en: "${v.raw}".`
    }[v.error] || 'Error en el formato.';

    return {
      text: `${errMsg}\n👉 Formato: *ID cantidad, ID cantidad...*\nEj: *20 5, 26 2*`,
      _session: {
        flowStep: 'pedido_esperando_items',
        pedidoDraft: { cliente }
      }
    };
  }

  // Validar que todos los productos existan (no crea el pedido, solo verifica)
  const prodNameMap = await fetchProdNames(items);
  const missing = items.find(i => !prodNameMap.has(i.productId));
  if (missing) {
    return {
      text: `No existe el producto [${missing.productId}].\n👉 Escribí */catalogo* para ver los IDs disponibles.`,
      _session: {
        flowStep: 'pedido_esperando_items',
        pedidoDraft: { cliente }
      }
    };
  }

  // Mostrar resumen + esperar confirmación
  return {
    text: extraMsg + mensajeConfirmacion(cliente, items, prodNameMap),
    _session: {
      flowStep: 'pedido_confirmando',
      pedidoDraft: { cliente, items }
    }
  };
}
