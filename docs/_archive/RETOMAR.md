# Retomar — punto de partida

Última actualización: 2026-05-23 (post FASE B — backend Express operativo).

## ✅ FASE A — COMPLETADA

- Stories re-priorizadas (docs/USER_STORIES.md, docs/DEMO_STORIES.md, docs/PILOTO_BACKLOG.md)
- Borrados: archivos Baileys-only + auth_info + docs obsoletos archivados
- `package.json` limpio: 1 dependencia (`@supabase/supabase-js`)
- `index.js` stub + `.env.example` actualizado + README rehecho

## ✅ FASE B — COMPLETADA

- `commands.js` limpio: de 586 a 272 líneas. Eliminados `cmdVenta`, `cmdVentaFlujo`, `cmdVentaCantidad`, `cmdMultiVenta`, `cmdDestacados`. Imports consolidados desde `lib/format.js`.
- `parseIntent` extraído a `lib/parser.js` (autónomo, testeable, importable).
- `lib/session.js` adaptado: API moderna con `getSession/setSession/clearSession`, key `wa_phone` en lugar de `jid`.
- Handlers actualizados: parámetro `jid` renombrado a `waPhone`, eliminado `jid.split('@')[0]`.
- `index.js` reescrito como Express server con endpoints:
  - `POST /webhook` — recibe `{ wa_phone, text }` desde n8n, autenticado con header `X-N8N-Secret`
  - `GET /health` — healthcheck público para Railway
  - `GET /` — info del servicio
- Express 5 instalado como única dep nueva.
- Seed `seed-demo.sql` actualizado: cliente `CONSUMIDOR FINAL` (RUC `000000000`) para reemplazar `/vender` con `/pedido 000000000 [items]`.
- Smoke test local OK: arranque, health, root, webhook procesando `/ayuda` correctamente.

**Estado del backend**: listo para recibir webhooks de n8n. Sin probar end-to-end con Meta todavía (depende de FASE C + D).

## 🔜 FASE C — Próxima sesión

**Configurar n8n self-hosted en Railway como pasarela Meta ↔ backend.**



## 🎯 Cambio radical de arquitectura

**Baileys queda DEPRECADO**. La nueva arquitectura es:

```
Vendedor (WhatsApp)
   ↓
Meta WhatsApp Cloud API (oficial)
   ↓ webhook POST
n8n self-hosted en Railway (pasarela)
   ↓ HTTP POST con datos limpios
Backend Node.js en Railway (lógica + Supabase)
   ↓ HTTP response con texto
n8n → Meta Send API → Vendedor
```

**Por qué este cambio**:
- 2 números distintos baneados sin completar 1 vinculación exitosa
- La IP de Railway quedó marcada como "datacenter sospechoso" por antifraude de Meta
- Baileys (cliente no oficial) ya no es viable desde esta infraestructura
- Solución oficial: Meta Cloud API (gratis hasta 1.000 conv/mes — sobra para 5-10 vendedores)
- n8n actúa como pasarela libre/gratis evitando proveedores pagos (Respond.io, etc)

## 📌 Estado de la conversación al pausar

Ya alineamos:

1. **Decisión arquitectónica**: Opción 2 — n8n como pasarela + backend Node con la lógica de negocio. NO todo en n8n. NO mantener Baileys.

2. **Hosting**: ambos servicios (n8n + backend) en el mismo proyecto Railway. Costo esperado: ~$0-5/mes dentro del crédito hobby. Usuario aceptó pagar hasta $5-10 USD si hiciera falta.

3. **Sesión conversacional**: in-memory en el backend Node, suficiente para la demo. Migrar a Supabase después si hace falta robustez.

## ✅ Lo que está confirmado

- Reutilizamos `lib/pedidos.js`, `lib/search.js`, `lib/supabase.js`, `lib/format.js`, `handlers/*.js`, todo `sql/`
- Reescribimos `index.js` desde cero (de Baileys bootstrap → Express server con POST /webhook)
- Reescribimos `commands.js` mínimamente (cambio: `jid.split('@')[0]` → `wa_phone` directo)
- Borramos: `lib/auth-server.js`, `lib/diagnostics.js`, `lib/sender.js`, `lib/session.js` parcial
- Sacamos deps: `@whiskeysockets/baileys`, `qrcode`, `qrcode-terminal`
- Agregamos deps: `express` (o `fastify`), nada más
- Archivamos a `docs/_archive/`: `AUTH_SERVER.md`, `DEMO_RUNBOOK.md`, este `RETOMAR.md` viejo

