# Workflow n8n — CGS Bot

Workflow que conecta Meta WhatsApp Cloud API con el backend Express del bot.

## Archivos

- `workflow-cgs-bot.json` — workflow completo para importar en n8n
- `README.md` — esta guía

---

## ⚠️ ANTES DE IMPORTAR — proteger tu webhook ya validado

Si ya tenés un nodo Webhook funcionando con Meta (con la URL ya validada
en el dashboard de Meta Developer), **no importes este archivo como
workflow nuevo todavía**. Si lo hacés, n8n genera un nuevo `webhookId` y
la URL cambia → tendrías que volver a configurar Meta.

**Recomendación**:

1. Abrí tu workflow actual de n8n donde está el Webhook funcionando.
2. **Copiá la URL del Webhook** (la que ya configuraste en Meta). La vas a necesitar al final.
3. Importá `workflow-cgs-bot.json` como un workflow NUEVO (no reemplaces el existente).
4. En el workflow importado:
   - Doble-click en el nodo "Webhook (Meta)"
   - En "Webhook URLs", verás un path (`/webhook/cgs-bot` o similar). Cambialo al **mismo path que tenía tu webhook actual**. Eso replica la URL que Meta ya conoce.
5. Activá el workflow importado (toggle de "Inactive" → "Active").
6. **Desactivá tu workflow viejo** (el que sólo tenía el Webhook de prueba).
7. Verificá que Meta sigue llegando al nuevo workflow mandando un mensaje desde WhatsApp.

Si todo funciona, podés archivar/borrar el workflow viejo.

**Alternativa más simple** (si no te importa volver a verificar con Meta):
- Importá este archivo.
- En el dashboard de Meta Developer → WhatsApp → Configuration → Webhook → cambiá la "Callback URL" por la del workflow nuevo.
- Volvé a hacer "Verify and Save".

---

## Cómo importar

### Opción A — Importar desde archivo

1. En n8n, click en **+ New** → **Import from File**
2. Seleccioná `workflow-cgs-bot.json`
3. Confirmá el import

### Opción B — Importar desde URL/raw

1. Abrí el archivo en GitHub raw o copialo entero al portapapeles
2. En n8n, **Workflows** → **+ Add workflow** → **Import from URL** o **From clipboard**

---

## Después de importar — reemplazar 3 placeholders

El workflow tiene 3 valores con `REPLACE_WITH_*` que hay que cambiar
**antes** de activar.

### 1. `REPLACE_WITH_N8N_SHARED_SECRET`

**Dónde**: nodo "Backend → procesar" → Headers → header `X-N8N-Secret`

**Qué poner**: el mismo valor que tengas en la variable `N8N_SHARED_SECRET`
de Railway. Si no la creaste todavía:

- Inventá un string random largo (ej: `cgs_bot_2026_clave_compartida_abc123`).
- Pegalo en n8n (este header) **y** en Railway → Service → Variables → `N8N_SHARED_SECRET`.

Tienen que ser idénticos, byte por byte. Si difieren, el backend rechaza con `401 unauthorized`.

### 2. `REPLACE_WITH_META_PHONE_NUMBER_ID`

**Dónde**: nodo "Meta → enviar respuesta" → URL

**Qué poner**: el `Phone Number ID` que te dio Meta cuando configuraste el
número de WhatsApp Business.

Lo encontrás en: Meta for Developers → tu app → WhatsApp → API Setup →
sección "From" → es el número largo que aparece bajo "Phone number ID".

URL completa debería quedar tipo:
```
https://graph.facebook.com/v23.0/123456789012345/messages
```

### 3. `REPLACE_WITH_META_ACCESS_TOKEN`

**Dónde**: nodo "Meta → enviar respuesta" → Headers → header `Authorization`

**Qué poner**: el access token de Meta (temporal de 24h para pruebas, o
permanente del System User para producción).

Lo encontrás en: Meta for Developers → tu app → WhatsApp → API Setup →
sección "Temporary access token" (o el permanente que generaste).

