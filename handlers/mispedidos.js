import { listarPedidos } from '../lib/pedidos.js';

export async function handleMisPedidos(args, jid) {
  const vendedorTelefono = jid.split('@')[0];
  const { items, error } = await listarPedidos(vendedorTelefono, { limit: 10 });

  if (error) return 'Error al obtener tus pedidos. Intentá de nuevo en un momento.';
  if (!items.length) {
    return 'No tenés pedidos registrados todavía.\n👉 Cargá el primero con */pedido*.';
  }

  const lineas = items.map(p => {
    const fecha = new Date(p.created_at).toLocaleString('es-PY', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const ciudad = p.ciudad ? ` · ${p.ciudad}` : '';
    return `  #${p.id} · ${fecha}\n     ${p.razon_social}${ciudad}\n     ${p.num_items} producto${p.num_items > 1 ? 's' : ''} · ${p.total_unidades} uds · ${p.estado}`;
  }).join('\n\n');

  return `📦 *Tus últimos ${items.length} pedidos*\n\n${lineas}`;
}
