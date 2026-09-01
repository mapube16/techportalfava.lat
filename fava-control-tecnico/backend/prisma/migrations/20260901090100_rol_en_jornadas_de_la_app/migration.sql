-- El rol que faltaba en las jornadas escritas DESDE LA APP.
--
-- `role_type_id` existe en daily_entries desde el principio (el historico del Excel lo
-- trae, y 5 de los 14 tecnicos tienen mas de un cargo), pero la captura nunca lo
-- escribia: toda jornada nueva entraba con NULL.
--
-- No era cosmetico. La consulta de vendido/ejecutado (KPI-01/KPI-08) hace
-- INNER JOIN role_types —las filas de la matriz salen del catalogo de roles— asi que
-- esas jornadas quedaban FUERA del ejecutado sin que nada fallara: el tecnico registraba
-- su dia, la app se lo mostraba, y el numero con el que se negocia seguia sin moverse.
-- Justo el fallo silencioso que la reunion del 31-ago no habria detectado.
--
-- El servicio ya lo sella al crear (daily-entries.service.ts). Esto arregla las que ya
-- estaban escritas, con el cargo ACTUAL de la ficha: es la mejor aproximacion
-- disponible y son dias de los ultimos cuatro dias, no historia antigua.
UPDATE "daily_entries" de
   SET "role_type_id" = t."role_type_id"
  FROM "technicians" t
 WHERE t."id" = de."technician_id"
   AND de."role_type_id" IS NULL
   AND de."source_sheet" IS NULL;
