# CGS Bot — WhatsApp para vendedores

Bot de WhatsApp para el equipo de ventas de CGS Paraguay. Permite consultar el catálogo de lubricantes YPF, recomendar productos por vehículo, registrar ventas y pedidos, y ver reportes — directamente desde WhatsApp.

## Comandos disponibles

Todos los comandos se activan con el prefijo `/` (configurable vía `BOT_PREFIX`).

### Consultas de catálogo

| Comando | Descripción |
|---------|-------------|
| `/ayuda` | Menú completo de comandos |
| `/catalogo` | Lista todos los productos agrupados por categoría |
| `/[ID]` | Ficha detallada de un producto (ej: `/20`) |
| `/auto` · `/moto` · `/camion` · `/otros` | Productos por categoría |
| `/destacados` | Productos marcados como destacados |
| `/buscar [texto]` | Búsqueda inteligente tolerante a typos |
| `/guia [marca modelo año]` | Recomendación de lubricante por vehículo |

### Registro de ventas (mostrador, sin cliente identificado)

| Comando | Descripción |
|---------|-------------|
| `/vender` | Inicia flujo guiado paso a paso |
| `/vender [ID]` | Registra 1 unidad |
| `/vender [ID] [cant]` | Registra N unidades |
| `/vender [ID] [cant], [ID] [cant]` | Multi-venta en un solo mensaje |

### Pedidos con cliente identificado (ruta)

| Comando | Descripción |
|---------|-------------|
| `/pedido` | Inicia flujo guiado: cliente → items → confirmación |
| `/pedido [RUC] [ID] [cant], ...` | Atajo directo con todo en un mensaje |
| `/mispedidos` | Tus últimos 10 pedidos |

Si el RUC no existe en la base, el bot pregunta la razón social y crea el cliente automáticamente.

### Reportes

| Comando | Descripción |
|---------|-------------|
| `/ventas` · `/ventas semana` | Resumen del día / últimos 7 días |
| `/ranking` · `/top` | Top 5 productos más vendidos en la semana |

### Control de flujo

| Comando | Descripción |
|---------|-------------|
| `/salir` · `/chau` · `/cancelar` | Cancela cualquier flujo activo |

Cuando el bot muestra una lista numerada (selección de producto, cliente, etc.), respondés con `1`, `2`... sin barra. Cuando el bot espera una cantidad o respuesta libre, también respondés directo sin barra.

## Características técnicas

### Búsqueda inteligente

`/buscar` usa **pg_trgm** (Postgres trigram similarity) con tokenización: divide la query en palabras y matchea cada una individualmente. Esto hace que `elaiom 5w30` (con typo) encuentre `ELAION F10 5W-30`. Si no hay match en productos, el bot consulta automáticamente la guía de vehículos.

### Flujos guiados

Para tareas con múltiples pasos (venta, pedido), el bot mantiene una **sesión por conversación** con `flowStep` que indica qué espera del usuario. Cualquier comando conocido cancela el flujo automáticamente — escape natural sin tener que escribir `/salir`.

### Vinculación con WhatsApp

Soporta dos modos:
- **Pairing code** (recomendado para servidor): pone `PHONE_NUMBER=595...` en env. El bot imprime un código de 8 caracteres en logs y lo regenera cada 90s hasta que vinculás.
- **QR** (fallback local): si no hay `PHONE_NUMBER`, el bot imprime un QR en la terminal.

Auto-recovery: si WhatsApp cierra la sesión, el bot limpia `auth_info/`, reconecta y genera un nuevo pairing code automáticamente.

### Allowlist de vendedores

Solo responde a números registrados en la tabla `vendedores` con `activo = TRUE`. La cache se refresca cada 5 minutos — al dar de alta a alguien desde el panel admin, en máximo 5 min puede usar el bot.

## Stack

