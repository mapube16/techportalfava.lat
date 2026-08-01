-- Fase 5 — gastos del técnico y anticipos del cliente en la Nota.
--
-- NOTA-08: informativos, sin flujo de reembolso. Por eso son dos columnas JSON en la
-- propia nota y no una tabla con su RLS: se editan libremente hasta firmar y nadie los
-- consulta sueltos, así que una tabla propia sería ceremonia sin garantía nueva que
-- ganar (a diferencia de note_pdfs/note_signatures, que SÍ necesitan inmutabilidad).
--
-- Sin GRANT nuevo: weekly_notes ya tiene SELECT/INSERT/UPDATE/DELETE para fava_app
-- desde 20260801180000, y las políticas wn_read/wn_write no distinguen columnas.

ALTER TABLE "weekly_notes"
  ADD COLUMN "gastos_tecnico"    JSONB,
  ADD COLUMN "anticipos_cliente" JSONB;
