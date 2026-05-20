# CGS Bot — WhatsApp para vendedores

Bot de WhatsApp para el equipo de ventas de CGS Paraguay. Permite consultar el catálogo de lubricantes, registrar ventas y ver reportes directamente desde WhatsApp.

## Comandos disponibles

Todos los comandos se activan con el prefijo `/` (configurable).

| Comando | Descripción |
|---------|-------------|
| `/ayuda` | Muestra todos los comandos disponibles |
| `/catalogo` | Lista todos los productos con sus IDs |
| `/auto` · `/moto` · `/camion` | Filtra por categoría |
| `/[ID]` | Ficha completa de un producto (ej: `/3`) |
| `/5w30` · `/elaion` | Búsqueda por texto libre |
| `/vender` | Inicia el flujo guiado de venta |
| `/vender 3` | Registra 1 unidad del producto [3] |
| `/vender 3 2` | Registra 2 unidades del producto [3] |
| `/vender 3 2, 7 1` | Multi-venta en un solo mensaje |
| `/ventas` · `/ventas semana` | Resumen de ventas del día / semana |
| `/ranking` | Top 5 productos más vendidos (7 días) |
| `/salir` | Cancela el flujo activo |

Cuando el bot muestra una lista numerada, respondé con `1`, `2`... para seleccionar.

## Requisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com)
- Número de WhatsApp dedicado para el bot

## Configuración local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de entorno
cp .env.example .env
# Editá .env con tus credenciales

# 3. Levantar en modo desarrollo (recarga automática)
npm run dev
```

Al iniciar por primera vez, aparece un QR en la terminal. Escanealo desde WhatsApp → **Dispositivos vinculados → Vincular dispositivo**.

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key (bypasa RLS) |
| `ALLOWED_NUMBERS` | ✅ | Números autorizados, sin `+`, separados por coma |
| `BOT_PREFIX` | — | Prefijo de comandos (default: `/`) |
| `PHONE_NUMBER` | — | Solo para primer auth en servidor (pairing code) |

Formato de `ALLOWED_NUMBERS`: número internacional sin `+` ni espacios.
Ejemplo: `595981234567,595987654321`

## Deploy en Railway

### Primer deploy

1. Crear el proyecto en Railway desde este repositorio
2. Configurar las variables de entorno (Settings → Variables)
3. Crear un volumen persistente en **Volumes → New Volume** con mount path `/app/auth_info`
4. Agregar `PHONE_NUMBER=595XXXXXXXXX` en las variables (solo para el primer auth)
5. Hacer deploy y abrir los logs

### Vincular WhatsApp

Una vez desplegado, los logs muestran:

```
══════════════════════════════
  PAIRING CODE: XXXX-XXXX
  WhatsApp → Dispositivos vinculados → Vincular con número
══════════════════════════════
```

Ingresá el código en WhatsApp → **Dispositivos vinculados → Vincular con número de teléfono**.

Cuando los logs muestren `✅ Bot conectado a WhatsApp`, el bot está operativo. La sesión queda guardada en el volumen — no necesitás repetir este paso en futuros deploys.

### Variables en Railway

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | URL de Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key |
| `ALLOWED_NUMBERS` | Números del equipo |
| `BOT_PREFIX` | `/` |
| `PHONE_NUMBER` | Solo para primer auth |

## Base de datos

El bot usa dos tablas en Supabase:

- **`products`** — catálogo de productos (seed incluido en `supabase_sales.sql`)
- **`sales`** — registro de ventas (crear con `supabase_sales.sql`)

```bash
# Ejecutar en Supabase SQL Editor
supabase_sales.sql
```

## Stack

- [Baileys v7](https://github.com/whiskeysockets/baileys) — cliente WhatsApp Web no oficial
- [Supabase](https://supabase.com) — base de datos PostgreSQL
- Node.js 20 ESM
