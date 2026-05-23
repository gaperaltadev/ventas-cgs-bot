# Documentación histórica — Baileys era

Esta carpeta contiene documentos que describen la arquitectura previa
del bot, basada en **Baileys** (cliente no oficial de WhatsApp Web).

Esa arquitectura quedó **deprecada el 2026-05-22** después de que 2
números de WhatsApp fueran baneados por Meta sin completar vinculación
exitosa, debido a que la IP de Railway está marcada como "datacenter
sospechoso" por la antifraude de Meta.

**La nueva arquitectura** usa Meta WhatsApp Cloud API (oficial) con
n8n como pasarela. Ver `docs/RETOMAR.md` y `README.md` actuales.

## Archivos en este directorio

| Archivo | Descripción histórica |
|---------|----------------------|
| `AUTH_SERVER.md` | Servidor HTTP de vinculación QR/pairing code para Baileys |
| `DEMO_RUNBOOK.md` | Runbook de la demo Baileys (vinculación + smoke tests + contingencias) |

## ¿Por qué se conservan?

- **Trazabilidad técnica**: si en el futuro alguien pregunta "¿por qué no usamos Baileys?", la respuesta está documentada acá.
- **Referencia de patrones**: el diseño conversacional (`flowStep`, selección numérica, escape de flujo) sigue válido — solo cambió el transporte.
- **Histórico de decisiones**: parte del aprendizaje del proyecto.

**No usar estos documentos como guía operativa actual.**
