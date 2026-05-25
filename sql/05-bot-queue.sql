-- ═══════════════════════════════════════════════════════════════════════════
-- bot_queue — Cola de mensajes entrantes de WhatsApp.
--
-- n8n inserta aquí cada mensaje al recibir el webhook de Meta.
-- El worker (lib/worker.js) hace polling y consume los registros 'pendiente'.
--
-- Ciclo de vida de status:
--   pendiente → procesando → completado
--                          ↘ error
--
-- message_id UNIQUE garantiza idempotencia: si Meta reenvía el mismo evento
-- (retry de webhook), n8n falla silenciosamente (onError: continueRegularOutput)
-- y el mensaje no se procesa dos veces.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    TEXT        UNIQUE NOT NULL,            -- wamid de Meta — garantiza idempotencia
  phone_number  TEXT        NOT NULL,                   -- número del remitente (solo dígitos, ej: 595981234567)
  message_body  TEXT        NOT NULL,                   -- texto crudo del mensaje
  customer_name TEXT,                                   -- nombre del perfil WhatsApp (contacts[0].profile.name)
  status        TEXT        NOT NULL DEFAULT 'pendiente'
                            CHECK (status IN ('pendiente','procesando','completado','error')),
  error_message TEXT,                                   -- primeros 500 chars del error si status='error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- Índice parcial para el polling FIFO del worker (solo filas pendientes)
CREATE INDEX IF NOT EXISTS bot_queue_pending_idx
  ON bot_queue (status, created_at ASC)
  WHERE status = 'pendiente';

-- Índice para búsquedas por teléfono (debug, admin, historial)
CREATE INDEX IF NOT EXISTS bot_queue_phone_idx
  ON bot_queue (phone_number, created_at DESC);

-- ─── Seguridad (RLS) ─────────────────────────────────────────────────────────
-- Solo service_role accede: el worker Express usa SUPABASE_SERVICE_KEY,
-- n8n usa la service key configurada en su credencial "CGS".
-- El anon role queda bloqueado — esta tabla nunca es pública.
ALTER TABLE bot_queue ENABLE ROW LEVEL SECURITY;

-- ─── Comentarios ────────────────────────────────────────────────────────────
COMMENT ON TABLE  bot_queue                IS 'Cola FIFO de mensajes WhatsApp entrantes. n8n inserta, worker Express consume.';
COMMENT ON COLUMN bot_queue.message_id     IS 'wamid de Meta (ej: wamid.xxx...). UNIQUE — previene duplicados en reintentos.';
COMMENT ON COLUMN bot_queue.phone_number   IS 'Número del remitente en formato internacional sin + (ej: 595981234567).';
COMMENT ON COLUMN bot_queue.message_body   IS 'Texto crudo del mensaje recibido. Solo texto por ahora; imágenes/audio: backlog.';
COMMENT ON COLUMN bot_queue.customer_name  IS 'Nombre de perfil WhatsApp del remitente. Nullable: Meta no siempre lo incluye.';
COMMENT ON COLUMN bot_queue.status         IS 'pendiente | procesando | completado | error';
COMMENT ON COLUMN bot_queue.error_message  IS 'Primeros 500 chars del error si status=''error''. NULL en los demás estados.';

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — ejecutar si la tabla ya existe en Supabase sin customer_name
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE bot_queue ADD COLUMN IF NOT EXISTS customer_name TEXT;
-- COMMENT ON COLUMN bot_queue.customer_name IS 'Nombre de perfil WhatsApp. Nullable: Meta no siempre lo incluye.';
