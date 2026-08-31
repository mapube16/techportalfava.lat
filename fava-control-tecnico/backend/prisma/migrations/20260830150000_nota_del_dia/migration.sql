-- BIT-08 — la columna NOTA del papel, por fin escribible.
--
-- La Nota impresa siempre tuvo una columna NOTA por dia, y el generador la rellenaba
-- repitiendo el numero de contrato en las siete filas porque no habia ningun dato que
-- poner. Andrea la usa para el horario del dia («HORARIO 7 AM - 5 PM») o para avisos
-- puntuales, y no tenia donde escribirlos (peticion del 2026-08-30).
--
-- 120 caracteres: es UNA celda de la fila del PDF, no una segunda descripcion.
ALTER TABLE "daily_entries" ADD COLUMN "day_note" VARCHAR(120);

-- Sin GRANT ni politica nuevos: la columna hereda los permisos de la tabla y las
-- politicas de daily_entries filtran por fila, no por columna.
