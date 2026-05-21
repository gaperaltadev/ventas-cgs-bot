# Manual de uso del bot — fuente

Acá vive el manual en HTML autocontenido. Se genera el PDF desde acá.

## Archivos

- `manual-cgs-bot.html` — manual completo (autocontenido, incluye logo YPF inline)
- `generate-pdf.js`     — script que genera el PDF usando Chrome/Edge headless
- `manual-cgs-bot.pdf`  — PDF generado (no se commitea — está en .gitignore)

## Generar el PDF

**Opción A — automática (Windows con Chrome o Edge instalado):**
```bash
npm run manual:pdf
```
Esto genera `manual-cgs-bot.pdf` en esta misma carpeta.

**Opción B — manual (cualquier sistema):**
1. Abrí `manual-cgs-bot.html` en un navegador (Chrome, Edge, Firefox).
2. `Ctrl+P` → destino **"Guardar como PDF"** → guardar.

## Editar el manual

Editás el HTML directamente. La estructura está dividida por secciones (`<h2>`)
y los bloques de comandos usan `<div class="command">`. Después de editar,
regenerá el PDF.

## Por qué no Markdown → PDF

Markdown se ve pobre para un manual con muchos bloques diferentes (comandos,
callouts, tablas con estilos por rol). HTML+CSS da control total del layout
y la impresión, y no requiere herramientas extra (Pandoc, etc.).