## 🚀 Plan de ejecución para mañana

### FASE A — Barrido del repositorio (~30 min)

1. **Reducir `index.js`** a stub con TODO claro (placeholder para Express)
2. **Borrar archivos huérfanos**:
   ```
   lib/auth-server.js
   lib/diagnostics.js
   lib/sender.js
   nodemon.json           (config era para --ignore auth_info/)
   .railwayignore         (era para ignorar auth_info)
   supabase_sales.sql     (root — duplicado de sql/)
   ```
3. **Actualizar `package.json`**:
   - Sacar: `@whiskeysockets/baileys`, `qrcode`, `qrcode-terminal`
   - Agregar: `express`
   - Scripts `manual:pdf` y `propuesta:pdf` se mantienen
4. **Limpiar `.env.example`** y `.env`:
   - Sacar: `PHONE_NUMBER`, `AUTH_SERVER_TOKEN`, `BOT_PAUSED`
   - Agregar placeholders: `META_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `N8N_SHARED_SECRET`
5. **Archivar docs Baileys-era** moviendo a `docs/_archive/`:
   - `docs/AUTH_SERVER.md`
   - `docs/DEMO_RUNBOOK.md` (era todo Baileys vinculación)
6. **Actualizar `.gitignore`**: sacar `auth_info/`
7. **Actualizar README.md**: reflejar nueva arquitectura
8. **Commit**: "refactor: deprecar Baileys, preparar terreno para Cloud API"

### FASE B — Reescritura del backend (~4-6 horas)

**Pre-tareas dentro de B**:
- **Limpiar `commands.js`**: borrar `cmdVenta`, `cmdVentaFlujo`, `cmdVentaCantidad`, `cmdMultiVenta` y todos los cases del switch correspondientes (`!v`, `!venta`, `__venta_flujo__`, `__venta_cantidad__`). Eliminar también `cmdSelect` o consolidarlo dentro de handlers que aún lo necesiten. La decisión MVD descartó `/vender` anónimo.
- **Migrar lógica de `parseIntent`** (hoy en `index.js`) a un nuevo `lib/parser.js`. El array `KNOWN_COMMANDS_RE` también pasa ahí. Liberar `index.js` para que sea solo bootstrap Express.

1. **Nuevo `index.js`** con Express:
   ```js
   import express from 'express';
   import { handleCommand } from './commands.js';
   import { getSession, updateSession } from './lib/session.js';
   import { isAllowed } from './lib/allowlist.js';

   const app = express();
   app.use(express.json());

   // Endpoint que n8n llama tras recibir webhook de Meta
   app.post('/webhook', authMiddleware, async (req, res) => {
     const { wa_phone, text } = req.body;
     if (!await isAllowed(wa_phone)) {
       return res.json({ text: 'Sin acceso. Contactá al admin.' });
     }
     const session = getSession(wa_phone);
     const { command, args } = parseIntent(text, session);
     const result = await handleCommand(command, args, supabase, session, wa_phone);
     if (result?._session) updateSession(wa_phone, result._session);
     res.json({ text: result.text || result });
   });

   app.listen(process.env.PORT || 3000);
   ```

2. **Adaptar `commands.js`**:
   - Cambiar firma `handleCommand(command, args, supabase, session, jid)` → mismo pero `jid` ahora es `wa_phone` directo
   - El switch interno no cambia

3. **Adaptar `lib/session.js`**:
   - Sigue siendo Map in-memory
   - Key cambia de `jid` (`595XX@s.whatsapp.net`) a `wa_phone` (`595XX`)
   - `isAllowed()` queda igual (ya recibe el número limpio)

4. **Adaptar `parseIntent`** (estaba en `index.js`):
   - Mover a `lib/parser.js`
   - Quitar referencias a `KNOWN_COMMANDS_RE` redundantes
   - El pipeline de 12 pasos se conserva tal cual

5. **Crear `lib/allowlist.js`** (extraer de `lib/session.js`):
   - Solo la cache + isAllowed
   - Razón: separar responsabilidades

6. **Tests manuales**:
   - `curl POST /webhook` con payloads simulados
   - Verificar que cada comando del bot original siga funcionando

### FASE C — n8n workflow (~2 horas)

1. **Levantar n8n en Railway** como segundo servicio del mismo proyecto
2. **Crear workflow "Meta to Backend"**:
   - Webhook Trigger (URL pública)
   - Function node: parsear payload de Meta, extraer `wa_phone` y `text`
   - HTTP Request: POST al backend con `{wa_phone, text}` + header `X-Secret`
   - HTTP Request: POST a Meta Send API con la respuesta
3. **Configurar URL del webhook en Meta Developer Dashboard** apuntando a n8n
4. **Verificar end-to-end**: vendedor manda mensaje → llega a backend → responde

### FASE D — Verificación Meta Business (calendario)

**Esta fase es del jefe, no tuya.**

1. Preparar checklist de documentos necesarios (RUC, escritura, datos representante)
2. Mostrar la demo (con datos de seed) usando el backend local o mock de n8n
3. Pedir aprobación + firma para iniciar verificación
4. Meta tarda 1-7 días en aprobar
5. Una vez aprobado: obtener `PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `ACCESS_TOKEN` permanente

