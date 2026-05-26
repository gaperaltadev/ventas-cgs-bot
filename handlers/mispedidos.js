import { listarPedidos, listarTotalesPedidos } from '../lib/pedidos.js';

const ESTADO_EMOJI = {
  pendiente:  '🟡',
  confirmado: '🟢',
  entregado:  '🔵',
  cancelado:  '⚫'
};

export async function handleMisPedidos(args, waPhone) {
  const periodo = (args[0] || 'hoy').toLowerCase();
  const esHoy   = periodo === 'hoy';
  const esSemana = periodo === 'semana';

  if (!esHoy && !esSemana) {
    return 'Opción no válida.\n👉 Usá */mispedidos* para ver hoy o */mispedidos semana* para los últimos 7 días.';
  }

  const { items, error } = await listarPedidos(waPhone, { periodo });

  if (error) return 'Error al obtener tus pedidos. Intentá de nuevo en un momento.';
  if (!items.length) {
    const cuándo = esHoy ? 'hoy' : 'esta semana';
    return `No tenés pedidos registrados ${cuándo}.\n👉 Cargá el primero con */pedido*.`;
  }

  // ─── Totales USD en una sola consulta ────────────────────────────────────
  const ids = items.map(p => p.id);
  const totalesMap = await listarTotalesPedidos(ids);

  // ─── Armar respuesta ──────────────────────────────────────────────────────
  const titulo = esHoy ? 'hoy' : 'últimos 7 días';

  // Totales globales
  const totalUds = items.reduce((s, p) => s + (p.total_unidades || 0), 0);
  const totalUsd = items.reduce((s, p) => s + (totalesMap[p.id] || 0), 0);
  const resumen  = totalUsd > 0
    ? `${items.length} pedido${items.length > 1 ? 's' : ''} · ${totalUds} uds · *USD ${totalUsd.toFixed(2)}*`
    : `${items.length} pedido${items.length > 1 ? 's' : ''} · ${totalUds} uds`;

  const lineas = items.map(p => {
    const emoji  = ESTADO_EMOJI[p.estado] || '⚪';
    const hora   = new Date(p.created_at).toLocaleString('es-PY', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const monto  = totalesMap[p.id] > 0 ? ` · USD ${Number(totalesMap[p.id]).toFixed(2)}` : '';
    const ciudad = p.ciudad ? ` · ${p.ciudad}` : '';
    return (
      `${emoji} *#${p.id}* · ${hora}\n` +
      `   ${p.razon_social}${ciudad}\n` +
      `   ${p.num_items} prod · ${p.total_unidades} uds${monto}`
    );
  }).join('\n\n');

  return `📦 *Mis pedidos — ${titulo}*\n${resumen}\n\n${lineas}`;
}
