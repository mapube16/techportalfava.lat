-- NOTA-08b — el comprobante de un gasto: la foto del ticket.
--
-- Escrita a mano por lo de siempre: Prisma no genera ni preserva politicas de RLS.

CREATE TABLE "expense_receipts" (
    "id"             UUID NOT NULL,
    "note_id"        UUID NOT NULL,
    "label"          TEXT NOT NULL,
    "mime_type"      TEXT NOT NULL,
    "bytes"          BYTEA NOT NULL,
    "size_bytes"     INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_receipts_note_id_idx" ON "expense_receipts"("note_id");

ALTER TABLE "expense_receipts" ADD CONSTRAINT "expense_receipts_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "weekly_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El tope tambien en el MOTOR y no solo en el servicio: una foto de movil sin
-- redimensionar son 3-8 MB, el volumen tiene 5 GB, y un cliente que se salte el
-- redimensionado llenaria el disco sin que nada se queje. 2 MB deja margen de sobra
-- sobre los ~300 KB que ocupa un ticket escaneado y legible.
ALTER TABLE "expense_receipts" ADD CONSTRAINT "er_tamano_razonable"
  CHECK ("size_bytes" > 0 AND "size_bytes" <= 2097152);

-- Lista cerrada: lo que el visor de la app sabe pintar y nada mas. Un SVG seria un
-- vector de scripting; un zip, un adjunto opaco.
ALTER TABLE "expense_receipts" ADD CONSTRAINT "er_tipo_admitido"
  CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'application/pdf'));

-- ── RLS ──
--
-- Mismo reparto que la nota de la que cuelga: el tecnico ve y sube los suyos, el admin
-- los ve todos. La condicion se resuelve contra `weekly_notes` porque el recibo no
-- lleva technician_id propio: duplicarlo seria una segunda verdad sobre de quien es.
GRANT SELECT, INSERT, DELETE ON "expense_receipts" TO fava_app;
REVOKE UPDATE ON "expense_receipts" FROM fava_app;

ALTER TABLE "expense_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_receipts" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS er_self ON "expense_receipts";

-- Sin politica de UPDATE y con el privilegio revocado: un comprobante no se corrige,
-- se borra y se sube otro. Asi los bytes que Andrea aprobo son los que se subieron.
CREATE POLICY er_self ON "expense_receipts" FOR ALL TO fava_app
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM "weekly_notes" w
       WHERE w.id = "expense_receipts"."note_id"
         AND w."technician_id"::text = current_setting('app.technician_id', TRUE)
    )
  );