- **Bot:** [Baileys v7](https://github.com/whiskeysockets/baileys) (cliente WhatsApp Web no oficial)
- **DB:** [Supabase](https://supabase.com) (Postgres + Auth + Realtime)
- **Hosting bot:** [Railway](https://railway.com) (con volumen persistente para `auth_info/`)
- **Hosting panel admin:** [Netlify](https://www.netlify.com) (en el repo `cgs-landing`)
- **Runtime:** Node.js 20 ESM, sin TypeScript ni frameworks

## Requisitos

- Node.js 20+
- Cuenta en Supabase con las migraciones de `sql/` aplicadas
- Número de WhatsApp dedicado para el bot (no es tu personal — es para que el equipo le escriba)

## Configuración local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de entorno
cp .env.example .env
# Editar .env con las credenciales

# 3. Levantar en modo desarrollo (con nodemon + auto-restart al cambiar .env)
npm run dev
```

La primera vez:
- Si pusiste `PHONE_NUMBER` → te aparece el pairing code en la terminal.
- Si no → te aparece un QR. Escanealo desde WhatsApp → **Dispositivos vinculados → Vincular dispositivo**.

## Variables de entorno

Ver `.env.example`. Resumen:

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key (bypasea RLS) |
| `BOT_PREFIX` | — | Prefijo de comandos (default: `/`) |
| `PHONE_NUMBER` | — | Solo para vinculación inicial vía pairing code. Después se puede borrar |
| `ALLOWED_NUMBERS` | — | Fallback de allowlist si la tabla `vendedores` está vacía (modo dev) |

## Base de datos

Aplicar las migraciones de `sql/` **en orden** desde Supabase SQL Editor. Ver `sql/README.md` para detalles.

Tablas principales:
- **`products`** — catálogo de lubricantes
- **`vehicle_guide`** — guía de qué lubricante usar para cada vehículo
- **`vendedores`** — allowlist + categorías por vendedor
- **`clientes`** — clientes identificados por RUC
- **`pedidos`** + **`pedido_items`** — pedidos vinculados a clientes
- **`sales`** — ventas anónimas (de `/vender`)

## Deploy en Railway

Ver instrucciones detalladas más abajo. Resumen:

1. Conectar este repo a Railway
2. Configurar variables de entorno
3. Crear un **Volume** con mount path `/app/auth_info` (para persistir la sesión de WhatsApp)
4. Deploy → ver los logs para el pairing code
5. Ingresar el código en WhatsApp en el teléfono cuyo número está en `PHONE_NUMBER`

### Variables en Railway

Mismas que en local (`.env`), excepto que `--env-file=.env` no se usa en producción (`npm start` lee directo de `process.env`).

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | URL de Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key |
| `BOT_PREFIX` | `/` (recomendado) |
| `PHONE_NUMBER` | Solo para el primer auth |

### Vinculación

Los logs muestran cada 90 segundos un código nuevo hasta que vincules:

```
══════════════════════════════
  PAIRING CODE: ABCD1234
  Generado: 14:32:10 · Se renueva: 14:33:40

  Para vincular 595XXXXXXXXX:
  1. Abrí WhatsApp en ese teléfono
  2. Configuración → Dispositivos vinculados
  3. Vincular con número de teléfono
  4. Ingresá el código de 8 caracteres

  💡 Si tardás, esperá al próximo código (cada 90s).
══════════════════════════════
```

Cuando los logs muestren `✅ Bot conectado a WhatsApp`, está operativo y la sesión queda guardada en el volumen — no necesitás repetir este paso en futuros deploys.

## Panel admin

La gestión de vendedores, clientes, vehicle_guide, productos y la consulta de pedidos se hace desde el panel web en [cgs-paraguay.netlify.app/admin.html](https://cgs-paraguay.netlify.app/admin.html). El código vive en el repo `cgs-landing`. Ver `docs/ADMIN_PANEL.md` allí.

## Estructura del código

```
cgs-bot/
├── index.js                  # Bootstrap + WhatsApp connection + parseIntent
├── commands.js               # Router de comandos
├── lib/
│   ├── supabase.js          # Cliente singleton
│   ├── session.js           # Sesiones en memoria + cache de allowlist
│   ├── format.js            # Templates de mensajes
│   ├── search.js            # Búsqueda fuzzy de productos y vehículos
│   └── pedidos.js           # Lógica de clientes y pedidos
├── handlers/                 # Un archivo por dominio
│   ├── buscar.js
│   ├── guia.js
│   ├── pedido.js
│   └── mispedidos.js
├── sql/                      # Migraciones idempotentes (numeradas)
└── docs/
    ├── conversational-contract.md   # Diseño de UX conversacional v3.1 (FASE 1)
    └── manual/                       # Manual de uso para vendedores y jefe
        ├── manual-cgs-bot.html
        └── generate-pdf.js
```

## Generar el manual de uso (PDF)

```bash
npm run manual:pdf
```

Usa Chrome/Edge headless para imprimir el HTML a PDF. Sin dependencias npm adicionales.
