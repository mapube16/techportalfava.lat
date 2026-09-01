-- La commessa es unica DENTRO DEL PROYECTO, no en toda la casa matriz.
--
-- En la capacitacion del 2026-08-31 Andrea no pudo crear el proyecto de AJE: su
-- commessa 350200 ya la tenia VIERCI y el unique global la rechazaba. No es un dato
-- sucio — los dos ultimos digitos son el sector, asi que la misma raiz reaparece en
-- proyectos distintos («para nosotros allá las comesas tienen otro significado»).
--
-- Dentro de un proyecto SI identifica la maquina: dos ordenes del mismo proyecto con la
-- misma commessa serian la misma maquina duplicada. Los NULL no chocan entre si porque
-- en Postgres NULL nunca es igual a NULL, y todo el historico del Excel llega sin ella.
DROP INDEX IF EXISTS "orders_commessa_key";
CREATE UNIQUE INDEX "orders_project_id_commessa_key" ON "orders" ("project_id", "commessa");
