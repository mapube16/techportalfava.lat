-- GASTO-01 — el gasto se registra el DIA que ocurre, con su comprobante.
--
-- Ivan Cortes, en la capacitacion del 2026-08-31: «¿no seria mas util tenerlo en el
-- diario? a veces uno efectuo el gasto de una vez, tiene la factura». Andrea acepto en
-- el momento: «vale, lo hacemos diario, yo tambien tomo nota».
--
-- Hasta ahora los gastos solo se podian escribir al ENVIAR la nota: el viernes, de
-- memoria, con el ticket ya perdido. Vivian como JSON en `weekly_notes.gastos_tecnico`.
--
-- EL JSON NO DESAPARECE: sigue guardando lo ya escrito (496 notas historicas) y lo que
-- se anada al enviar. El PDF suma los dos origenes. Migrar notas firmadas para ganar
-- uniformidad seria mover datos que alguien ya firmo.
CREATE TABLE "daily_expenses" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "daily_entry_id" UUID NOT NULL,
  "descripcion"    TEXT NOT NULL,
  "valor"          TEXT NOT NULL,
  -- El comprobante es opcional: se anota el gasto ahora y se sube la foto despues.
  "mime_type"      TEXT,
  "bytes"          BYTEA,
  "size_bytes"     INTEGER,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dexp_entry_fk" FOREIGN KEY ("daily_entry_id")
    REFERENCES "daily_entries"("id") ON DELETE CASCADE
);

CREATE INDEX "daily_expenses_daily_entry_id_idx" ON "daily_expenses" ("daily_entry_id");

-- Coherencia del comprobante: o estan las tres columnas o ninguna. Media foto guardada
-- —bytes sin tipo— es una fila que el servidor no sabe devolver.
ALTER TABLE "daily_expenses" ADD CONSTRAINT "dexp_comprobante_completo" CHECK (
  ("mime_type" IS NULL AND "bytes" IS NULL AND "size_bytes" IS NULL)
  OR ("mime_type" IS NOT NULL AND "bytes" IS NOT NULL AND "size_bytes" IS NOT NULL)
);

-- RLS heredada de la jornada, igual que `daily_entry_orders`: la fila es del dueño de
-- SU jornada. Sin esto la tabla nace abierta y un tecnico leeria los gastos de otro —
-- justo lo que la politica `de_self` impide en `daily_entries`. Se pregunta por la
-- jornada padre en vez de repetir el criterio: una sola definicion de «mio».
ALTER TABLE "daily_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_expenses" FORCE ROW LEVEL SECURITY;

CREATE POLICY dexp_self ON "daily_expenses"
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM "daily_entries" de
       WHERE de."id" = "daily_expenses"."daily_entry_id"
         AND de."technician_id" = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM "daily_entries" de
       WHERE de."id" = "daily_expenses"."daily_entry_id"
         AND de."technician_id" = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
    )
  );

-- DELETE incluido: borrar un gasto mal escrito el mismo dia es corregir, no falsear
-- historia. El bloqueo de lo ya enviado lo pone el servicio (BIT-05), como en la jornada.
GRANT SELECT, INSERT, UPDATE, DELETE ON "daily_expenses" TO fava_app;
