# Demo Stories — MVD para presentación al jefe

7 historias priorizadas con framework Valor × Esfuerzo × Riesgo.
Alcance objetivo: **20 minutos** de demo + 5 de Q&A.

Decisiones de scope ya tomadas:
- ✅ Consolidamos `/vender` (anónimo) dentro de `/pedido` usando cliente
  genérico `CONSUMIDOR FINAL` para mostrador.
- ✅ Descartamos `/destacados` (bajo uso, ruido en el menú).
- ✅ 7 historias en escena, otras implementadas en backend pero no demoeadas.
- ✅ Features de Cloud API (botones, listas, imágenes) van al backlog post-demo.

---

## 🎬 Orden narrativo (20 min)

| # | Story | Tiempo | Tipo |
|---|-------|--------|------|
| **0** | El problema actual | 2 min | Narrativa apertura |
| **1** | Catálogo siempre disponible | 1 min | Setup técnico |
| **2** | Recomendación por vehículo (`/guia`) | 3 min | ⭐ **Wow #1** |
| **3** | Búsqueda con typos (`/buscar`) | 2 min | Pulido UX |
| **4** | Pedido completo con cliente (`/pedido`) | 4 min | ⭐⭐ **Wow #2 — core del negocio** |
| **5** | Alta de cliente nuevo en el flujo | 1 min | Pulido UX |
| **6** | Reportes en tiempo real (`/ventas`, `/ranking`) | 3 min | ⭐ **Wow #3 — para el jefe** |
| **7** | Panel admin web | 3 min | Ecosistema |
| **8** | Cierre + qué necesito de vos | 1 min | Llamado a acción |

⭐ = momento clave, no acelerar.

---

## DS-00 · El problema actual (apertura narrativa)

**No es una historia técnica, es contexto para el jefe.**

Decir, no mostrar:
- "Hoy los vendedores anotan en papel o mandan WhatsApp suelto"
- "Vos armás los reportes a mano en Excel a fin de mes"
- "Cuando un vendedor pregunta qué aceite va en un Hilux, llama a alguien"
- "Cuando un cliente nuevo entra, se anota en una hoja que después se transcribe"

Pregunta retórica: *"¿cuántas horas por semana se pierden en esto?"*

Cierre: *"Lo que te voy a mostrar es un asistente en WhatsApp — la app que ya usan — que resuelve todo eso."*

---

## DS-01 · Catálogo siempre disponible

**Audiencia**: vendedor.
**Qué demuestra**: el bot conoce los 19 productos, agrupados por categoría, con IDs estables.

**Por qué importa**:
- Hoy un vendedor olvida productos nuevos y sigue ofreciendo los mismos de siempre.
- El catálogo está siempre actualizado (lo que el jefe carga en el panel admin, los vendedores lo ven en el instante).

**Cómo se ve**:
```
Vendedor: /catalogo
Bot:      📋 Catálogo CGS Paraguay

          *ELAION — Autos*
            [20] ELAION F10 5W-30
            [21] ELAION F10 10W-40
            [22] ELAION F30 5W-40
            ...

          *EXTRAVIDA — Camiones*
            [26] EXTRAVIDA DX 15W-40
            ...
```

**No te detengas mucho acá** — es setup. El jefe sabe lo que es un catálogo.

---

## DS-02 · Recomendación por vehículo (`/guia`) ⭐

**Audiencia**: vendedor en frente del cliente.
**Qué demuestra**: el bot recomienda lubricante dado marca + modelo + año.

**Por qué importa**:
- Momento crítico de venta: cliente decidido a comprar, pregunta "¿qué le pongo a mi auto?"
- Hoy el vendedor adivina o llama a alguien — pierde tiempo o vende mal.
- El bot da producto recomendado + alternativa + nota técnica al instante.

**Cómo se ve** (mostrar 3 ejemplos seguidos para dar volumen):

```
Vendedor: /guia toyota hilux 2020
Bot:      🚗 Toyota Hilux (2016-2024) · diesel

          ✅ Recomendado: [26] EXTRAVIDA DX 15W-40
          ↪ Alternativa:  [27] EXTRAVIDA ULTRA 10W-40

          📝 Motor 1GD-FTV 2.8L

          👉 /26 ficha · /pedido 26 registrar
```

```
Vendedor: /guia honda cg 150
Bot:      🏍️ Honda CG 150 (2010-2024) · 4 tiempos

          ✅ Recomendado: [30] YPF RÖD 4T 20W-50

          👉 /30 ficha · /pedido 30 registrar
```

