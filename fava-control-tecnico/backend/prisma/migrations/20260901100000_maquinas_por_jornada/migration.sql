-- BIT-10 — varias maquinas en la MISMA jornada.
--
-- Camilo Cruz, en la capacitacion del 2026-08-31: «este caso es excepcional, ya que
-- tenemos tres maquinas al tiempo, ¿como hago la descripcion?». Hasta ahora la jornada
-- apuntaba a UNA orden, asi que trabajar tres lineas a la vez obligaba a elegir una y
-- contar las otras en el texto libre — que es justo el dato que se pierde y que despues
-- Andrea reparte a mano (los 151 dias de Camilo en 120 + 31).
--
-- NO sustituye a `daily_entries.order_id`: esa sigue siendo la maquina PRINCIPAL y todo
-- lo que ya lee una orden por jornada (el PDF, la matriz vendido/ejecutado) sigue
-- funcionando sin tocarse. Esta tabla anade las demas.
--
-- Sin columna de horas por maquina a proposito: en la reunion se acordo que el reparto
-- sigue siendo manual por ahora. Una columna que nadie rellena miente mas que su ausencia.
CREATE TABLE "daily_entry_orders" (
  "daily_entry_id" UUID NOT NULL,
  "order_id"       UUID NOT NULL,
  CONSTRAINT "daily_entry_orders_pkey" PRIMARY KEY ("daily_entry_id", "order_id"),
  CONSTRAINT "deo_entry_fk" FOREIGN KEY ("daily_entry_id")
    REFERENCES "daily_entries"("id") ON DELETE CASCADE,
  CONSTRAINT "deo_order_fk" FOREIGN KEY ("order_id")
    REFERENCES "orders"("id") ON DELETE RESTRICT
);

CREATE INDEX "daily_entry_orders_order_id_idx" ON "daily_entry_orders" ("order_id");

-- RLS: la fila hereda el dueño de SU jornada. Sin esto la tabla nace abierta y un
-- tecnico podria leer con que maquinas trabajo otro — justo lo que `de_self` impide en
-- `daily_entries`. La politica pregunta por la jornada padre en vez de repetir el
-- criterio: una sola definicion de «mio» y no dos que puedan separarse.
ALTER TABLE "daily_entry_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_entry_orders" FORCE ROW LEVEL SECURITY;

CREATE POLICY deo_self ON "daily_entry_orders"
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM "daily_entries" de
       WHERE de."id" = "daily_entry_orders"."daily_entry_id"
         AND de."technician_id" = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.is_admin', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM "daily_entries" de
       WHERE de."id" = "daily_entry_orders"."daily_entry_id"
         AND de."technician_id" = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
    )
  );

-- El tecnico escribe y reescribe la seleccion de su dia; DELETE incluido porque
-- desmarcar una maquina es quitar la fila, no desactivarla (no es un maestro).
GRANT SELECT, INSERT, UPDATE, DELETE ON "daily_entry_orders" TO fava_app;
