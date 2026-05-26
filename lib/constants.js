// ════════════════════════════════════════════════════════════════════════════
// Constantes compartidas del bot.
//
// Fuente única de verdad para:
//   · FLOW  — nombres de pasos de flujo conversacional (flowStep)
//   · FLOW_COMMANDS — comandos internos que no limpian sesión
//
// Importar desde aquí en lugar de usar string literals dispersos.
// ════════════════════════════════════════════════════════════════════════════

// ─── Pasos de flujo conversacional ──────────────────────────────────────────
// Usados en pedido.js (al setear session) y parser.js (al leer session).
// Un typo en el string no da error de runtime, solo rompe silenciosamente el
// flujo — por eso se centralizan aquí.

export const FLOW = Object.freeze({
  // Paso 2 — búsqueda y selección de cliente
  PEDIDO_ESPERANDO_CLIENTE:        'pedido_esperando_cliente',
  PEDIDO_SELECCIONAR_CLIENTE:      'pedido_seleccionar_cliente',
  PEDIDO_CLIENTE_CONFIRMADO:       'pedido_cliente_confirmado',
  PEDIDO_RUC_NO_ENCONTRADO:        'pedido_ruc_no_encontrado',
  // Paso 2D — alta de cliente nuevo
  PEDIDO_ALTA_NOMBRE:              'pedido_alta_nombre',
  PEDIDO_ALTA_CONFIRMANDO:         'pedido_alta_confirmando',
  // Paso 3 — selección de productos
  PEDIDO_ESPERANDO_ITEM:           'pedido_esperando_item',
  PEDIDO_SELECCIONAR_PRODUCTO:     'pedido_seleccionar_producto',
  PEDIDO_SELECCIONAR_PRESENTACION: 'pedido_seleccionar_presentacion',
  PEDIDO_ESPERANDO_CANTIDAD:       'pedido_esperando_cantidad',
  // Paso 4 — confirmación final
  PEDIDO_CONFIRMANDO:              'pedido_confirmando',

  // Legacy — mantener para sesiones en vuelo durante deploys
  PEDIDO_ALTA_CLIENTE:             'pedido_alta_cliente',
  PEDIDO_ESPERANDO_ITEMS:          'pedido_esperando_items',
});

// ─── Comandos internos de flujo ──────────────────────────────────────────────
// Comandos que NO limpian la sesión al ejecutarse (pertenecen a un flujo activo).
// Importado por worker.js — fuente única para no duplicar la lista.

export const FLOW_COMMANDS = new Set([
  // Flujo de pedido — texto libre
  '__pedido_buscar_cliente__',
  '__pedido_alta_nombre__',
  '__pedido_esperando_item__',
  '__pedido_esperando_cantidad__',
  '__pedido_confirmar__',
  // Flujo de pedido — interactivos
  '__pedido_select_cliente__',
  '__pedido_select_prod__',
  '__pedido_select_pres__',
  '__pedido_alta_ruc__',
  '__pedido_alta_confirm__',
  '__pedido_alta_cancel__',
  '__pedido_consumidor__',
  '__pedido_cart_add__',
  '__pedido_cart_done__',
  // Selección de lista (browse de catálogo)
  '__select__',
  // Legacy
  '__pedido_alta_cliente__',
  '__pedido_items__',
]);
