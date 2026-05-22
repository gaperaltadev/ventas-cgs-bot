# Runbook de la demo

Pasos exactos para llegar al día del demo sin sorpresas. Ejecutar en orden.

---

## T-2 días — Preparación inicial (45 min)

### 1. Verificar estado del repo y de Railway

```bash
cd c:\Users\Gabriel\projects\cgs-bot
git pull
```

Confirmar en Railway:
- `BOT_PAUSED` ya no está en las Variables (o está en `false`)
- El servicio está en estado **ACTIVE**
- En **Logs** ves: `[wa] usando WhatsApp Web v...` y `[auth-server] PÚBLICO: https://...`

Si `BOT_PAUSED=true` sigue, eliminalo. Esperá 30s al redeploy.

### 2. Vincular el bot con el número del amigo

- Copiar la URL pública con token de los logs de Railway
- Enviársela al amigo (no por WhatsApp, mejor SMS/Telegram)
- El amigo abre el link en su navegador → ve QR + pairing code
- Vincular con cualquiera de los 2 métodos
- En logs deberías ver: `✅ Bot conectado a WhatsApp`

Si **no vincula** o **se desconecta rápido**:
- Activar `BOT_PAUSED=true` de inmediato
- Esperar 24-48h más
- Considerar migrar a Hetzner ($5) antes de re-intentar

### 3. Aplicar el seed de demo en Supabase

**Supabase → SQL Editor → New query → pegar contenido de `sql/seed-demo.sql` → Run**

Verificar que cargó bien:
```sql
SELECT count(*) FROM vendedores WHERE activo = TRUE;
-- Esperado: 4 (o más si ya tenías)

SELECT count(*) FROM clientes;
-- Esperado: 8 (o más)

SELECT count(*) FROM pedidos WHERE created_at > NOW() - INTERVAL '7 days';
-- Esperado: 12

SELECT count(*) FROM sales WHERE created_at > NOW() - INTERVAL '7 days';
-- Esperado: 6
```

### 4. Reemplazar números placeholder por reales

El seed cargó 4 vendedores con números ficticios `595981111111` etc. Para que la demo funcione **en vivo**, al menos 2 tienen que ser reales:

**Panel admin → Vendedores → editar:**
- Reemplazar 1 vendedor ficticio por **el número del amigo** (donde vincularon el bot)
- Reemplazar otro por **tu número** (para mostrar el demo desde 2 ángulos)
- Los otros 2 los podés dejar ficticios — solo aparecen en reportes

### 5. Smoke test rápido (5 min)

Desde tu WhatsApp al bot, probar:

```
/ayuda          → ve el menú
/catalogo       → 19 productos
/3 (o un ID válido) → ficha del producto
/buscar elaion  → resultado
/guia toyota corolla 2020 → recomendación
/mispedidos     → tus pedidos (si cargaste el seed, deberías ver algunos)
/ventas semana  → resumen con datos
/ranking        → top 5
```

Si alguno falla, **arreglar antes del demo**, no en vivo.

---

## T-1 día — Materiales y guión (30 min)

### 6. Regenerar PDF de propuesta (si editaste algo)

```bash
npm run propuesta:pdf
```

PDF queda en `docs/propuesta/propuesta-cgs-bot.pdf` (~290 KB).

### 7. Leer el guión de la demo

Abrir `docs/DEMO_STORIES.md` y repasar:
- Orden de los 7 stories (DS-01 a DS-07)
- Qué decir en cada uno (no leer, internalizar)
- Stories marcadas con ⭐ son las protagonistas: DS-02, DS-04, DS-06

Tiempo objetivo: **20 minutos** completos.

### 8. Preparar materiales físicos

- **Imprimir o llevar en tablet** el PDF de propuesta (jefe le gusta tener algo en la mano)
- **Laptop con sesión iniciada** en `cgs-paraguay.netlify.app/admin.html`
- **Tu celular** con el bot agregado a contactos (probarlo antes de salir de casa)
- **Cargador** del celular (la demo + tener pantalla prendida vacía la batería)

### 9. Confirmar reunión y duración

Si la reunión es online o presencial, qué hora, dónde, cuánto tiempo bloqueado.
Idealmente **30 minutos** para tener 20 de demo + 10 de preguntas.

---

## Día del demo

### 10. Refresh de datos (5 min antes)

Si pasaron más de 1-2 días desde que aplicaste el seed:

```sql
-- Las fechas de los pedidos del seed quedan "viejas". Para que /ventas
-- semana muestre actividad reciente, podés re-aplicar SOLO la sección
-- de pedidos del seed (no la de vendedores ni clientes — esas ya están).
-- O simplemente cargar 2-3 pedidos nuevos via /pedido en vivo durante la demo.
```

