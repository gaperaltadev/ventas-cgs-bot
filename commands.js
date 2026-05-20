const CATEGORY_LABELS = {
  elaion:    'ELAION — Autos',
  extravida: 'EXTRAVIDA — Camiones',
  moto:      'RÖD — Motos',
  otros:     'Otros'
};

const CATEGORY_ALIASES = {
  auto: 'elaion', autos: 'elaion', elaion: 'elaion',
  camion: 'extravida', camiones: 'extravida', extravida: 'extravida', pesado: 'extravida',
  moto: 'moto', motos: 'moto', rod: 'moto',
  otros: 'otros', otro: 'otros', fluido: 'otros', fluidos: 'otros'
};

// ─── Errores estandarizados ───────────────────────────────────────────────────

const ERR = {
  SIN_ARGS_PRODUCTO:      'Indicá qué producto querés ver.\n👉 Escribí el ID, o un nombre: *elaion 5w30* · *para moto*',
  SIN_ARGS_VENTA:         'Indicá qué producto vendiste.\n👉 Ej: *vender 3* · *vender 3 2* (2 unidades)',
  CANTIDAD_INVALIDA:      'La cantidad debe ser un número mayor a 0.\n👉 Ej: *3*',
  CATEGORIA_INVALIDA:     'No reconozco esa categoría.\n👉 Opciones: *auto · moto · camion · otros*',
  SIN_LISTA_ACTIVA:       'No hay lista activa para seleccionar.\n👉 Hacé una búsqueda primero. Ej: *5w30* o *elaion*',
  DB:                     (accion) => `Error al ${accion}. Intentá de nuevo en un momento.`,
  ID_NO_EXISTE:           (id)     => `No existe el producto [${id}].\n👉 Escribí *catalogo* para ver los IDs disponibles.`,
  SIN_RESULTADOS:         (term)   => `No encontré "*${term}*".\n👉 Probá con el ID directo o escribí *catalogo*.`,
  SIN_RESULTADOS_VENTA:   (term)   => `No encontré "*${term}*".\n👉 Probá con el ID directo o escribí *catalogo* para ver todo.`,
  DEMASIADOS_RESULTADOS:  (n)      => `Encontré ${n} resultados. Afiná la búsqueda.\n👉 Ej: *5w30 auto* o *15w40 camion*`,
  FUERA_DE_RANGO:         (max)    => `Ese número no está en la lista (hay ${max} opciones).\n👉 Escribí 1–${max}, o hacé una nueva búsqueda.`
};

// ─── Router ───────────────────────────────────────────────────────────────────

export async function handleCommand(command, args, supabase, session = {}) {
  switch (command) {
    case '!catalogo': case '!c':    return cmdCatalogo(supabase);
    case '!producto': case '!p':    return cmdProducto(args, supabase);
    case '!categoria': case '!cat': return cmdCategoria(args, supabase);
    case '!destacados': case '!d':  return cmdDestacados(supabase);
    case '!venta': case '!v':       return cmdVenta(args, supabase, session);
    case '!ventas':                 return cmdVentas(args, supabase);
    case '!top':                    return cmdTop(supabase);
    case '!ayuda': case '!a':       return cmdAyuda();
    case '!salir':                  return cmdSalir(session);
    case '__select__':              return cmdSelect(args, session, supabase);
    case '__venta_flujo__':         return cmdVentaFlujo(args, supabase, session);
    case '__venta_cantidad__':      return cmdVentaCantidad(args, session, supabase);
    default:                        return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str) {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-\s.]/g, '');
}

async function fetchAll(supabase) {
  const { data, error } = await supabase
    .from('products').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

function searchProducts(term, products) {
  const n = normalize(term);
  return products.map(p => {
    const nName = normalize(p.name);
    const nVisc = normalize(p.viscosity || '');
    const nCat  = normalize(p.category  || '');
    const nApps = normalize((p.applications || []).join(' '));
    const nTech = normalize(p.technology || '');
    const all   = [nName, nVisc, nCat, nApps, nTech].join(' ');

    let score = 0;
    if (nName === n)            score = 100;
    else if (nName.includes(n)) score = 80;
    else if (nVisc.includes(n)) score = 70;
    else if (nCat.includes(n))  score = 65;
    else if (all.includes(n))   score = 40;

    if (score === 0) {
      const words = n.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 1) {
        const matched = words.filter(w => all.includes(w)).length;
        if (matched === words.length) score = 75;
        else if (matched > 0)         score = 25 * matched;
      }
    }

    return { ...p, _score: score };
  })
  .filter(p => p._score >= 40)
  .sort((a, b) => b._score - a._score);
}