## 📂 Archivos clave del estado actual

### Se conservan tal cual

- `lib/supabase.js` — cliente Supabase singleton
- `lib/pedidos.js` — buscarCliente, crearCliente, crearPedido, etc
- `lib/search.js` — wrappers de RPCs Supabase
- `lib/format.js` — templates de mensaje (limpiar comentarios "Baileys")
- `handlers/buscar.js`, `handlers/guia.js`, `handlers/pedido.js`, `handlers/mispedidos.js`
- Todo `sql/`
- `docs/USER_STORIES.md`, `docs/DEMO_STORIES.md`
- `docs/manual/`, `docs/propuesta/`

### Se reescriben

- `index.js` — de Baileys bootstrap a Express server
- `commands.js` — ajuste menor en firma de handleCommand
- `lib/session.js` — separar allowlist + cambiar key jid → wa_phone

### Se borran

- `lib/auth-server.js`
- `lib/diagnostics.js`
- `lib/sender.js`
- `nodemon.json`
- `.railwayignore`
- `supabase_sales.sql` (root, duplicado)
- `auth_info/` (directorio local — Railway volume se puede borrar también)

### Se archivan a `docs/_archive/`

- `docs/AUTH_SERVER.md`
- `docs/DEMO_RUNBOOK.md`

## 🔑 Variables de entorno

### Quitar de `.env` y `.env.example`

```
PHONE_NUMBER
AUTH_SERVER_TOKEN
BOT_PAUSED
```

### Agregar

```
# Meta WhatsApp Cloud API
META_VERIFY_TOKEN=               # token que n8n verifica con Meta
META_PHONE_NUMBER_ID=            # ID del número WhatsApp Business (después de verificar)
META_ACCESS_TOKEN=               # token permanente de Meta (después de verificar)

# Seguridad entre n8n y backend
N8N_SHARED_SECRET=               # header X-Secret que n8n envía al backend
```

### Se mantienen

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
ALLOWED_NUMBERS
BOT_PREFIX
PORT                             # Railway lo asigna automáticamente
```

## 🛑 No hacer mañana

- ❌ NO intentar reactivar el bot Baileys actual en Railway. Los 2 números están quemados, la IP también.
- ❌ NO borrar el volumen `auth_info` en Railway todavía — esperar a que confirmemos que la migración funciona.
- ❌ NO iniciar verificación Meta Business sin aprobación del jefe.
- ❌ NO comprar SIMs adicionales — el número del demo va a ser el que el jefe apruebe oficialmente.

## 🚨 Si el jefe pregunta hoy "¿el bot funciona?"

Respuesta corta y honesta:

> *"Lo que tenía funcionaba pero usaba una conexión no oficial a WhatsApp que termina siendo bloqueada. Estoy migrando al sistema oficial de Meta — gratis para nuestro volumen, sin riesgo de bloqueo, soporte oficial. Necesito 2-3 días para tenerlo listo y tu firma para iniciar la verificación de Meta Business con los documentos de la empresa."*

## 📌 Continuación inmediata mañana

1. Abrir esta `RETOMAR.md` primero
2. Ejecutar FASE A (barrido)
3. Empezar FASE B (reescritura backend)
4. FASE C (n8n) puede ser en paralelo o el día siguiente
5. FASE D depende del jefe — adelantar conversación con él lo antes posible

---

*Buen descanso. Mañana arrancamos con FASE A directo, sin replantear nada de lo decidido hoy.*
