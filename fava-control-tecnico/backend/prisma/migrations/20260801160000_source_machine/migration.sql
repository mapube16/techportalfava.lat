-- El texto crudo de la columna «Maquina» del Excel, para la migracion del historico.
-- No cabe en `machine_model_id` (hay celdas con DOS y TRES maquinas, y con la commessa
-- embebida en el texto) ni en `order_id` (el Excel no dice a que maquina contratada
-- fue el dia: ese es justo el vacio que la app viene a cerrar). Se guarda literal para
-- poder atribuirlas mas adelante sin volver al .xls.
ALTER TABLE "daily_entries" ADD COLUMN "source_machine" TEXT;