```
Vendedor: /guia vw gol 2015
Bot:      🚗 Volkswagen Gol (2010-2018) · nafta

          ✅ Recomendado: [21] ELAION F10 10W-40
          ↪ Alternativa:  [20] ELAION F10 5W-30
```

**Línea narrativa**: *"el vendedor no necesita saber de aceites — el bot sabe."*

---

## DS-03 · Búsqueda con tolerancia a typos (`/buscar`)

**Audiencia**: vendedor con dedo grande, prisa, sol fuerte.
**Qué demuestra**: el bot encuentra el producto aunque se escriba mal.

**Por qué importa**:
- Antes: typo = "no encontré nada" = abandono.
- Ahora: el bot detecta el error y sugiere.

**Cómo se ve**:
```
Vendedor: /buscar elaiom 5w30        ← "elaiom" con M en vez de N
Bot:      ¿Quisiste decir *ELAION F10 5W-30*?

          1. [20] ELAION F10 5W-30 — Semi-Sintético
          2. [23] ELAION F30 5W-30 — Sintético

          👉 Escribí 1 o 2.

Vendedor: 1
Bot:      🔧 [20] ELAION F10 5W-30
          ...
```

**Línea narrativa**: *"no importa cómo lo escribas, el bot lo entiende."*

---

## DS-04 · Pedido completo con cliente (`/pedido`) ⭐⭐

**Audiencia**: vendedor de ruta + el jefe que ve los datos.
**Qué demuestra**: registrar pedido (cliente + productos + cantidades + confirmación) en un solo intercambio.

**Por qué importa**:
- **Este es el corazón del negocio.** Es la story que reemplaza papel + Excel + transcripción.
- Datos consolidados: quién vendió, a quién, qué, cuándo.

**Cómo se ve**:
```
Vendedor: /pedido 80012345-1 20 5, 26 2
Bot:      *Confirmá el pedido*

          Cliente: AUTOREPUESTOS SAN LORENZO SRL
          RUC: 80012345-1 · San Lorenzo

            • [20] ELAION F10 5W-30 ×5
            • [26] EXTRAVIDA DX 15W-40 ×2

          Total: 7 unidades (2 productos)

          👉 Respondé *si* o *no*.

Vendedor: si
Bot:      ✅ Pedido #1042 registrado
          Cliente: AUTOREPUESTOS SAN LORENZO SRL
          Total: 7 unidades · 2 productos
          🕐 14:32
```

**Mostrar el panel admin después** (transición a DS-07): el pedido recién creado aparece ahí inmediatamente. "Mientras yo lo cargo desde el celular, vos lo ves desde la oficina."

**Línea narrativa**: *"un mensaje, 3 segundos, todo registrado."*

---

## DS-05 · Alta de cliente nuevo en el flujo

**Audiencia**: vendedor que descubre un cliente en una visita.
**Qué demuestra**: si el RUC no existe, el bot lo da de alta en el mismo flujo, sin interrumpir.

**Por qué importa**:
- Hoy: vendedor anota en papel, después transcribe a Excel. Errores garantizados.
- Con el bot: 5 segundos extra, cero pasos manuales después.

**Cómo se ve**:
```
Vendedor: /pedido 80099999-9 20 3
Bot:      No tengo registrado el RUC *80099999-9*.
          👉 Mandame el *nombre / razón social* del cliente.

Vendedor: Lubricentro El Roble SRL
Bot:      ✅ Cliente dado de alta: Lubricentro El Roble SRL

          *Confirmá el pedido*
          Cliente: LUBRICENTRO EL ROBLE SRL
          ...
```

**Línea narrativa**: *"clientes nuevos sin frenar la venta."*

---

## DS-06 · Reportes en tiempo real ⭐

**Audiencia**: principalmente el jefe.
**Qué demuestra**: el jefe ve cuánto se vendió hoy, esta semana, qué productos lideran — sin abrir Excel, sin esperar fin de mes.

**Por qué importa**:
- Hoy: el jefe espera el cierre de mes.
- Con el bot: en cualquier momento, en su celular, sabe.