Resultado:
```
Authorization: Bearer EAAxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Recomendación para producción**: en lugar de hardcodear el token en
> el nodo, crear una credential de tipo "Header Auth" en n8n y usarla
> referenciada. Para la demo, el hardcode está bien.

---

## Verificación end-to-end

Una vez configurado y activado el workflow:

### 1. Verificar el backend en Railway

```bash
curl https://ventas-cgs-bot-production.up.railway.app/health
```

Esperás: `{"status":"ok","uptime":N}`

### 2. Verificar que el backend autentica el secret

```bash
# Sin el header (debería rechazar)
curl -X POST https://ventas-cgs-bot-production.up.railway.app/webhook \
  -H "Content-Type: application/json" \
  -d '{"wa_phone":"595999999999","text":"/ayuda"}'

# Esperás: {"error":"unauthorized"} si N8N_SHARED_SECRET está configurado

# Con el header correcto
curl -X POST https://ventas-cgs-bot-production.up.railway.app/webhook \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: cgs_bot_2026_clave_compartida_abc123" \
  -d '{"wa_phone":"595999999999","text":"/ayuda"}'

# Esperás: {"text":"🤖 *CGS Bot — Qué puedo hacer*..."}
```

### 3. Mandar mensaje real desde WhatsApp

Desde un número que esté en tu tabla `vendedores` con `activo=true`:

1. Mandá `/ayuda` al número de WhatsApp del bot
2. Deberías recibir el menú en ~1-2 segundos

Si no responde, mirá las ejecuciones recientes en n8n (cada workflow tiene
un tab "Executions") para ver dónde falla.

---

## Diagnóstico cuando algo falla

### Síntoma: el workflow se ejecuta pero el bot no responde

**Causa probable**: el backend devolvió `text: null` (mensaje no procesable
porque no empezaba con `/` y no había flujo activo).

**Cómo verificar**: en la ejecución del workflow, abrir el nodo
"¿Hay respuesta?" → si tomó la rama "false" (vacía), es esto.

**Solución**: mandar el mensaje con prefijo `/`.

### Síntoma: `401 unauthorized` desde el backend

**Causa**: `X-N8N-Secret` no coincide con `N8N_SHARED_SECRET` de Railway.

**Solución**: verificar que ambos valores sean idénticos. Cuidado con
espacios o saltos de línea al pegar.

### Síntoma: `400 wa_phone requerido` desde el backend

**Causa**: el nodo "Extraer mensaje" no devolvió `wa_phone` correctamente.

**Solución**: abrir la ejecución, ver el output del nodo Code. Debería tener
`{wa_phone, text, message_id}`. Si está vacío, el payload de Meta no tiene
la estructura esperada (ej: era un status, no un mensaje).

### Síntoma: el bot responde "Hola 👋 Este bot es de uso interno..."

**Causa**: el número del que llega el mensaje no está en `vendedores` con
`activo=true`.

**Solución**: agregarlo desde el panel admin
(`cgs-paraguay.netlify.app/admin.html`) → tab Vendedores → New.

### Síntoma: Meta API devuelve error (no llega el mensaje al WhatsApp)

**Causa probable**: token expirado, phone_number_id incorrecto, o número
del destinatario no autorizado en Meta (en modo desarrollo, solo los
números agregados como "test recipients" reciben mensajes).

**Solución**: verificar en Meta for Developers → WhatsApp → API Setup
que el número del vendedor esté listado en "Recipient phone numbers"
durante modo desarrollo.

---

## Mejoras futuras (no críticas)

- **Credentials en n8n** en lugar de hardcoded tokens (más seguro).
- **Manejo de imágenes**: el bot podría responder con foto del producto.
- **Manejo de botones interactivos**: confirmar pedido con botón en vez de
  tipear "si"/"no".
- **Workflow separado para envío proactivo**: notificaciones de stock,
  recordatorios. Requiere templates aprobados por Meta.

Estos van en el backlog del piloto (`docs/PILOTO_BACKLOG.md`).
