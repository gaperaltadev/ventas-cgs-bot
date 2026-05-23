# Backlog del piloto — features post-demo

Lo que **se vende en la propuesta como "valor futuro"** pero NO se implementa
antes del demo. Cada feature acá tiene justificación de por qué no entra ahora.

Estado al 2026-05-23: pendiente de aprobación del jefe + verificación Meta Business.

---

## P1 — Editar / anular pedido desde panel admin

**Necesidad real**: vendedor carga un pedido con error (cantidad, producto, cliente). Hoy hay que editar la DB directo en Supabase Studio. Riesgoso.

**Solución propuesta**:
- En el panel admin, tab Pedidos, agregar acción "anular" (cambia `estado='cancelado'`)
- Opcionalmente, editar items con auditoría (campo `updated_by` + tabla `pedido_audit_log`)

**Esfuerzo estimado**: 4-6 horas (UI + endpoint + auditoría)

**Por qué no en demo**: el jefe no va a probar anular en vivo. Lo necesita en operación real, no en presentación.

---

## P2 — Historial por cliente

**Necesidad real**: "¿qué le vendí a Autorepuestos San Lorenzo en el último mes?"

**Solución propuesta**:
- En el panel admin → Clientes → click en cliente → ver lista de pedidos asociados
- Filtros por rango de fechas
- Exportable a CSV/Excel

**Esfuerzo estimado**: 3-4 horas

**Por qué no en demo**: requiere tener datos reales acumulados (1-2 semanas de uso) para ser interesante. En la demo con seed se ve "datos de juguete".

---

## P3 — Notificaciones proactivas de stock crítico

**Necesidad real**: cuando un producto baja de N unidades, avisar al vendedor o al jefe.

**Solución propuesta**:
- Nueva tabla `inventory (product_id, stock_units, min_threshold)`
- n8n workflow disparado por cron (cada 6h) que consulta low-stock
- Envía mensaje proactivo a vendedores asignados (categoría)
- **Requiere Meta WA templates aprobados** (los mensajes proactivos sin ventana abierta de 24h necesitan template)

**Esfuerzo estimado**: 1-2 días (tabla + workflow + template approval Meta)

**Por qué no en demo**: la tabla `inventory` no existe ni hay datos. Y los templates de Meta requieren aprobación de 1-7 días.

---

## P4 — Botones interactivos en confirmaciones (Cloud API exclusive)

**Necesidad real**: "responder 'si' o 'no'" obliga a tipear. Botones son más rápidos y menos error-prone.

**Solución propuesta**:
- Reemplazar prompts de confirmación por mensajes interactive de tipo `button` (hasta 3 botones).
- Ejemplo: en confirmación de pedido, botones `[✅ Confirmar]` `[❌ Cancelar]` `[📝 Editar]`.

**Esfuerzo estimado**: 2-3 horas (cambiar el payload de salida del backend + n8n adaptado)

**Por qué no en demo**: la demo se puede mostrar perfectamente con texto. Botones son polish, no funcionalidad.

**Limitaciones**:
- Solo en ventana de 24h activa
- Max 3 botones por mensaje
- Solo títulos de 20 chars

---

## P5 — Mensajes con foto del producto

**Necesidad real**: el vendedor le quiere mostrar el aceite al cliente en la pantalla del celular.

**Solución propuesta**:
- En `/[ID]` (ficha) y `/guia`, además del texto enviar imagen del producto
- Las URLs de imagen ya existen en `products.image`
- Cloud API soporta mensajes de tipo `image` con caption

**Esfuerzo estimado**: 1-2 horas (adaptar response del backend + n8n)

**Por qué no en demo**: la mayoría de los `products.image` apuntan a paths
relativos del landing (`./assets/products/xxx.webp`). Hay que subirlos a
hosting accesible públicamente o usar `media_id` de Meta. Trabajo de setup.

---

## P6 — Reportes mensuales por email

**Necesidad real**: el jefe quiere un resumen mensual en su correo, sin tener que entrar a WhatsApp ni al panel.

**Solución propuesta**:
- n8n workflow programado el día 1 de cada mes
- Consulta agregada en Supabase (top productos, top clientes, top vendedores, totales por categoría)
- Genera PDF (n8n tiene nodos para esto o se hace HTTP a servicio gratis)
- Envía por email

**Esfuerzo estimado**: 1 día (workflow + queries agregadas + template PDF)

**Por qué no en demo**: requiere datos reales acumulados (1+ mes) y conexión SMTP/email service.

---

## P7 — Categorías opcionales de cliente (Categoría A/B/C, deudor, etc)

**Necesidad real**: segmentar clientes para reportes y atención diferenciada.

**Solución propuesta**:
- Agregar campos `categoria_cliente` y `tags` a tabla `clientes`
- Panel admin permite asignar
- Reportes filtran por categoría

**Esfuerzo estimado**: 4-6 horas

**Por qué no en demo**: nadie nos lo pidió. Esperar a que sea un dolor real.

---

## P8 — Integración con sistema contable existente (futurible)

**Necesidad real**: el contador / facturador necesita los pedidos en el sistema actual.

**Solución propuesta**: exportación CSV diaria + endpoint REST para que el sistema contable haga pull.

**Esfuerzo estimado**: depende del sistema contable destino. 1-5 días.

**Por qué no en demo**: no sabemos qué sistema usan. Hablar con el jefe.

---

## Cómo priorizar el backlog post-demo

Si el jefe aprueba la demo, hablar con él para priorizar P1-P8 según necesidad real. Mi recomendación de orden por valor:

1. **P1** — Anular pedidos (operación diaria, evita errores acumulados)
2. **P3** — Notificaciones de stock (preventivo, valor alto)
3. **P2** — Historial por cliente (análisis comercial)
4. **P4** — Botones interactivos (polish UX)
5. **P6** — Reportes mensuales por email (executive summary)
6. **P5** — Imágenes de producto (nice-to-have)
7. **P7** — Categorías de cliente (cuando duela)
8. **P8** — Integración contable (si pide el contador)

---

## NO va al backlog (descartado por valor)

- Multi-idioma (todo el equipo habla castellano)
- Soporte web del bot (los vendedores no van a usar un navegador en ruta)
- App móvil nativa (WhatsApp ya está instalada en todos los celulares)
- Sistema de comisiones automático (regla de negocio cambiante, mejor manual)
- Chat IA para "preguntas libres" (overengineering)