function fichaProducto(p) {
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

function listaResultados(results) {
  return results.slice(0, 5).map((p, i) =>
    `  ${i + 1}. [${p.id}] ${p.name} — ${p.viscosity || p.technology}`
  ).join('\n');
}

function withList(header, results, hint, extraSession = {}) {
  return {
    text: `${header}\n\n${listaResultados(results)}\n\n${hint}`,
    _session: { lastResults: results.slice(0, 5), flowStep: null, ...extraSession }
  };
}

function horaActual() {
  return new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

async function registrarVenta(product, qty, supabase) {
  const { error } = await supabase.from('sales').insert({
    product_id:   product.id,
    product_name: product.name,
    category:     product.category,
    quantity:     qty
  });
  if (error) {
    console.error('[venta error]', error.message);
    if (error.message?.includes('relation "sales" does not exist'))
      return '⚠️ Tabla de ventas no existe. Ejecutá supabase_sales.sql primero.';
    return ERR.DB('registrar la venta');
  }
  return `✅ *Venta registrada*\n[${product.id}] ${product.name} × ${qty} unidad${qty > 1 ? 'es' : ''}\n🕐 ${horaActual()}`;
}

// ─── Comandos ─────────────────────────────────────────────────────────────────

async function cmdCatalogo(supabase) {
  let all;
  try { all = await fetchAll(supabase); } catch { return ERR.DB('obtener el catálogo'); }
  if (!all.length) return 'El catálogo está vacío. Contactá al administrador.';

  const grouped = {};
  for (const p of all) {
    const cat = CATEGORY_LABELS[p.category] || p.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(`  [${p.id}] ${p.name}`);
  }

  const lines = ['📋 *Catálogo CGS Paraguay*\n'];
  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`*${cat}*`, ...items, '');
  }
  lines.push('👉 Escribí *[ID]* para ver la ficha  o  */vender [ID]* para registrar');
  return lines.join('\n');
}

async function cmdProducto(args, supabase) {
  if (!args.length) return ERR.SIN_ARGS_PRODUCTO;

  let all;
  try { all = await fetchAll(supabase); } catch { return ERR.DB('buscar productos'); }

  const num = parseInt(args[0]);
  if (!isNaN(num) && args.length === 1) {
    const p = all.find(p => p.id === num);
    return p ? fichaProducto(p) : ERR.ID_NO_EXISTE(num);
  }

  const results = searchProducts(args.join(' '), all);
  if (!results.length)   return ERR.SIN_RESULTADOS(args.join(' '));
  if (results.length > 5) return ERR.DEMASIADOS_RESULTADOS(results.length);
  if (results.length === 1) return fichaProducto(results[0]);

  return withList(
    `Encontré varios para "*${args.join(' ')}*":`,
    results,
    'Escribí *1*, *2*... para ver la ficha completa.',
    { lastAction: 'ficha' }
  );
}

async function cmdCategoria(args, supabase) {
  if (!args.length) return ERR.CATEGORIA_INVALIDA;

  const cat = CATEGORY_ALIASES[normalize(args[0])];
  if (!cat) return ERR.CATEGORIA_INVALIDA;

  const { data, error } = await supabase
    .from('products')
    .select('id, name, viscosity, technology, badge')
    .eq('category', cat)
    .order('sort_order', { ascending: true });

  if (error) return ERR.DB('obtener la categoría');
  if (!data.length) return 'No hay productos en esta categoría.';

  const lines = [`📦 *${CATEGORY_LABELS[cat]}*\n`];
  for (const p of data) {
    const badge = p.badge ? ` 🏷️ ${p.badge}` : '';
    lines.push(`[${p.id}] ${p.name} — ${p.viscosity || p.technology}${badge}`);
  }
  lines.push('\n👉 Escribí *[ID]* para ver la ficha  o  */vender [ID]* para registrar');
  return lines.join('\n');
}