**Cómo se ve**:
```
Jefe: /ventas
Bot:  📊 Ventas de hoy

      ELAION — Autos: 8 uds
      EXTRAVIDA — Camiones: 15 uds
      *Total: 23 uds* (3 operaciones)

      *Detalle:*
        14:32 · ELAION F10 5W-30 ×5
        13:15 · EXTRAVIDA DX 15W-40 ×8
        ...

Jefe: /ventas semana
Bot:  📊 Ventas de la semana
      ELAION — Autos: 64 uds
      EXTRAVIDA — Camiones: 79 uds
      RÖD — Motos: 32 uds
      *Total: 175 uds* (18 operaciones)

Jefe: /ranking
Bot:  🏆 Top productos — últimos 7 días

      1. EXTRAVIDA DX 15W-40 — 70 uds
      2. ELAION F10 5W-30 — 28 uds
      3. YPF RÖD 4T 20W-50 — 14 uds
      4. ELAION F30 5W-30 — 9 uds
      5. ELAION SUV 5W-40 — 6 uds
```

**Línea narrativa**: *"vos ves todo en vivo, no tenés que esperar."*

---

## DS-07 · Panel admin web

**Audiencia**: jefe / administrador.
**Qué demuestra**: pantalla web para gestionar productos, vendedores, clientes y ver pedidos con filtros.

**Por qué importa**:
- WhatsApp es para acción rápida del vendedor.
- El panel es para análisis profundo + administración (ABM).

**Cómo se ve**: abrir `cgs-paraguay.netlify.app/admin.html` en laptop.

Mostrar en este orden:
1. **Pedidos** — filtrar por última semana. Click en el pedido recién creado (DS-04) → detalle con items.
2. **Vendedores** — explicar el botón "activo": dar de baja sin perder historial.
3. **Clientes** — el cliente nuevo (DS-05) ya está acá, editar agregar teléfono.
4. **Productos** — editar uno (cambiar viscosidad). "Esto se refleja en el bot al instante."
5. **Guía de Vehículos** — agregar uno nuevo en vivo.

**Línea narrativa**: *"lo gestionás como una herramienta, no como una planilla."*

---

## Cierre + llamado a acción (1 min)

```
Lo que viste es una demo funcional.
Para llevarlo al equipo necesito:

1. Aprobación para que 3-5 vendedores lo usen 2-4 semanas en sus visitas reales.
2. Documentación de la empresa para iniciar verificación Meta Business
   (gratis, 1 semana, sin riesgo de bloqueo).
3. Una decisión sobre qué número WhatsApp es el oficial.

¿Cuándo arrancamos con el equipo?
```

Entregar el PDF de propuesta como cierre.

---

## Stories implementadas pero NO en escena del demo

| Story | Cómo aparece |
|-------|--------------|
| `/[ID]` ficha directa | Implícita en `/guia` y `/buscar` |
| `/auto`, `/moto`, `/camion` | Atajos de categoría — se pueden mencionar al pasar |
| `/mispedidos` | El vendedor también ve sus propios pedidos — mencionar |
| Selección numérica | Aparece naturalmente en `/buscar` (story DS-03) |
| `/ayuda` | Mencionar como "el bot se autoexplica" |
| `/salir` | Plomería — no se demuestra |
| Recuperación de errores | Se ve si algo sale mal (no esperado, pero protegido) |

---

## Stories DESCARTADAS del scope

| Story | Razón |
|-------|-------|
| `/vender` anónimo | Consolidado en `/pedido` con cliente `CONSUMIDOR FINAL` |
| Multi-venta `/vender X 5, Y 3` | Cubierto por items múltiples en `/pedido` |
| `/destacados` | Bajo uso real, ruido en el menú |

**Cambio en el seed de demo**: agregar cliente genérico:
```sql
INSERT INTO clientes (ruc, razon_social, ciudad, contacto, created_by)
VALUES ('00000000-0', 'CONSUMIDOR FINAL', 'Asunción', NULL, '595981111111');
```

Cuando un vendedor de mostrador no tiene RUC: `/pedido 00000000-0 20 1` → venta registrada sin friction.

---

## Métricas de éxito post-demo (semanas 1-4 del piloto)

| Métrica | Cómo medirla | Objetivo |
|---------|--------------|----------|
| Adopción | Vendedores activos × semana | 3+ vendedores usando regularmente |
| Volumen | Pedidos cargados / semana | Curva creciente |
| Reemplazo de canal viejo | Pedidos por bot vs por WhatsApp libre | 70%+ por bot al final de la 4ta semana |
| Engagement del jefe | Logins al panel / semana | Al menos 3 |
| Tasa de error | Pedidos cancelados o corregidos | <10% |
