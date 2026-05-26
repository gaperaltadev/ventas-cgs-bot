// ════════════════════════════════════════════════════════════════════════════
// Router de comandos del bot.
//
// Responsabilidad única: mapear (command, args, session, waPhone) al handler
// correspondiente. Cero lógica de negocio aquí.
//
// Cada grupo de comandos vive en su propio handler:
//   handlers/catalogo.js  → /catalogo, /producto, /categoria, __select__
//   handlers/ventas.js    → /ventas, /ranking
//   handlers/ayuda.js     → /ayuda, /salir
//   handlers/buscar.js    → /buscar
//   handlers/guia.js      → /guia
//   handlers/pedido.js    → /pedido y todo el flujo interactivo
//   handlers/mispedidos.js → /mispedidos
// ════════════════════════════════════════════════════════════════════════════

import { handleCatalogo, handleProducto, handleCategoria, handleSelect } from './handlers/catalogo.js';
import { handleVentas, handleTop }    from './handlers/ventas.js';
import { handleAyuda, handleSalir }   from './handlers/ayuda.js';
import { handleBuscar }               from './handlers/buscar.js';
import { handleGuia }                 from './handlers/guia.js';
import { handleMisPedidos }           from './handlers/mispedidos.js';
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

export async function handleCommand(command, args, session = {}, waPhone = '') {
  switch (command) {
    // ── Catálogo ──────────────────────────────────────────────────────────
    case '!catalogo': case '!c':    return handleCatalogo();
    case '!producto': case '!p':    return handleProducto(args);
    case '!categoria': case '!cat': return handleCategoria(args);
    case '!buscar':   case '!b':    return handleBuscar(args);
    case '!guia':     case '!g':    return handleGuia(args);

    // ── Pedidos ───────────────────────────────────────────────────────────
    case '!pedido':                 return handlePedido(args, waPhone);
    case '!mispedidos':             return handleMisPedidos(args, waPhone);

    // ── Reportes ──────────────────────────────────────────────────────────
    case '!ventas':                 return handleVentas(args);
    case '!top':                    return handleTop();

    // ── Navegación ────────────────────────────────────────────────────────
    case '!ayuda': case '!a':       return handleAyuda();
    case '!salir':                  return handleSalir(session);

    // ── Flujo de pedido — texto libre ─────────────────────────────────────
    case '__pedido_buscar_cliente__':     return handlePedidoBuscarCliente(args, session, waPhone);
    case '__pedido_alta_nombre__':        return handlePedidoAltaNombre(args, session, waPhone);
    case '__pedido_esperando_item__':     return handlePedidoEsperandoItem(args, session, waPhone);
    case '__pedido_esperando_cantidad__': return handlePedidoEsperandoCantidad(args, session, waPhone);
    case '__pedido_confirmar__':          return handlePedidoConfirmar(args, session, waPhone);

    // ── Flujo de pedido — interactivos ────────────────────────────────────
    case '__pedido_select_cliente__':     return handlePedidoSelectCliente(args[0], session, waPhone);
    case '__pedido_alta_ruc__':           return handlePedidoAltaRuc(session, waPhone);
    case '__pedido_alta_confirm__':       return handlePedidoAltaConfirm(session, waPhone);
    case '__pedido_alta_cancel__':        return handlePedidoAltaCancel(session, waPhone);
    case '__pedido_consumidor__':         return handlePedidoConsumidorFinal(session, waPhone);
    case '__pedido_select_prod__':        return handlePedidoSelectProducto(args[0], session, waPhone);
    case '__pedido_select_pres__':        return handlePedidoSelectPresentacion(args[0], session, waPhone);
    case '__pedido_cart_add__':           return handlePedidoCartAdd(session, waPhone);
    case '__pedido_cart_done__':          return handlePedidoCartDone(session, waPhone);

    // ── Selección numérica de lista de browse ─────────────────────────────
    case '__select__':                    return handleSelect(args, session);

    // ── Legacy — mantener mientras haya sesiones antiguas en vuelo ─────────
    case '__pedido_alta_cliente__':       return handlePedidoAltaNombre(args, session, waPhone);
    case '__pedido_items__':              return handlePedidoEsperandoItem(args, session, waPhone);

    default: return null;
  }
}