async function cmdDestacados(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, technology, viscosity, badge')
    .eq('featured', true)
    .order('sort_order', { ascending: true });

  if (error) return ERR.DB('obtener destacados');
  if (!data.length) return 'No hay productos destacados configurados.';

  const lines = ['⭐ *Productos Destacados*\n'];
  for (const p of data) {
    const badge = p.badge ? ` — ${p.badge}` : '';
    lines.push(`[${p.id}] ${p.name}${badge}`);
  }
  lines.push('\n👉 Escribí *[ID]* para ver la ficha  o  */vender [ID]* para registrar');
  return lines.join('\n');
}

// cmdVenta: detecta sub-flujo a usar según los args
async function cmdVenta(args, supabase, session) {
  // Sin args → iniciar flujo guiado
  if (!args.length) {
    return {
      text: '¿Qué producto vendiste? Escribí el nombre o ID.',
      _session: {
        lastResults: null,
        lastAction: 'venta',
        pendingVenta: { qty: null, productId: null, searchTerm: null },
        flowStep: 'venta_esperando_producto'
      }
    };
  }

  let all;
  try { all = await fetchAll(supabase); } catch { return ERR.DB('acceder al catálogo'); }

  const raw = args.join(' ');

  // Multi-venta: contiene comas
  if (raw.includes(',')) return cmdMultiVenta(raw, all, supabase);

  // Detectar qty al final
  const lastArg = args[args.length - 1];
  const lastNum = parseInt(lastArg);
  let qty, searchArgs;

  if (!isNaN(lastNum) && lastNum < 1000 && args.length > 1) {
    qty        = lastNum;
    searchArgs = args.slice(0, -1);
  } else {
    qty        = 1;
    searchArgs = args;
  }

  if (qty <= 0) return ERR.CANTIDAD_INVALIDA;

  // Resolver por ID directo
  const firstNum = parseInt(searchArgs[0]);
  if (!isNaN(firstNum) && searchArgs.length === 1) {
    const product = all.find(p => p.id === firstNum);
    if (!product) return ERR.ID_NO_EXISTE(firstNum);
    return registrarVenta(product, qty, supabase);
  }

  // Resolver por búsqueda de texto
  const results = searchProducts(searchArgs.join(' '), all);
  if (!results.length)   return ERR.SIN_RESULTADOS_VENTA(searchArgs.join(' '));
  if (results.length === 1) return registrarVenta(results[0], qty, supabase);
  if (results.length > 5)  return ERR.DEMASIADOS_RESULTADOS(results.length);

  // Ambigüedad: presentar lista
  return withList(
    `Varios productos coinciden para "*${searchArgs.join(' ')}*":`,
    results,
    `¿Cuál es? Escribí *1* o *2*, o *N cantidad* (ej: *1 3* para ×3 uds).`,
    { lastAction: 'venta', pendingVenta: { qty: null, productId: null, searchTerm: searchArgs.join(' ') }, flowStep: 'venta_esperando_seleccion' }
  );
}

