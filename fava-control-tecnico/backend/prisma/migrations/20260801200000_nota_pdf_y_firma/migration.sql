-- Fase 5 — la Nota Semanal en PDF y la firma del cliente.
--
-- Escrita a mano por lo de siempre (Prisma no genera politicas) y porque aqui la
-- inmutabilidad de dos tablas ES el requisito: NOTA-06 dice que el PDF firmado se
-- congela, y eso solo se sostiene si el motor lo impide, no si el codigo se acuerda.

ALTER TABLE "weekly_notes"
  ADD COLUMN "version"             INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "signed_content_hash" TEXT;

-- ── El PDF congelado ──
CREATE TABLE "note_pdfs" (
    "id"         UUID NOT NULL,
    "note_id"    UUID NOT NULL,
    "version"    INTEGER NOT NULL,
    "bytes"      BYTEA NOT NULL,
    "sha256"     TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_pdfs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "note_pdfs_note_id_version_key" ON "note_pdfs"("note_id", "version");

ALTER TABLE "note_pdfs" ADD CONSTRAINT "note_pdfs_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "weekly_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── La firma y su expediente ──
CREATE TABLE "note_signatures" (
    "id"                   UUID NOT NULL,
    "note_id"              UUID NOT NULL,
    "version"              INTEGER NOT NULL,
    "kind"                 TEXT NOT NULL,
    "signer_name"          TEXT NOT NULL,
    "signer_document"      TEXT,
    "signer_role"          TEXT,
    "declaration_accepted" BOOLEAN NOT NULL,
    "image_png"            BYTEA NOT NULL,
    "pdf_sha256"           TEXT NOT NULL,
    "signed_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip"                   TEXT,
    "user_agent"           TEXT,

    CONSTRAINT "note_signatures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "note_signatures_note_id_version_kind_key"
  ON "note_signatures"("note_id", "version", "kind");

ALTER TABLE "note_signatures" ADD CONSTRAINT "note_signatures_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "weekly_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Solo las dos partes que firman el papel. Un tercer valor seria una firma que el PDF
-- no sabe donde estampar.
ALTER TABLE "note_signatures" ADD CONSTRAINT "ns_kind_valido"
  CHECK ("kind" IN ('technician', 'client'));

-- La declaracion de conformidad no es opcional: sin aceptarla, el trazo es un dibujo.
ALTER TABLE "note_signatures" ADD CONSTRAINT "ns_declaracion_aceptada"
  CHECK ("declaration_accepted" = TRUE);

-- ── RLS: las dos tablas son INMUTABLES ──
--
-- Mismo patron que audit_log, y con el REVOKE explicito por la misma razon que alli:
-- el ALTER DEFAULT PRIVILEGES del bootstrap ya concede ALL sobre toda tabla nueva, asi
-- que sin revocar, `fava_app` conservaria UPDATE y DELETE y la unica defensa seria la
-- ausencia de politica — correcta pero MUDA (0 filas afectadas, sin error).
GRANT SELECT, INSERT ON "note_pdfs", "note_signatures" TO fava_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "note_pdfs", "note_signatures" FROM fava_app;

ALTER TABLE "note_pdfs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "note_pdfs" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "note_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "note_signatures" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS np_read   ON "note_pdfs";
DROP POLICY IF EXISTS np_append ON "note_pdfs";
DROP POLICY IF EXISTS ns_read   ON "note_signatures";
DROP POLICY IF EXISTS ns_append ON "note_signatures";

-- Se ve el PDF de una nota si se puede ver la nota: un admin, todas; un tecnico, las
-- suyas. La condicion se delega a `weekly_notes`, que ya tiene la politica correcta,
-- en vez de duplicarla aqui y arriesgarse a que las dos se separen.
CREATE POLICY np_read ON "note_pdfs" FOR SELECT TO fava_app
  USING (EXISTS (SELECT 1 FROM "weekly_notes" n WHERE n."id" = "note_id"));
CREATE POLICY np_append ON "note_pdfs" FOR INSERT TO fava_app WITH CHECK (TRUE);

CREATE POLICY ns_read ON "note_signatures" FOR SELECT TO fava_app
  USING (EXISTS (SELECT 1 FROM "weekly_notes" n WHERE n."id" = "note_id"));
CREATE POLICY ns_append ON "note_signatures" FOR INSERT TO fava_app WITH CHECK (TRUE);
