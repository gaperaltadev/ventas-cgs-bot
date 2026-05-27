// Comandos de consulta de catálogo: /catalogo, /categoria, /producto, y
// selección numérica de lista activa (__select__).
//
// Flujo interactivo:
//   /catalogo → lista de 4 categorías (cat_auto / cat_moto / cat_camion / cat_otros)
//   Tocar categoría → lista de productos de esa categoría (ficha_{id})
//   Tocar producto  → ficha completa del producto (texto)
//
// Los IDs de botones cat_ y ficha_ se rutean en parser.js → routeInteractive,
// y se despachan desde commands.js como __catalogo_cat__ y __catalogo_ficha__.

import { supabase }   from '../lib/supabase.js';
import { CATEGORY_LABELS, CATEGORY_ALIASES, fichaProducto } from '../lib/format.js';
import { handleBuscar } from './buscar.js';

// ─── /catalogo ───────────────────────────────────────────────────────────────
// Devuelve una lista interactiva con las 4 categorías.
// No requiere consulta a DB — el catálogo de categorías es estático.

export function handleCatalogo() {
  return {
    _type: 'list',
    body: '📋 *Catálogo CGS Paraguay*\n\nElegí una categoría para ver los productos.',
    buttonText: 'Ver categorías',
    sections: [{
      title: 'Categorías',
      rows: [
        { id: 'cat_auto',   title: '🚗 Autos',    description: 'ELAION F10 · F30 · F50 · SUV' },
        { id: 'cat_moto',   title: '🏍️ Motos',   description: 'YPF RÖD 4T · 2T · Cadenas' },
        { id: 'cat_camion', title: '🚛 Camiones', description: 'EXTRAVIDA DX · ULTRA · MAXIMO' },
        { id: 'cat_otros',  title: '🔧 Otros',    description: 'Refrigerante · Frenos · Grasa · Hidráulico' }
      ]
    }]
  };
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
// También invocado vía interactivo (cat_auto, cat_moto, etc.).
// Devuelve una lista interactiva con los productos de la categoría.

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

  return {
    _type: 'list',
    body: `📦 *${CATEGORY_LABELS[cat]}*\n\nElegí un producto para ver la ficha completa.`,
    buttonText: 'Ver productos',
    sections: [{
      title: CATEGORY_LABELS[cat],
      rows: data.map(p => {
        const parts = [p.viscosity, p.technology, p.badge].filter(Boolean);
        return { id: `ficha_${p.id}`, title: p.name, description: parts.join(' · ') };
      })
    }]
  };
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