// cmdVentaFlujo: maneja el paso 'venta_esperando_producto'
async function cmdVentaFlujo(args, supabase, session) {
  let all;
  try { all = await fetchAll(supabase); } catch { return ERR.DB('acceder al catálogo'); }

  const term = args.join(' ');

  // ID directo
  const num = parseInt(args[0]);
  if (!isNaN(num) && args.length === 1) {
    const product = all.find(p => p.id === num);
    if (!product) {
      return {
        text: ERR.ID_NO_EXISTE(num),
        _session: { ...session, flowStep: 'venta_esperando_producto' }
      };
    }
    return {
      text: '¿Cuántas unidades?\n(Solo el número, ej: *3*)',
      _session: {
        ...session,
        flowStep: 'venta_esperando_cantidad',
        pendingVenta: { qty: null, productId: product.id, searchTerm: term },
        lastResults: null
      }
    };
  }

  // Búsqueda por texto
  const results = searchProducts(term, all);

  if (!results.length) {
    return {
      text: ERR.SIN_RESULTADOS_VENTA(term),
      _session: { ...session, flowStep: 'venta_esperando_producto' }
    };
  }

  if (results.length === 1) {
    return {
      text: '¿Cuántas unidades?\n(Solo el número, ej: *3*)',
      _session: {
        ...session,
        flowStep: 'venta_esperando_cantidad',
        pendingVenta: { qty: null, productId: results[0].id, searchTerm: term },
        lastResults: null
      }
    };
  }

  // Múltiples resultados → lista
  return withList(
    `Encontré varios para "*${term}*":`,
    results,
    '👉 ¿Cuál es? Escribí *1*, *2*...',
    {
      lastAction: 'venta',
      flowStep: 'venta_esperando_seleccion',
      pendingVenta: { qty: null, productId: null, searchTerm: term }
    }
  );
}

// cmdVentaCantidad: maneja el paso 'venta_esperando_cantidad'
async function cmdVentaCantidad(args, session, supabase) {
  const qty = parseInt(args[0]);

  if (isNaN(qty) || qty <= 0) {
    return {
      text: ERR.CANTIDAD_INVALIDA,
      _session: { ...session }
    };
  }

  const productId = session.pendingVenta?.productId;
  if (!productId) return ERR.DB('recuperar el producto de la venta');

  let all;
  try { all = await fetchAll(supabase); } catch { return ERR.DB('acceder al catálogo'); }

  const product = all.find(p => p.id === productId);
  if (!product) return ERR.ID_NO_EXISTE(productId);

  return registrarVenta(product, qty, supabase);
}

async function cmdMultiVenta(raw, all, supabase) {
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  const lines = [];
  let ok = 0;

  for (const item of items) {
    const parts = item.split(/\s+/);
    const id    = parseInt(parts[0]);
    // Cantidad implícita = 1 si no se especifica (consistente con Sub-flujo B)
    const qty   = parts[1] ? parseInt(parts[1]) : 1;

    if (isNaN(id))  { lines.push(`❌ "${item}" — ID inválido`); continue; }
    if (qty <= 0)   { lines.push(`❌ [${id}] — cantidad inválida`); continue; }

    const product = all.find(p => p.id === id);
    if (!product) { lines.push(`❌ [${id}] — producto no encontrado`); continue; }

    const { error } = await supabase.from('sales').insert({
      product_id: product.id, product_name: product.name,
      category: product.category, quantity: qty
    });

    if (error) { lines.push(`❌ [${id}] — error al guardar`); continue; }

    lines.push(`✅ [${product.id}] ${product.name} ×${qty}`);
    ok++;
  }

  const errores = items.length - ok;
  const resumen = errores === 0
    ? `\n*${ok} venta${ok > 1 ? 's' : ''} registrada${ok > 1 ? 's' : ''}*`
    : `\n*${ok} de ${items.length} registradas* (${errores} con error)`;

  return lines.join('\n') + resumen;
}

async function cmdSelect(args, session, supabase) {
  const idx    = parseInt(args[0]);
  const qtyArg = parseInt(args[1]);
  const results = session.lastResults || [];

  if (!results.length)  return ERR.SIN_LISTA_ACTIVA;
  if (!results[idx])    return ERR.FUERA_DE_RANGO(results.length);

  const product = results[idx];

  if (session.lastAction === 'venta') {
    // Con cantidad embebida ("1 3") → registrar directamente
    if (!isNaN(qtyArg) && qtyArg > 0) {
      return registrarVenta(product, qtyArg, supabase);
    }

    // Flujo guiado: selección sin cantidad → preguntar
    if (session.flowStep === 'venta_esperando_seleccion') {
      return {
        text: '¿Cuántas unidades?\n(Solo el número, ej: *3*)',
        _session: {
          ...session,
          flowStep: 'venta_esperando_cantidad',
          pendingVenta: { ...session.pendingVenta, productId: product.id },
          lastResults: null
        }
      };
    }

    // Sub-flujo D: ambigüedad desde !v con qty conocida (pendingVenta.qty)
    const qty = session.pendingVenta?.qty || 1;
    return registrarVenta(product, qty, supabase);
  }

  // lastAction = 'ficha' → mostrar ficha
  return fichaProducto(product);
}

