// Comandos de navegación: /ayuda y /salir.

// ─── /ayuda ──────────────────────────────────────────────────────────────────

export function handleAyuda() {
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

// ─── /salir ──────────────────────────────────────────────────────────────────

export function handleSalir(session) {
  const hayFlujo = !!(session?.flowStep || session?.lastResults?.length);
  return hayFlujo
    ? 'Listo, cancelé lo que tenías abierto. 👋\n👉 Escribí */ayuda* cuando quieras retomar.'
    : 'Hasta luego 👋 Cuando necesites algo, escribí */ayuda*.';
}
