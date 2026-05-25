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
-- (retry de webhook), n8n solo puede insertar una fila por mensaje.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    TEXT        UNIQUE NOT NULL,            -- wa_message_id de Meta (idempotencia)
  phone_number  TEXT        NOT NULL,                   -- número del vendedor (solo dígitos)
  message_body  TEXT        NOT NULL,                   -- texto del mensaje recibido
  status        TEXT        NOT NULL DEFAULT 'pendiente'
                            CHECK (status IN ('pendiente','procesando','completado','error')),
  error_message TEXT,                                   -- detalle del error si status='error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para el query de polling: status + created_at (orden FIFO)
CREATE INDEX IF NOT EXISTS bot_queue_pending_idx
  ON bot_queue (status, created_at ASC)
  WHERE status = 'pendiente';

-- Índice para búsquedas por teléfono (debug / admin)
CREATE INDEX IF NOT EXISTS bot_queue_phone_idx
  ON bot_queue (phone_number, created_at DESC);

-- ─── Seguridad ───────────────────────────────────────────────────────────────
-- Solo el service role puede leer/escribir esta tabla.
-- El anon role NO tiene acceso (n8n usa la service key de Supabase).
ALTER TABLE bot_queue ENABLE ROW LEVEL SECURITY;

-- Política: solo service_role (backend + n8n con service key) accede.
-- Con RLS habilitado y sin políticas para anon/authenticated, esos roles quedan bloqueados.
-- El service_role bypasea RLS por diseño en Supabase — no necesita política explícita.

-- ─── Comentarios ────────────────────────────────────────────────────────────
COMMENT ON TABLE  bot_queue                IS 'Cola FIFO de mensajes WhatsApp entrantes. Consumida por el worker de Express.';
COMMENT ON COLUMN bot_queue.message_id     IS 'ID único del mensaje en Meta (wamid.xxx...). Garantiza idempotencia en reintentos.';
COMMENT ON COLUMN bot_queue.phone_number   IS 'Número del remitente en formato internacional sin + (ej: 595981234567).';
COMMENT ON COLUMN bot_queue.message_body   IS 'Texto crudo del mensaje recibido de WhatsApp.';
COMMENT ON COLUMN bot_queue.status         IS 'pendiente | procesando | completado | error';
COMMENT ON COLUMN bot_queue.error_message  IS 'Primeros 500 caracteres del error si status=''error''.';
