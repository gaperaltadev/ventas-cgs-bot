// Lógica de pedidos: búsqueda de clientes, alta on-the-fly, creación de pedidos.
// Todas las operaciones contra Supabase pasan por acá — los handlers solo arman
// el flujo conversacional.

import { supabase } from './supabase.js';

// Detecta si un string tiene forma de RUC paraguayo:
// 6-9 dígitos opcionalmente seguidos de guión + dígito verificador.
const RUC_RE = /^\d{6,9}-?\d?$/;

export function looksLikeRuc(s) {
  return RUC_RE.test(String(s).trim().replace(/\s/g, ''));
}

export function normalizeRuc(s) {
  return String(s).trim().replace(/\s/g, '');
}

// ─── Búsqueda de clientes ────────────────────────────────────────────────────
// Si el término parece un RUC: match exacto + sugerencias fuzzy si no existe.
// Si no parece RUC: búsqueda fuzzy por nombre/ciudad vía pg_trgm.
export async function buscarCliente(termino) {
  const term = String(termino).trim();
  if (!term) return { exact: null, matches: [], rucProbable: null };

  if (looksLikeRuc(term)) {
    const ruc = normalizeRuc(term);
    const { data, error } = await supabase
      .from('clientes')
      .select('ruc, razon_social, ciudad, contacto, telefono')
      .eq('ruc', ruc)
      .maybeSingle();

    if (error) console.error('[buscarCliente]', error.message);
    if (data) return { exact: data, matches: [data], rucProbable: ruc };
    return { exact: null, matches: [], rucProbable: ruc };
  }

  const { data, error } = await supabase
    .rpc('search_clientes_fuzzy', { q: term, max_results: 5 });

  if (error) {
    console.error('[buscarCliente] RPC:', error.message);
    return { exact: null, matches: [], rucProbable: null };
  }
  return { exact: null, matches: data ?? [], rucProbable: null };
}

// ─── Alta de cliente ─────────────────────────────────────────────────────────
export async function crearCliente({ ruc, razonSocial, vendedorTelefono, ciudad = null, contacto = null, telefono = null }) {
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      ruc: normalizeRuc(ruc),
      razon_social: razonSocial,
      ciudad,
      contacto,
      telefono,
      created_by: vendedorTelefono
    })
    .select('ruc, razon_social, ciudad')
    .single();

  if (error) {
    console.error('[crearCliente]', error.message);
    if (error.code === '23505') return { error: 'cliente_ya_existe', ruc };  // unique violation
    return { error: 'db_error', message: error.message };
  }
  return { ok: true, cliente: data };
}

// ─── Parsing de items "ID cant, ID cant, ..." ────────────────────────────────
// Misma lógica que la multi-venta: cantidad implícita = 1 si no se especifica.
export function parseItemsString(raw) {
  if (!raw) return [];
  return String(raw).split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => {
      const parts = item.split(/\s+/);
      const productId = parseInt(parts[0]);
      const quantity  = parts[1] ? parseInt(parts[1]) : 1;
      return { productId, quantity, raw: item };
    });
}

export function validarItems(items) {
  if (!items.length) return { ok: false, error: 'sin_items' };
  for (const it of items) {
    if (isNaN(it.productId)) return { ok: false, error: 'id_invalido', raw: it.raw };
    if (isNaN(it.quantity) || it.quantity <= 0) return { ok: false, error: 'cantidad_invalida', raw: it.raw };
  }
  return { ok: true };
}

// ─── Creación de pedido ──────────────────────────────────────────────────────
// Valida que todos los productos existan, después llama al RPC transaccional.
export async function crearPedido({ clienteRuc, vendedorTelefono, items, notas = null }) {
  // Resolver nombres de productos (snapshot)
  const ids = items.map(i => i.productId);
  const { data: prods, error: e1 } = await supabase
    .from('products')
    .select('id, name')
    .in('id', ids);

  if (e1) {
    console.error('[crearPedido] fetch products:', e1.message);
    return { error: 'db_error', message: e1.message };
  }

  const prodMap = new Map(prods.map(p => [p.id, p]));
  const missing = items.find(i => !prodMap.has(i.productId));
  if (missing) return { error: 'producto_no_existe', id: missing.productId };

  const itemsPayload = items.map(i => ({
    product_id:   i.productId,
    product_name: prodMap.get(i.productId).name,
    quantity:     i.quantity
  }));

  const { data: pedidoId, error } = await supabase.rpc('crear_pedido', {
    p_cliente_ruc:       clienteRuc,
    p_vendedor_telefono: vendedorTelefono,
    p_notas:             notas,
    p_items:             itemsPayload
  });

  if (error) {
    console.error('[crearPedido] RPC:', error.message);
    if (error.message?.includes('cliente_no_existe')) return { error: 'cliente_no_existe' };
    if (error.message?.includes('vendedor_no_autorizado')) return { error: 'vendedor_no_autorizado' };
    return { error: 'db_error', message: error.message };
  }

  return { ok: true, pedidoId, items: itemsPayload };
}

// ─── Listado de pedidos de un vendedor ───────────────────────────────────────
export async function listarPedidos(vendedorTelefono, { limit = 10 } = {}) {
  const { data, error } = await supabase
    .from('pedidos_resumen')
    .select('id, estado, created_at, cliente_ruc, razon_social, ciudad, total_unidades, num_items')
    .eq('vendedor_telefono', vendedorTelefono)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[listarPedidos]', error.message);
    return { error: 'db_error', items: [] };
  }
  return { items: data ?? [] };
}
