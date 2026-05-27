import { buscarGuiaVehiculo, extractYear } from '../lib/search.js';

function formatRangoAnios(g) {
  if (g.year_from && g.year_to) return `${g.year_from}–${g.year_to}`;
  if (g.year_from) return `${g.year_from}+`;
  if (g.year_to)   return `hasta ${g.year_to}`;
  return null;
}

export async function handleGuia(args) {
  const term = args.join(' ').trim();

  if (!term) {
    return [
      'Decime marca y modelo (con año si lo sabés).',
      '👉 Ej: */guia toyota corolla 2018*',
      '       */guia honda cg 150*',
      '       */guia hilux diesel*'
    ].join('\n');
  }

  let results;
  try {
    results = await buscarGuiaVehiculo(term, { max: 3 });
  } catch (err) {
    return 'Error al consultar la guía. Intentá de nuevo en un momento.';
  }

  if (!results.length) {
    return [
      `No tengo guía para "*${term}*".`,
      '👉 Probá con menos palabras o usá */buscar [tipo de aceite]*.'
    ].join('\n');
  }

  // 1 resultado → ficha de recomendación directa
  if (results.length === 1) {
    return formatRecomendacion(results[0]);
  }

  // Múltiples → lista interactiva para que el usuario elija
  const year = extractYear(term);
  const body = year
    ? `Encontré varias opciones para "*${term}*":`
    : `Encontré varias opciones — especificá año para afinar:`;

  return {
    _type: 'list',
    body,
    buttonText: 'Ver opciones',
    sections: [{
      title: 'Vehículos',
      rows: results.map(g => {
        const rango = formatRangoAnios(g);
        const motor = g.engine_type ? ` · ${g.engine_type}` : '';
        return {
          id:          `ficha_${g.recommended_product_id}`,
          title:       `${g.brand} ${g.model}${rango ? ' (' + rango + ')' : ''}${motor}`.slice(0, 24),
          description: `→ ${g.recommended_name}`.slice(0, 72)
        };
      })
    }]
  };
}

function formatRecomendacion(g) {
  const rango = formatRangoAnios(g);
  const head = `🚗 *${g.brand} ${g.model}*` +
               (rango ? ` (${rango})` : '') +
               (g.engine_type ? ` · ${g.engine_type}` : '');

  const lineas = [head, ''];
  lineas.push(`✅ Recomendado: *[${g.recommended_product_id}] ${g.recommended_name}*`);

  if (g.alternative_product_id) {
    lineas.push(`↪ Alternativa:  *[${g.alternative_product_id}] ${g.alternative_name}*`);
  }

  if (g.notes) {
    lineas.push('', `📝 ${g.notes}`);
  }

  lineas.push('', `👉 */${g.recommended_product_id}* para ver la ficha completa`);
  return lineas.join('\n');
}
