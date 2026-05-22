# Demo Stories — qué vamos a mostrar al jefe

Selección de 7 user stories del set original (USER_STORIES.md) priorizadas
por **impacto demostrable** y **valor de negocio observable en una
presentación de 20 minutos**. Cada una incluye:

- **Quién** lo necesita (vendedor / jefe / cliente)
- **Qué** hace exactamente
- **Por qué** importa al negocio (no por qué es técnicamente lindo)
- **Cómo se ve** en la demo (ejemplo concreto)
- **Métrica de éxito** post-demo

---

## DS-01 · Catálogo siempre disponible <Badge: Vendedor>

**Quién**: vendedor de ruta o mostrador.
**Qué**: consultar el catálogo completo desde WhatsApp en cualquier momento.
**Por qué importa**:
- Hoy: el vendedor olvida productos nuevos, sigue ofreciendo los de siempre.
- Con el bot: ofrece el catálogo completo siempre actualizado, sin papeles.

**Cómo se ve**:
```
Vendedor: /catalogo
Bot:      📋 Catálogo CGS Paraguay
          *ELAION — Autos*
            [20] ELAION F10 5W-30
            [21] ELAION F10 10W-40
            [22] ELAION F30 5W-40
            ...
```

**Métrica**: cuántas veces /catalogo se consulta por semana × vendedor.
Indica si los vendedores están descubriendo / re-descubriendo productos.

---

## DS-02 · Recomendación por vehículo <Badge: Vendedor> <Estrella>

**Quién**: vendedor en frente del cliente que tiene un vehículo específico.
**Qué**: el bot recomienda qué lubricante usar dado marca + modelo + año.
**Por qué importa**:
- Es el momento de la venta más crítico: el cliente está decidido a comprar y pregunta "qué le pongo a mi auto".
- Hoy el vendedor adivina o llama a alguien.
- El bot da la recomendación instantánea con producto principal + alternativa.

**Cómo se ve**:
```
Vendedor: /guia toyota hilux 2020
Bot:      🚗 Toyota Hilux (2016-2024) · diesel

          ✅ Recomendado: [26] EXTRAVIDA DX 15W-40
          ↪ Alternativa:  [27] EXTRAVIDA ULTRA 10W-40

          📝 Motor 1GD-FTV 2.8L

          👉 /26 ficha · /vender 26 registrar
```

**Métrica**: pedidos cerrados después de un /guia (tasa de conversión).

> 🌟 **Esta es la story que más impresiona al jefe.** Mostrar 3-4 vehículos
> distintos (Hilux, Corolla, una moto Honda CG, un VW Gol).

---

## DS-03 · Búsqueda inteligente con typos <Badge: Vendedor>

**Quién**: vendedor que conoce el producto pero no el nombre exacto, o tipea rápido en el celular.
**Qué**: el bot encuentra el producto aunque se escriba mal, falten letras, o se invierta el orden.
**Por qué importa**:
- Vendedor en la calle con sol fuerte, dedo grande sobre pantalla, prisa.
- Tipear "elaion 5W-30" sin equivocarse es difícil — y antes de este bot, un error de tipeo significaba "no encontró nada, abandono".

**Cómo se ve**:
```
Vendedor: /buscar elaiom 5w30        ← typo: "m" en vez de "n"
Bot:      ¿Quisiste decir *ELAION F10 5W-30*?
          1. [20] ELAION F10 5W-30 — Semi-Sintético
          2. [23] ELAION F30 5W-30 — Sintético
          👉 Escribí 1 o 2.
```

**Métrica**: % de búsquedas exitosas (que terminan en una ficha o venta) vs % que devuelven "no encontré".

---

## DS-04 · Registro de pedido con cliente <Badge: Vendedor> <Centro>

**Quién**: vendedor de ruta que visita clientes con RUC y registra ventas en su nombre.
**Qué**: registrar un pedido completo (cliente + productos + cantidades) en un solo mensaje, con confirmación previa antes de guardarlo.
**Por qué importa**:
- Hoy: papel + Excel + transcripción + errores.
- Con el bot: 3 segundos. El cliente queda asociado al pedido automáticamente. Se ve quién vendió, a quién, qué y cuánto.

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
          🕐 14:32