Si tu celular tiene el bot conectado y respondió hace minutos, **andá tranquilo**.

### 11. Arrancar la demo

Orden recomendado (de `DEMO_STORIES.md`):

```
1.  Problema (2 min)           — "hoy es papel y Excel"
2.  DS-01 Catálogo (1 min)     — "el bot tiene todo, siempre"
3.  DS-02 Guía (3 min) ⭐       — "preguntale qué aceite va"
4.  DS-03 Búsqueda con typo (2 min) — "no importa cómo escribas"
5.  DS-04 Pedido (4 min) ⭐    — "registro completo en 3 segundos"
6.  DS-05 Alta cliente (1 min) — "cliente nuevo sin frenar"
7.  DS-06 Reportes (3 min) ⭐  — "vos ves todo en vivo"
8.  DS-07 Panel admin (3 min)  — "lo gestionás como una herramienta"
9.  Cierre + qué necesito (1 min) — entregar PDF de propuesta
```

### 12. El cierre (lo más importante)

Cuando termines de mostrar, decí algo así:

> *"Lo que viste es una versión demo, gratis, lista. Para usarla con todo el equipo necesito:*
> 1. *Tu aprobación para que 3-5 vendedores la usen durante 2-4 semanas en sus visitas reales*
> 2. *Que firmemos los papeles de Meta Business — es gratis, tarda 1 semana, y nos da soporte oficial sin riesgo de que WhatsApp lo bloquee*
> 3. *Una decisión sobre qué número de WhatsApp va a ser el del bot (si compramos uno nuevo o usamos uno existente)*
> 
> *El PDF que te entrego tiene todo el detalle. ¿Cuándo arrancamos con el equipo?"*

---

## Después del demo

### Si dice SÍ (probable)

```
☐ Anotar a quién designa como vendedores piloto (3-5 nombres + números)
☐ Cargarlos en la tabla `vendedores` desde el panel admin
☐ Mandar al equipo piloto: número del bot + manual PDF (docs/manual/manual-cgs-bot.pdf)
☐ Pedir documentación CGS para iniciar Meta Business (RUC, dirección fiscal, datos del representante)
☐ Definir fecha para revisión a las 2-4 semanas
```

### Si dice "déjame pensarlo"

```
☐ Confirmar fecha de follow-up (1-2 semanas máximo)
☐ Mantener el bot activo por si quiere probarlo solo
☐ No empezar nada de Meta Business sin aprobación explícita
```

### Si dice NO

```
☐ Preguntar por qué (objeción concreta vs no le gusta la idea)
☐ Decidir si vale la pena iterar o archivar el proyecto
☐ En cualquier caso: BOT_PAUSED=true en Railway para detener gasto de recursos
☐ Cero costo perdido — no se invirtió dinero en nada
```

---

## Contingencias durante el demo

### El bot no responde en vivo
- Verificar conexión a internet del celular
- Si está bien la red: `/salir` (cancela cualquier flujo activo)
- Si sigue mudo: pasar al panel admin (funciona independientemente)
- Decir: *"el sistema sigue funcionando, esto es solo el canal de WhatsApp"*

### Un comando devuelve resultado raro
- No corregir en vivo. *"Eso es algo que vamos a pulir en el piloto."*
- Seguir con el siguiente caso de uso

### El jefe interrumpe con detalles técnicos
- *"Para todo eso vamos a la versión oficial de Meta. Eso es lo que estoy pidiéndote aprobar hoy."*
- No defenderse, redirigir al PDF

### Se acabó la batería del celular
- Mostrar el bot desde otro celular (el del amigo si está ahí)
- O entrar al panel admin en la laptop y mostrar los pedidos cargados
- *"El sistema vive en la nube, no depende de un celular específico"*

### El jefe quiere más tiempo o ver otro día
- No insistir. *"Te dejo el PDF, escribime cuando hayas decidido."*
- Cerrar el demo con dignidad

---

## Estado de los archivos clave

Para retomar sin perderse:

| Archivo | Para qué sirve |
|---------|---------------|
| `docs/DEMO_RUNBOOK.md` | Este archivo. Pasos día-a-día. |
| `docs/DEMO_STORIES.md` | Guión de los 7 stories con ejemplos |
| `docs/propuesta/propuesta-cgs-bot.pdf` | Entregable al jefe |
| `sql/seed-demo.sql` | Datos de demo (4 vendedores, 8 clientes, 12 pedidos) |
| `docs/manual/manual-cgs-bot.pdf` | Manual para mandar a los vendedores piloto |
| `docs/RETOMAR.md` | Estado general del proyecto (más amplio que solo demo) |

---

*Cuando retomes después del reset de tokens, leé este archivo primero y arrancá por el paso 1. Si el bot ya está vinculado y los datos cargados, podés saltar directo al T-1 día.*
