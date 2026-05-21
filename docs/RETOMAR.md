# Retomar — punto de partida para próxima sesión

Última pausa: 2026-05-21. El bot quedó pausado en Railway tras un ban de
WhatsApp causado por un loop tight ya solucionado en el código.

## 1. Verificar antes de tocar nada (5 min)

### a) Estado del ban
- Han pasado **al menos 24-48h** desde que pausamos el bot? → seguir abajo
- Si no llegaste a esperar, **no quites `BOT_PAUSED=true` todavía**

### b) Estado en Railway
- Service → Variables → confirmar que `BOT_PAUSED=true` está seteado
- Si no está, agregalo antes de hacer cualquier cosa

### c) Estado en Supabase
Confirmar que las 7 migraciones SQL están aplicadas. SQL Editor:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('products','vendedores','vehicle_guide','clientes','pedidos','pedido_items','sales');
-- Deberían aparecer las 7 tablas
```

Si falta alguna, ejecutar el `sql/0X-*.sql` correspondiente en orden.

## 2. Probar la vinculación (después del wait)

1. Railway → Variables → **borrar `BOT_PAUSED`**
2. Esperar ~30s al redeploy
3. Abrir la URL pública con el token (está en los logs al arrancar)
4. Verificar:
   - **Caso A — funciona**: el bot conecta. La página muestra "✓ Conectado". Pasar a la sección 3.
   - **Caso B — vuelve a fallar**: el nuevo circuit breaker se va a activar después de 3 intentos y pausará 1h. La página va a mostrar el banner rojo con botón "Reset manual". **NO apretar el reset** — esperar otras 24h e intentar de nuevo.
   - **Caso C — falla después de varios días**: número permanentemente baneado. Conseguir otro número o evaluar WhatsApp Business Cloud API.

## 3. Smoke tests cuando vincule (10 min)

Desde un número autorizado (cargado en tabla `vendedores`):

```
/ayuda                           → menú visible
/catalogo                        → 19 productos agrupados
/buscar elaiom 5w30              → matchea ELAION F10 5W-30 (typo tolerado)
/guia toyota corolla 2018        → recomienda producto
/vender 20                       → registra venta rápida
/pedido                          → flujo guiado de pedido
/mispedidos                      → lista vacía o con tests previos
/salir                           → cancela cualquier flujo
```

Verificar en panel admin (`cgs-paraguay.netlify.app/admin.html`):
- Tab "Pedidos" muestra los pedidos de prueba
- Tab "Clientes" muestra clientes creados on-the-fly

---

## 4. Roadmap de mejoras (ordenado por valor/costo)

El review técnico identificó 7 mejoras críticas. Ordenado para retomar:

### Quick wins — 1 hora total

| # | Tarea | Tiempo | Riesgo |
|---|-------|--------|--------|
| P4 | Sacar código muerto: `searchProducts`, `normalize`, `cmdProducto`, `cmdCategoria` de `commands.js` | 30 min | Bajo |
| P7 | Hacer `reset()` en `data.js` seguro (eliminar array DEFAULTS de 374 líneas) | 15 min | Bajo |
| P5 | Trigger SQL que normaliza RUC (saca guiones, deja solo dígitos) | 15 min | Bajo |
| P6 | Trigger SQL `updated_at` automático en todas las tablas | 15 min | Bajo |

### Refactor estructural — 1-2 días

| # | Tarea | Tiempo | Beneficio |
|---|-------|--------|-----------|
| P2 | **Registry declarativo de comandos** (reemplazar las 3 fuentes de verdad: `parseIntent`, `KNOWN_COMMANDS_RE`, `handleCommand`) | 4-6h | Agregar comandos sin romper nada |
| P1 | **Unificar `sales` + `pedidos`** en tabla `transactions` | 1 día | Reportes consistentes, desbloquea FASE 3 |
| P3 | Extraer template HTML de `auth-server.js` a `lib/views/` | 1-2h | Mantenibilidad |

**Recomendación de orden cuando vuelvas:**

1. **Si la vinculación fue exitosa**: arrancar por los 4 quick wins (P4→P7→P5→P6). Casi sin riesgo, dejan el código y la DB más limpios para el resto.

2. **Después**: P2 (registry) — es la base que va a hacer más fáciles las features futuras.

3. **Después**: P1 (unificar transactions) — es la migración más jugosa porque desbloquea FASE 3 (notificaciones de stock) y los reportes consolidados.

4. **Después**: FASE 3 — Notificaciones de stock vía Supabase Realtime.

---

## 5. Referencia rápida — archivos clave

### Bot
- `index.js` — bootstrap, parseIntent, conexión WhatsApp
- `commands.js` — router (TIENE CÓDIGO MUERTO, ver P4)
- `lib/session.js` — sesiones + cache de allowlist
- `lib/pedidos.js` — lógica de clientes y pedidos
- `lib/auth-server.js` — servidor web de vinculación (con circuit breaker y reset)
- `lib/diagnostics.js` — tracker de eventos para debugging
- `handlers/` — un archivo por dominio (buscar, guia, pedido, mispedidos)

### Landing
- `index.html` + `js/app.js` — sitio público
- `admin.html` + `js/admin.js` — panel admin (productos + auth)
- `js/admin-{vehiculos,vendedores,clientes,pedidos}.js` — tabs nuevas
- `js/data.js` — capa de datos (TIENE DEFAULTS HARDCODED, ver P7)

### SQL
- `sql/0X-*.sql` — migraciones idempotentes, ejecutar en orden
- `sql/seed-vehicle-guide.sql` — 44 vehículos común PY (ya ejecutado)

---

## 6. Si algo se rompió en mi ausencia

| Síntoma | Causa probable | Fix |
|---------|---------------|-----|
| Bot no responde a nadie | Sesión expirada o `vendedores` vacía | Verificar logs + agregar vendedor en panel |
| Panel admin login falla | Sign-up Email Provider deshabilitado | Authentication → Providers → Email ON, signups OFF |
| URL pública del bot 404 | Railway domain expiró/se borró | Settings → Networking → Generate Domain de nuevo |
| Pedidos no se crean | Vendedor no está en tabla con `activo=true` | Panel admin → Vendedores → editar |

---

## 7. Contactos / accesos

- **Repo bot**: github.com/gaperaltadev/ventas-cgs-bot
- **Repo landing**: github.com/gaperaltadev/cgs
- **Bot live**: Railway (URL en variables del servicio)
- **Landing live**: cgs-paraguay.netlify.app
- **Admin**: cgs-paraguay.netlify.app/admin.html
- **DB**: Supabase project (URL en `SUPABASE_URL` env)

---

*Cuando retomes, leé este archivo primero. Después decidí si arrancar por
testing del bot (sección 2) o directo por el roadmap de mejoras (sección 4).
Buen descanso.*