```

**Métrica**: pedidos/día × vendedor. Si crece desde semana 1 a semana 4, el bot está reemplazando el método anterior.

> ⭐ **Esta es la story que mueve la aguja para el negocio.**

---

## DS-05 · Alta de cliente nuevo en el flujo <Badge: Vendedor>

**Quién**: vendedor que descubre un cliente nuevo en una visita y necesita registrarlo sin frenar la venta.
**Qué**: si el RUC no existe, el bot lo pregunta "¿qué nombre tiene?", lo registra, y sigue con el pedido sin volver a empezar.
**Por qué importa**:
- Hoy: el vendedor tendría que salir del flujo, anotar en papel, después cargarlo en Excel.
- Con el bot: 5 segundos extras, cero pasos manuales.

**Cómo se ve**:
```
Vendedor: /pedido 80099999-9 20 3
Bot:      No tengo registrado el RUC *80099999-9*.
          👉 Mandame el *nombre / razón social* del cliente.

Vendedor: Lubricentro El Roble SRL
Bot:      ✅ Cliente dado de alta: Lubricentro El Roble SRL
          [sigue con el pedido normalmente]
```

**Métrica**: clientes nuevos cargados/mes. Indica crecimiento de cartera.

---

## DS-06 · Reportes en tiempo real <Badge: Vendedor + Jefe> <Estrella>

**Quién**: vendedor (sus propias ventas) y jefe (toda la actividad).
**Qué**: consultar ventas del día / semana / top productos sin abrir Excel ni esperar a fin de mes.
**Por qué importa**:
- Hoy: el jefe espera el cierre de mes para saber cómo va.
- Con el bot: en cualquier momento, desde el celular, sabe exactamente cuánto se vendió hoy y qué productos lideran.

**Cómo se ve**:
```
Jefe: /ventas semana
Bot:  📊 Ventas de la semana
      ELAION — Autos: 64 uds
      EXTRAVIDA — Camiones: 79 uds
      RÖD — Motos: 32 uds
      *Total: 175 uds* (18 operaciones)
      ...

Jefe: /ranking
Bot:  🏆 Top productos — últimos 7 días
      1. EXTRAVIDA DX 15W-40 — 70 uds
      2. ELAION F10 5W-30 — 28 uds
      3. YPF RÖD 4T 20W-50 — 14 uds
      ...
```

**Métrica**: frecuencia con que el jefe consulta los reportes (proxy de "el bot le aporta valor").

---

## DS-07 · Panel admin web para gestión <Badge: Jefe>

**Quién**: jefe / administrador.
**Qué**: pantalla web con todos los pedidos, productos, vendedores, clientes — con búsquedas y filtros.
**Por qué importa**:
- El reporte por WhatsApp es para acción rápida.
- El panel es para análisis profundo y para administrar (dar de alta vendedor, editar precio, etc.).

**Cómo se ve**: navegador en `cgs-paraguay.netlify.app/admin.html`
- Tab Pedidos: lista con filtros por fecha, vendedor, cliente. Click en cualquier pedido → ve items detallados.
- Tab Vendedores: ABM. Marcar inactivo a quien deja la empresa.
- Tab Clientes: corregir datos cargados desde el bot, agregar notas internas.
- Tab Productos: editar catálogo (cambios se reflejan en el bot al instante).

**Métrica**: jefe entra al panel ≥1 vez por semana sin que se lo pidamos.

---

## Stories que NO entran en la demo (pero existen)

| Story | Por qué se queda afuera |
|-------|-------------------------|
| US-08 Resolver ambigüedad (selección de lista) | Aparece naturalmente cuando hay 2+ matches. No necesita demo dedicada. |
| US-09 Recuperarse de error | Idem — se ve durante el demo si algo sale mal. |
| US-11 Productos destacados (/destacados) | Útil pero no diferenciador. |
| US-12 Discovery (/ayuda) | Se nombra al pasar, no es protagonista. |

Y **NO mostramos durante la demo**:
- Comandos `!xxx` (ya no se usan)
- Endpoint `/api/debug` ni circuit breaker (es plomería, no historia)
- Pairing code / vinculación (ya estará vinculado antes de la demo)

---

## Orden de la demo

El acto narrativo del 20 min:

```
1.  Problema (2 min)           — "hoy es papel y Excel"
2.  DS-01 Catálogo (1 min)     — "el bot tiene todo, siempre"
3.  DS-02 Guía (3 min) ⭐       — "preguntale qué aceite va"
4.  DS-03 Búsqueda con typo (2 min) — "no importa cómo escribas"
5.  DS-04 Pedido (4 min) ⭐    — "registro completo en 3 segundos"
6.  DS-05 Alta cliente (1 min) — "cliente nuevo sin frenar"
7.  DS-06 Reportes (3 min) ⭐  — "vos ves todo en vivo"
8.  DS-07 Panel admin (3 min) — "lo gestionás como una herramienta"
9.  Cierre + qué necesito (1 min) — la propuesta PDF
```

⭐ = momento clave, no acelerar.
