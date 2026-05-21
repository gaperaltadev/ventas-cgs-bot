import { buscarProductos, buscarGuiaVehiculo } from '../lib/search.js';
import { fichaProducto, withList } from '../lib/format.js';
import { handleGuia } from './guia.js';

export async function handleBuscar(args) {
  const term = args.join(' ').trim();

  if (!term) {
    return 'Indicame qué buscar.\n👉 Ej: */buscar elaion 5w30* · */buscar hilux* · */buscar 15w40*';
  }

  // ─── 1. Buscar en productos ────────────────────────────────────────────
  let productosRes;
  try {
    productosRes = await buscarProductos(term, { max: 5 });
  } catch (err) {
    console.error('[buscar]', err.message);
    return 'Error al buscar productos. Intentá de nuevo en un momento.';
  }

  const { results, typo } = productosRes;

  if (results.length === 1) {
    return fichaProducto(results[0]);
  }

  if (results.length > 1) {
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

  // ─── 2. Sin resultados en productos → probar como vehículo ─────────────
  let vehiculos;
  try {
    vehiculos = await buscarGuiaVehiculo(term, { max: 3 });
  } catch (err) {
    vehiculos = [];
  }

  if (vehiculos.length > 0) {
    // Es un vehículo: delegar a la lógica de /guia
    return await handleGuia(args);
  }

  // ─── 3. Sin resultados en ningún lado ──────────────────────────────────
  return [
    `No encontré "*${term}*" ni en productos ni en vehículos.`,
    '👉 Probá */catalogo* para ver todo el stock, o */guia [marca] [modelo]*.'
  ].join('\n');
}
