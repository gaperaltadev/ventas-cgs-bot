// Comandos de reportes: /ventas y /ranking.

import { supabase }        from '../lib/supabase.js';
import { CATEGORY_LABELS } from '../lib/format.js';
import { inicioDeHoyPY }   from '../lib/pedidos.js';

// ─── /ventas [hoy|semana] ────────────────────────────────────────────────────

export async function handleVentas(args) {
  const periodo = (args[0] || 'hoy').toLowerCase();
  let desde;

  if (periodo === 'hoy') {
    desde = inicioDeHoyPY();   // medianoche Paraguay (UTC-4), no UTC
  } else if (periodo === 'semana') {
    desde = new Date(); desde.setDate(desde.getDate() - 7);
  } else {
    return `Período no reconocido: "${periodo}".\n👉 Usá */ventas* o */ventas semana*.`;
  }

  const { data, error } = await supabase
    .from('pedido_items')
    .select('product_name, quantity, products(category), pedidos!inner(created_at)')
    .gte('pedidos.created_at', desde.toISOString())
    .order('pedidos(created_at)', { ascending: false });

  if (error) return 'Error al obtener ventas. Intentá de nuevo en un momento.';

  const titulo = periodo === 'hoy' ? 'de hoy' : 'de la semana';
  if (!data?.length) {
    return `Sin ventas registradas ${titulo}.\n👉 Registrá la primera con */pedido*.`;
  }

  const totCat = {};
  let total = 0;
  for (const item of data) {
    const catKey = item.products?.category || 'otros';
    const label  = CATEGORY_LABELS[catKey] || 'Sin categoría';
    totCat[label] = (totCat[label] || 0) + item.quantity;
    total += item.quantity;
  }

  const resumenCat = Object.entries(totCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, qty]) => `  ${cat}: *${qty} uds*`).join('\n');

  const detalle = data.slice(0, 8).map(item => {
    const hora = new Date(item.pedidos.created_at).toLocaleTimeString('es-PY', {
      hour: '2-digit', minute: '2-digit'
    });
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

// ─── /ranking ────────────────────────────────────────────────────────────────

export async function handleTop() {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);

  const { data, error } = await supabase
    .from('pedido_items')
    .select('product_name, quantity, pedidos!inner(created_at)')
    .gte('pedidos.created_at', desde.toISOString());

  if (error) return 'Error al obtener el ranking. Intentá de nuevo en un momento.';
  if (!data?.length) {
    return 'Sin ventas en los últimos 7 días.\n👉 Registrá la primera con */pedido*.';
  }

  const agg = {};
  for (const item of data) {
    agg[item.product_name] = (agg[item.product_name] || 0) + item.quantity;
  }

  const top   = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lines = ['🏆 *Top productos — últimos 7 días*\n'];
  top.forEach(([name, qty], i) => lines.push(`${i + 1}. ${name} — *${qty} uds*`));
  return lines.join('\n');
}
