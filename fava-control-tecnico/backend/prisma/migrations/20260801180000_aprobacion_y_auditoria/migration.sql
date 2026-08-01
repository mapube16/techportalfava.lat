-- Fase 4 — flujo de aprobacion y auditoria.
--
-- Escrita a mano por lo de siempre: Prisma no genera ni preserva politicas de RLS, y
-- aqui una de ellas ES el requisito (AUD-01 pide append-only de verdad, no por costumbre).

-- ── 1. La nota, por (tecnico, semana, PROYECTO) ──
-- `weekly_notes` esta vacia (nunca se escribio), asi que project_id entra NOT NULL sin
-- backfill. Si algun dia hubiera filas, esto fallaria en vez de inventarles un proyecto.
ALTER TABLE "weekly_notes"
  ADD COLUMN "project_id"     UUID NOT NULL,
  ADD COLUMN "role_type_id"   UUID,
  ADD COLUMN "return_comment" TEXT;

ALTER TABLE "weekly_notes" ADD CONSTRAINT "weekly_notes_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_notes" ADD CONSTRAINT "weekly_notes_role_type_id_fkey"
  FOREIGN KEY ("role_type_id") REFERENCES "role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La clave natural de la derivacion: reenviar la semana NO duplica notas.
CREATE UNIQUE INDEX "weekly_notes_technician_id_week_start_project_id_key"
  ON "weekly_notes"("technician_id", "week_start", "project_id");
CREATE INDEX "weekly_notes_status_idx" ON "weekly_notes"("status");

-- Los cuatro estados y ninguno mas. Sin esto, un servicio con un typo escribe
-- 'aproved' y la nota desaparece de todas las bandejas sin que nada falle.
ALTER TABLE "weekly_notes" ADD CONSTRAINT "wn_status_valido"
  CHECK ("status" IN ('draft', 'submitted', 'approved', 'returned'));

-- NOTA-03 en el MOTOR: devolver sin comentario es imposible aunque el servicio se
-- equivoque. Es el requisito literal, y cuesta tres lineas.
ALTER TABLE "weekly_notes" ADD CONSTRAINT "wn_devuelta_con_comentario"
  CHECK ("status" <> 'returned' OR ("return_comment" IS NOT NULL AND btrim("return_comment") <> ''));

-- Mismo dominio cerrado para la jornada: su estado sigue al de su nota (BIT-05).
ALTER TABLE "daily_entries" ADD CONSTRAINT "de_status_valido"
  CHECK ("status" IN ('draft', 'submitted', 'approved', 'returned'));

-- ── 2. El registro de auditoria ──
CREATE TABLE "audit_log" (
    "id"              UUID NOT NULL,
    "actor_id"        UUID NOT NULL,
    "actor_name"      TEXT NOT NULL,
    "on_behalf_of_id" UUID,
    "entity"          TEXT NOT NULL,
    "entity_id"       UUID NOT NULL,
    "action"          TEXT NOT NULL,
    "before"          JSONB,
    "after"           JSONB,
    "reason"          TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- ── 3. RLS ──
GRANT SELECT, INSERT, UPDATE, DELETE ON "weekly_notes" TO fava_app;

-- El audit_log: dos capas para la misma garantia (privilegio y politica).
--
-- El REVOKE no es redundante y me costo un test en rojo descubrirlo: el
-- `ALTER DEFAULT PRIVILEGES` del bootstrap (Plan 01-01) ya le concede ALL a fava_app
-- sobre CUALQUIER tabla nueva, asi que un `GRANT SELECT, INSERT` no quita nada — solo
-- reafirma dos de los cuatro. Sin el REVOKE, `fava_app` conservaba UPDATE y DELETE, y
-- la unica defensa era la ausencia de politica RLS: eso hace que un UPDATE afecte 0
-- filas EN SILENCIO en vez de fallar. Correcto, pero mudo, y con una sola capa.
GRANT SELECT, INSERT ON "audit_log" TO fava_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM fava_app;

ALTER TABLE "weekly_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_notes" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wn_read  ON "weekly_notes";
DROP POLICY IF EXISTS wn_write ON "weekly_notes";

-- Un tecnico ve SOLO sus notas; un admin las ve todas. Mismo criterio que la bitacora
-- (AUTH-03): lo que se aisla son los REGISTROS, no los catalogos.
CREATE POLICY wn_read ON "weekly_notes" FOR SELECT TO fava_app
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR "technician_id"::text = current_setting('app.technician_id', TRUE)
  );

-- El tecnico crea y modifica las SUYAS (enviar); el admin, todas (aprobar/devolver).
CREATE POLICY wn_write ON "weekly_notes" FOR ALL TO fava_app
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR "technician_id"::text = current_setting('app.technician_id', TRUE)
  );

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS al_read   ON "audit_log";
DROP POLICY IF EXISTS al_append ON "audit_log";

-- AUD-02: el visor es del Super Admin, pero la politica solo distingue admin — el
-- reparto fino entre A y S lo hace @Roles('S') en el controlador, igual que en el resto
-- del esquema (no se anade una cuarta GUC solo para esto).
CREATE POLICY al_read ON "audit_log" FOR SELECT TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- APPEND-ONLY: hay politica de INSERT y NO hay de UPDATE ni de DELETE. El default-deny
-- de Postgres hace el resto, asi que reescribir la historia es imposible desde la app
-- incluso con un servicio comprometido. Cualquiera puede ESCRIBIR su rastro (un tecnico
-- que envia deja el suyo), pero solo un admin puede LEERLO.
CREATE POLICY al_append ON "audit_log" FOR INSERT TO fava_app
  WITH CHECK (TRUE);

-- Redundante desde que existe la unique (technician_id, week_start, project_id): su
-- indice ya sirve para filtrar por technician_id, que es el prefijo.
DROP INDEX IF EXISTS "weekly_notes_technician_id_idx";
