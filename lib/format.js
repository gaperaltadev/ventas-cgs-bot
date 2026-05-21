// Helpers de formato de mensajes WhatsApp.
// Estos templates son la fuente única de verdad — los handlers los importan.

export const CATEGORY_LABELS = {
  elaion:    'ELAION — Autos',
  extravida: 'EXTRAVIDA — Camiones',
  moto:      'RÖD — Motos',
  otros:     'Otros'
};

export const CATEGORY_ALIASES = {
  auto: 'elaion', autos: 'elaion', elaion: 'elaion',
  camion: 'extravida', camiones: 'extravida', extravida: 'extravida', pesado: 'extravida',
  moto: 'moto', motos: 'moto', rod: 'moto',
  otros: 'otros', otro: 'otros', fluido: 'otros', fluidos: 'otros'
};

export function fichaProducto(p) {
  const pres = Array.isArray(p.presentations) ? p.presentations.join(' · ') : (p.presentations || '—');
  const apps = Array.isArray(p.applications)  ? p.applications.join(', ')   : (p.applications  || '—');
  return [
    `🔧 *[${p.id}] ${p.name}*`,
    `Tecnología:     ${p.technology}`,
    `Viscosidad:     ${p.viscosity || 'N/A'}`,
    `Specs:          ${p.specs}`,
    `Presentaciones: ${pres}`,
    `Aplicaciones:   ${apps}`,
    p.badge ? `🏷️  ${p.badge}` : null
  ].filter(Boolean).join('\n');
}

export function listaResultados(results) {
  return results.slice(0, 5).map((p, i) =>
    `  ${i + 1}. [${p.id}] ${p.name} — ${p.viscosity || p.technology}`
  ).join('\n');
}

export function withList(header, results, hint, extraSession = {}) {
  return {
    text: `${header}\n\n${listaResultados(results)}\n\n${hint}`,
    _session: { lastResults: results.slice(0, 5), flowStep: null, ...extraSession }
  };
}

export function horaActual() {
  return new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}
