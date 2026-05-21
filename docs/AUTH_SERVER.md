# Servidor web de vinculación

El bot incluye un servidor HTTP que sirve una página de vinculación con
**QR + pairing code** en simultáneo. Pensado para cuando no podés pasarle
el código a la persona en tiempo real (vinculación remota).

## Cómo funciona

Al arrancar, el bot levanta un servidor en el puerto definido por `PORT`
(en Railway lo asigna automáticamente). En los logs vas a ver:

```
[auth-server] escuchando en puerto 3000
[auth-server] local:    http://localhost:3000/?token=abc123def456
[auth-server] PÚBLICO: https://cgs-bot-production.up.railway.app/?token=abc123def456
```

## Habilitar dominio público en Railway

Por defecto Railway no expone los servicios al exterior. Para que la
persona pueda abrir el link:

1. Railway → tu servicio → **Settings** → **Networking**
2. **Generate Domain**
3. Te da una URL del estilo `https://cgs-bot-production.up.railway.app`

El bot detecta automáticamente este dominio (vía `RAILWAY_PUBLIC_DOMAIN`)
y lo muestra en los logs.

## Compartir el link con la persona

Copiá el link completo de los logs (incluye el token) y mandáselo por
cualquier canal: SMS, Telegram, email, otro WhatsApp, etc.

La persona lo abre en su navegador y ve una página con:

- **Opción 1 — QR:** lo escanea con WhatsApp en su teléfono
- **Opción 2 — Pairing code:** lo ingresa manualmente en
  WhatsApp → Dispositivos vinculados → Vincular con número de teléfono

Las dos opciones se actualizan automáticamente cada 4 segundos.

Si tarda más de 90s, el pairing code se renueva solo. El QR también.
La persona usa el último que vea en pantalla.

## Cuando la vinculación tiene éxito

La página detecta automáticamente que el bot quedó conectado y muestra:

```
✅ Vinculado correctamente
El bot ya está operativo. Podés cerrar esta página.
```

A partir de ese momento los endpoints `/qr.svg` y `/api/state` ya no
exponen el QR ni el código (devuelven `connected: true`).

## Seguridad

- Todos los endpoints (excepto `/health`) requieren `?token=XXX`.
- El token se configura via `AUTH_SERVER_TOKEN` en env vars.
- Si no se configura, el bot genera uno random en cada arranque (cambia
  al reiniciar — se imprime en logs).
- **Recomendado en Railway**: poner un `AUTH_SERVER_TOKEN` fijo así el
  link no cambia al redeploy.

## Endpoints

| Path | Auth | Descripción |
|------|------|-------------|
| `/` o `/vincular` | Token | Página HTML con QR + pairing code |
| `/api/state` | Token | JSON con `{ connected, hasQr, pairingCode, ... }` |
| `/qr.svg` | Token | SVG del QR actual (devuelve 410 si no hay o ya está conectado) |
| `/health` | — | `200 ok` para healthchecks de Railway |

## Variables de entorno relacionadas

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3000` | Puerto del servidor (Railway lo asigna) |
| `AUTH_SERVER_TOKEN` | random | Token de acceso. Si vacío, se genera al arrancar |
| `RAILWAY_PUBLIC_DOMAIN` | — | Lo setea Railway. Si está, el bot loguea el URL público |
