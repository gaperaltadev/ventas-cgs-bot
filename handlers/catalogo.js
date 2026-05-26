// Comandos de consulta de catálogo: /catalogo, /categoria, /producto, y
// selección numérica de lista activa (__select__).

import * as Sentry from '@sentry/node';
import { supabase }   from '../lib/supabase.js';
import { CATEGORY_LABELS, CATEGORY_ALIASES, fichaProducto } from '../lib/format.js';
import { handleBuscar } from './buscar.js';

// ─── /catalogo ───────────────────────────────────────────────────────────────

export async function handleCatalogo() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category')
    .order('sort_order', { ascending: true });

  if (error) {
    Sentry.captureException(error, { extra: { cmd: 'catalogo' } });
    return 'Error al obtener el catálogo. Intentá de nuevo en un momento.';
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
  lines.push('👉 Escribí *[ID]* para ver la ficha o */pedido* para registrar un pedido');
  return lines.join('\n');
}

// ─── /producto [ID] ──────────────────────────────────────────────────────────

export async function handleProducto(args) {
  if (!args.length) {
    return 'Indicá qué producto querés ver.\n👉 Escribí el ID, o un nombre: *elaion 5w30* · *para moto*';
  }

  const num = parseInt(args[0]);
  if (!isNaN(num) && args.length === 1) {
    const { data, error } = await supabase
      .from('products').select('*').eq('id', num).single();
    if (error || !data) {
      return `No existe el producto [${num}].\n👉 Escribí */catalogo* para ver los IDs disponibles.`;
    }
    return fichaProducto(data);
  }

  // Si no es solo un ID, delegar a búsqueda fuzzy
  return handleBuscar(args);
}

// ─── /categoria [cat] ────────────────────────────────────────────────────────

export async function handleCategoria(args) {
  if (!args.length) {
    return 'No reconozco esa categoría.\n👉 Opciones: *auto · moto · camion · otros*';
  }

  const aliasKey = String(args[0]).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cat = CATEGORY_ALIASES[aliasKey];
  if (!cat) {
    return 'No reconozco esa categoría.\n👉 Opciones: *auto · moto · camion · otros*';
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, name, viscosity, technology, badge')
    .eq('category', cat)
    .order('sort_order', { ascending: true });

  if (error) return 'Error al obtener la categoría. Intentá de nuevo en un momento.';
  if (!data.length) return 'No hay productos en esta categoría.';

  const lines = [`📦 *${CATEGORY_LABELS[cat]}*\n`];
  for (const p of data) {
    const badge = p.badge ? ` 🏷️ ${p.badge}` : '';
    lines.push(`[${p.id}] ${p.name} — ${p.viscosity || p.technology}${badge}`);
  }
  lines.push('\n👉 Escribí *[ID]* para ver la ficha o */pedido* para registrar un pedido');
  return lines.join('\n');
}

// ─── __select__ — selección numérica de lista de browse ─────────────────────
// Solo para resultados de /buscar (lastAction: 'ficha').
// El flujo de /pedido usa botones/listas interactivos — no pasa por aquí.

export async function handleSelect(args, session) {
  const idx     = parseInt(args[0]);
  const results = session.lastResults || [];

  if (!results.length) {
    return 'No hay lista activa para seleccionar.\n👉 Hacé una búsqueda primero. Ej: */buscar 5w30*';
  }
  if (!results[idx]) {
    return `Ese número no está en la lista (hay ${results.length} opciones).\n👉 Escribí 1–${results.length}, o hacé una nueva búsqueda.`;
  }

  const selected = results[idx];
  const { data } = await supabase
    .from('products').select('*').eq('id', selected.id).single();
  return data ? fichaProducto(data) : fichaProducto(selected);
}
