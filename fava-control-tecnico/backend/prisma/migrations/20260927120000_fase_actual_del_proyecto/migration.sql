-- La FASE EN CURSO del proyecto: la que heredan las jornadas nuevas.
--
-- La captura nunca declaro la fase (el cajon y la bitacora mandan `phase: null`), asi
-- que ninguna jornada de la app entraba en la tabla «Por fase» de los KPIs: todo lo que
-- se veia ejecutado era el historico del Excel, fasado por proyecto en migrate-fases.ts.
-- Es la misma regla — la fase se decide POR PROYECTO — ahora escrita en el proyecto:
-- Andrea la cambia a COLLAUDO cuando arranca el collaudo y los dias siguientes la heredan.
--
-- DEFAULT MONTAJE: es lo que se esta ejecutando hoy en todos los proyectos (ver el
-- reporte de migrate-fases). Sin default el ALTER fallaria sobre las filas existentes.
ALTER TABLE "projects" ADD COLUMN "current_phase" "phase" NOT NULL DEFAULT 'MONTAJE';

-- Y los dias que la APP ya registro sin fase (la captura nunca la pregunto) pasan a
-- MONTAJE: es lo que se esta ejecutando hoy en todos los proyectos — la misma regla,
-- POR PROYECTO, con la que migrate-fases.ts faso el historico del Excel. Decision del
-- usuario (2026-09-27). Solo los dias CON proyecto: un libre no tiene fase. Los del
-- Excel no se tocan: los que migrate-fases dejo sin fase quedaron asi a proposito.
UPDATE "daily_entries"
   SET "phase" = 'MONTAJE'
 WHERE "phase" IS NULL
   AND "project_id" IS NOT NULL
   AND "source_sheet" IS NULL;
