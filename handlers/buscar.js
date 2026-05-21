import { buscarProductos } from '../lib/search.js';
import { fichaProducto, withList } from '../lib/format.js';

export async function handleBuscar(args) {
  const term = args.join(' ').trim();

  if (!term) {
    return 'Indicame qué buscar.\n👉 Ej: */buscar elaion 5w30* · */buscar 15w40* · */buscar moto*';
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

  if (results.length === 1) {
    return fichaProducto(results[0]);
  }

  const header = typo
    ? `¿Quisiste decir *${results[0].name}*?`
    : `Encontré varios para "*${term}*":`;

  return withList(
    header,
    results,
    'Escribí *1*, *2*... para la ficha completa.',
    { lastAction: 'ficha' }
  );
}
