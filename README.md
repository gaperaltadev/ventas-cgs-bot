# CGS Bot — WhatsApp para vendedores

Asistente de WhatsApp para el equipo de ventas de **CGS Paraguay**
(distribuidor oficial de lubricantes YPF). Los vendedores consultan el
catálogo, recomiendan productos por vehículo, y registran pedidos —
directamente desde WhatsApp sin instalar nada.

## Arquitectura (async-queue — v3)

```
Vendedor (WhatsApp)
        ↓
Meta WhatsApp Cloud API
        ↓ webhook
      n8n
        ↓ 1. Responde 200 OK a Meta de inmediato
        ↓ 2. Inserta en bot_queue (Supabase)
        ✗   (flujo n8n termina acá)

  Supabase bot_queue
        ↑ polling cada 2s
  Express Worker (este repo)
        ↓ parseIntent → handleCommand → Meta API
Meta Cloud API → responde al vendedor

        ↕ queries
Supabase (Postgres + Auth + bot_queue)
        ↑
   Panel Admin Web (Netlify — repo cgs-landing)
```

**Stack**:
- **Backend**: Node.js 20 ESM, Express + worker async, Supabase JS
- **Pasarela**: n8n self-hosted en Railway (solo inserta en cola — no llama al backend)
- **WhatsApp**: Meta Cloud API oficial (no Baileys ni clientes no oficiales)
- **DB**: Supabase (Postgres + RLS + Auth + tabla `bot_queue`)
- **Hosting**: Railway (backend + n8n)

## Estado del proyecto

- ✅ Schema de DB completo (`sql/`)
- ✅ Lógica de negocio (`handlers/`, `lib/`)
- ✅ Arquitectura async-queue implementada (`lib/worker.js`, `lib/meta.js`)
- ✅ Tabla `bot_queue` definida (`sql/05-bot-queue.sql`)
- ✅ User stories priorizadas (`docs/USER_STORIES.md`, `docs/DEMO_STORIES.md`)

Ver `docs/TECHNICAL_DESIGN.md` para diseño completo y ADRs.

## Comandos del bot (target)

Activación con prefijo `/` (configurable vía `BOT_PREFIX`).

### Consultas

| Comando | Descripción |
|---------|-------------|
| `/ayuda` | Menú con todos los comandos |
| `/catalogo` | Lista todos los productos por categoría |
| `/[ID]` | Ficha de un producto (ej: `/20`) |
| `/buscar [texto]` | Búsqueda inteligente tolerante a typos |
| `/guia [vehículo]` | Recomendación de lubricante por marca/modelo/año |

### Registros

| Comando | Descripción |
|---------|-------------|
| `/pedido` | Flujo guiado: cliente → items → confirmación |
| `/pedido [RUC] [ID cant, ID cant]` | Atajo directo con todo en un mensaje |
| `/mispedidos` | Últimos 10 pedidos del vendedor |

### Reportes

| Comando | Descripción |
|---------|-------------|
| `/ventas` | Resumen del día |
| `/ventas semana` | Resumen últimos 7 días |
| `/ranking` | Top 5 productos vendidos en la semana |

### Control

| Comando | Descripción |
|---------|-------------|
| `/salir` · `/chau` | Cancela cualquier flujo activo |

## Setup local

```bash
git clone https://github.com/gaperaltadev/ventas-cgs-bot.git
cd ventas-cgs-bot
npm install
cp .env.example .env   # editar con credenciales
npm run dev
```

## Variables de entorno

Ver `.env.example`. Resumen:

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key (bypasea RLS) |
| `BOT_PREFIX` | — | Prefijo de comandos (default: `/`) |
| `ALLOWED_NUMBERS` | — | Fallback de allowlist si la tabla `vendedores` está vacía |
| `N8N_SHARED_SECRET` | FASE B | Header de auth entre n8n y backend |
| `PORT` | — | Puerto HTTP (Railway lo asigna) |
| `META_*` | n8n | Credenciales Meta Cloud API (van en n8n, no en backend) |

## Base de datos

Migraciones idempotentes en `sql/`. Aplicar **en orden** desde Supabase SQL Editor.
Ver `sql/README.md` para detalles.

Tablas principales:
- `products` — catálogo
- `vehicle_guide` — recomendaciones por vehículo
- `vendedores` — allowlist + asignación de categorías
- `clientes` — clientes con RUC
- `pedidos` + `pedido_items` — pedidos con cliente identificado
- `sales` — *(legacy — sin uso desde la consolidación en /pedido)*

## Estructura del código

```
cgs-bot/
├── index.js                    # Entry point (stub — se reescribe en FASE B)
├── commands.js                 # Router de comandos
├── lib/
│   ├── supabase.js            # Cliente singleton
│   ├── session.js             # Sesiones in-memory + cache de allowlist
│   ├── format.js              # Templates de mensaje
│   ├── search.js              # Wrappers de RPCs Supabase
│   └── pedidos.js             # Lógica de clientes + pedidos
├── handlers/
│   ├── buscar.js
│   ├── guia.js
│   ├── pedido.js
│   └── mispedidos.js
├── sql/                        # Migraciones idempotentes
└── docs/
    ├── RETOMAR.md             # Plan de migración Baileys → Cloud API
    ├── USER_STORIES.md        # Stories con status MVD/Backend/Descartada
    ├── DEMO_STORIES.md        # 7 historias del Mínimo Viable de Demo
    ├── PILOTO_BACKLOG.md      # Features post-demo
    ├── manual/                # Manual de uso (HTML + PDF)
    ├── propuesta/             # Propuesta ejecutiva (HTML + PDF)
    └── _archive/              # Documentación histórica de Baileys
```

## Documentación clave

- **`docs/RETOMAR.md`** — punto de partida para retomar el proyecto
- **`docs/USER_STORIES.md`** — qué funciones existen y con qué prioridad
- **`docs/DEMO_STORIES.md`** — qué se va a mostrar al jefe (20 min)
- **`docs/PILOTO_BACKLOG.md`** — qué viene después si se aprueba
- **`docs/conversational-contract.md`** — diseño UX conversacional (válido en su mayor parte para Cloud API)

## Generar materiales

```bash
npm run manual:pdf       # PDF del manual para vendedores
npm run propuesta:pdf    # PDF de propuesta para el jefe
```

## Histórico

La arquitectura previa basada en Baileys + Railway quedó deprecada el
2026-05-22 después del segundo ban de WhatsApp sin completar vinculación.
Ver `docs/_archive/` para documentación de esa era.

## Repositorios relacionados

- **Landing pública + panel admin**: [`cgs-landing`](https://github.com/gaperaltadev/cgs) (Netlify)
- Comparten DB Supabase