async function cmdVentas(args, supabase) {
  const periodo = (args[0] || 'hoy').toLowerCase();
  let desde;

  if (periodo === 'hoy') {
    desde = new Date(); desde.setHours(0, 0, 0, 0);
  } else if (periodo === 'semana') {
    desde = new Date(); desde.setDate(desde.getDate() - 7);
  } else {
    return `Período no reconocido: "${periodo}".\n👉 Usá *ventas hoy* o *ventas semana*.`;
  }

  const { data, error } = await supabase
    .from('sales')
    .select('product_name, category, quantity, created_at')
    .gte('created_at', desde.toISOString())
    .order('created_at', { ascending: false });

  if (error) return ERR.DB('obtener ventas');

  const titulo = periodo === 'hoy' ? 'de hoy' : 'de la semana';
  if (!data?.length) return `Sin ventas registradas ${titulo}.\n👉 Registrá la primera con *vender [ID]*.`;

  const totCat = {};
  let total = 0;
  for (const s of data) {
    const label = CATEGORY_LABELS[s.category] || 'Sin categoría';
    totCat[label] = (totCat[label] || 0) + s.quantity;
    total += s.quantity;
  }

  const resumenCat = Object.entries(totCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, qty]) => `  ${cat}: *${qty} uds*`).join('\n');

  const detalle = data.slice(0, 8).map(s => {
    const hora = new Date(s.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
    return `  ${hora} · ${s.product_name} ×${s.quantity}`;
  }).join('\n');

  return [
    `📊 *Ventas ${titulo}*\n`,
    resumenCat,
    `*Total: ${total} uds* (${data.length} operaciones)\n`,
    '*Detalle:*',
    detalle,
    data.length > 8 ? `  ...y ${data.length - 8} más` : ''
  ].filter(Boolean).join('\n');
}

async function cmdTop(supabase) {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);

  const { data, error } = await supabase
    .from('sales').select('product_name, quantity')
    .gte('created_at', desde.toISOString());

  if (error) return ERR.DB('obtener el ranking');
  if (!data?.length) return 'Sin ventas en los últimos 7 días.\n👉 Registrá la primera con *vender [ID]*.';

  const agg = {};
  for (const s of data) agg[s.product_name] = (agg[s.product_name] || 0) + s.quantity;

  const top   = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lines = ['🏆 *Top productos — últimos 7 días*\n'];
  top.forEach(([name, qty], i) => lines.push(`${i + 1}. ${name} — *${qty} uds*`));
  return lines.join('\n');
}

function cmdAyuda() {
  return [
    '🤖 *CGS Bot — Qué puedo hacer*\n',
    '*Ver productos*',
    '  /catalogo              → Lista completa con IDs',
    '  /auto · /moto · /camion → Por categoría',
    '  /3                     → Ficha del producto [3]',
    '  /5w30 · /elaion        → Buscar por texto',
    '',
    '*Registrar ventas*',
    '  /vender                → Te guío paso a paso',
    '  /vender 3              → 1 unidad del producto [3]',
    '  /vender 3 2            → 2 unidades del producto [3]',
    '  /vender 3 2, 7 1       → Varios productos a la vez',
    '',
    '*Reportes*',
    '  /ventas                → Lo que se vendió hoy',
    '  /ventas semana         → Últimos 7 días',
    '  /ranking               → Top 5 de la semana',
    '',
    '💡 Cuando aparezca una lista, escribí *1*, *2*... para elegir.',
    '💡 Escribí */salir* para cancelar lo que estés haciendo.'
  ].join('\n');
}

export function cmdSalir(session) {
  const hayFlujo = !!(session?.flowStep || session?.lastResults?.length);
  return hayFlujo
    ? 'Listo, cancelé lo que tenías abierto. 👋\n👉 Escribí */ayuda* cuando quieras retomar.'
    : 'Hasta luego 👋 Cuando necesites algo, escribí */ayuda*.';
}
