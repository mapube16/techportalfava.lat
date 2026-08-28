-- Fase 9 — el buzon de salida de los avisos por correo.
--
-- Escrita a mano por lo de siempre: Prisma no genera ni preserva politicas de RLS.

-- ── 1. El idioma del destinatario ──
-- Con DEFAULT 'es' el backfill de las filas existentes lo hace el propio ALTER: nadie
-- se queda sin idioma y no hace falta un UPDATE aparte.
ALTER TABLE "users" ADD COLUMN "lang" TEXT NOT NULL DEFAULT 'es';

-- Los tres idiomas que habla la interfaz y ninguno mas. Sin esto, un `lang` con un typo
-- ('ita', 'pt-BR') haria que el render cayera a undefined y saliera un correo en blanco.
ALTER TABLE "users" ADD CONSTRAINT "users_lang_valido"
  CHECK ("lang" IN ('es', 'it', 'pt'));

-- ── 2. El buzon de salida ──
CREATE TABLE "notifications" (
    "id"          UUID NOT NULL,
    "dedupe_key"  TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "to_email"    TEXT NOT NULL,
    "to_user_id"  UUID,
    "lang"        TEXT NOT NULL,
    "subject"     TEXT NOT NULL,
    "body_text"   TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "attempts"    INTEGER NOT NULL DEFAULT 0,
    "claimed_at"  TIMESTAMP(3),
    "last_error"  TEXT,
    "entity"      TEXT,
    "entity_id"   UUID,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at"     TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- LA garantia de «no mandar dos veces». El ON CONFLICT DO NOTHING de
-- `createMany({ skipDuplicates: true })` cuelga de esta unique: sin ella, el cron que
-- evalua la misma ventana 12 veces por hora encolaria 12 correos identicos.
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");
CREATE INDEX "notifications_entity_entity_id_idx"  ON "notifications"("entity", "entity_id");

-- Los cuatro estados y ninguno mas, mismo criterio que `wn_status_valido`: un typo en
-- un servicio dejaria la fila fuera del drenador para siempre y sin que nada falle.
ALTER TABLE "notifications" ADD CONSTRAINT "n_status_valido"
  CHECK ("status" IN ('pending', 'sending', 'sent', 'failed'));

ALTER TABLE "notifications" ADD CONSTRAINT "n_lang_valido"
  CHECK ("lang" IN ('es', 'it', 'pt'));

-- ── 3. RLS ──
--
-- El REVOKE no es redundante, por el motivo documentado en 20260801180000: el
-- `ALTER DEFAULT PRIVILEGES` del bootstrap ya le concede ALL a fava_app sobre cualquier
-- tabla nueva, asi que el GRANT de arriba no quita nada.
--
-- Aqui SI hay UPDATE (a diferencia de audit_log): el drenador tiene que marcar la fila
-- como enviada. Lo que no hay es DELETE — el historico de lo que se mando no se borra.
GRANT SELECT, INSERT, UPDATE ON "notifications" TO fava_app;
REVOKE DELETE, TRUNCATE ON "notifications" FROM fava_app;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS n_read   ON "notifications";
DROP POLICY IF EXISTS n_append ON "notifications";
DROP POLICY IF EXISTS n_mark   ON "notifications";

-- Leer: solo admin. Un tecnico no lista su bandeja de avisos — y el cron se declara
-- admin fijando `app.is_admin = 'on'` a mano, que es justo lo que le da acceso aqui.
CREATE POLICY n_read ON "notifications" FOR SELECT TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- Escribir: cualquiera, igual que `al_append`. No es dejadez: el aviso de «nota
-- aprobada» lo encola la transaccion de un ADMIN, pero el dia que se encole algo desde
-- una accion del tecnico (firmar), una politica que exigiera admin mataria el envio con
-- un 500. Cualquiera escribe, solo el admin lee.
CREATE POLICY n_append ON "notifications" FOR INSERT TO fava_app
  WITH CHECK (TRUE);

-- Marcar enviado/fallido: solo el drenador, que corre como admin.
CREATE POLICY n_mark ON "notifications" FOR UPDATE TO fava_app
  USING      (current_setting('app.is_admin', TRUE) = 'on')
  WITH CHECK (current_setting('app.is_admin', TRUE) = 'on');

-- Sin politica de DELETE a proposito: el default-deny de Postgres hace el resto.
