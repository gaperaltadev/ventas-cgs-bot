import { buscarProductos } from '../lib/search.js';
import { fichaProducto } from '../lib/format.js';

function lineaResultado(r, i) {
  const base = `  ${i + 1}. [${r.id}] ${r.name} — ${r.viscosity || r.technology}`;
  if (r.matched_via === 'equivalent' && r.equivalent_brand) {
    return `${base}\n       ↪ equivale a ${r.equivalent_brand} ${r.equivalent_product}`;
  }
  return base;
}

export async function handleBuscar(args) {
  const term = args.join(' ').trim();

  if (!term) {
    return 'Indicame qué buscar.\n👉 Ej: */buscar elaion 5w30* · */buscar helix* · */buscar 15w40*';
  }

  let res;
  try {
    res = await buscarProductos(term, { max: 5 });
  } catch (err) {
    console.error('[buscar]', err.message);
    return 'Error al buscar productos. Intentá de nuevo en un momento.';
  }

  const { results, typo } = res;

  if (results.length === 0) {
    return `No encontré "*${term}*".\n👉 Probá */catalogo* o */guia [marca] [modelo]*.`;
  }

  // 1 resultado → ficha + footer de equivalencia si aplica
  if (results.length === 1) {
    const r = results[0];
    const ficha = fichaProducto(r);
    if (r.matched_via === 'equivalent' && r.equivalent_brand) {
      return `${ficha}\n\n💡 Equivalente a *${r.equivalent_brand} ${r.equivalent_product}*`;
    }
    return ficha;
  }

  // Múltiples resultados → lista numerada
  // Si TODOS son por equivalencia, el header lo dice explícito
  const allEquivalents = results.every(r => r.matched_via === 'equivalent');
  const someEquivalents = results.some(r => r.matched_via === 'equivalent');

  let header;
  if (allEquivalents) {
    const brand = results[0].equivalent_brand;
    header = `*Equivalentes a ${brand}:*`;
  } else if (typo) {
    header = `¿Quisiste decir *${results[0].name}*?`;
  } else if (someEquivalents) {
    header = `Encontré coincidencias para "*${term}*" (incluye equivalencias):`;
  } else {
    header = `Encontré varios para "*${term}*":`;
  }

  const lineas = results.map(lineaResultado).join('\n');
  return {
    text: `${header}\n\n${lineas}\n\n👉 Escribí *1*, *2*... para la ficha completa.`,
    _session: { lastResults: results.slice(0, 5), lastAction: 'ficha' }
  };
}
