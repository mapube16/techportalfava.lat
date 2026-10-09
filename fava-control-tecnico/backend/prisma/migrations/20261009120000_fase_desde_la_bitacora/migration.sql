-- La fase EN CURSO la declara el TECNICO desde su bitacora, no solo Andrea.
--
-- `proj_write` (rls_maestros) deja escribir en `projects` solo con is_admin = 'on'. Una
-- jornada del tecnico corre con 'off', asi que el `project.update` que hace
-- daily-entries.service.ts al recibir una fase quedaria en CERO filas, en silencio: el
-- dia se guardaria con collaudo y el proyecto seguiria en montaje.
--
-- RLS es por FILA, no por columna: una politica que deje al tecnico hacer UPDATE deja
-- cambiar cualquier columna. El trigger cierra eso: con is_admin = 'off' la unica
-- columna que puede cambiar es `current_phase` (y `updated_at`, que Prisma escribe
-- solo). Compara la fila ENTERA en vez de listar columnas: una columna nueva queda
-- protegida sin que nadie se acuerde de anadirla aqui.

DROP POLICY IF EXISTS proj_fase_tecnico ON "projects";
CREATE POLICY proj_fase_tecnico ON "projects" FOR UPDATE TO fava_app
  USING (NULLIF(current_setting('app.technician_id', TRUE), '') IS NOT NULL);

CREATE OR REPLACE FUNCTION proj_solo_fase_si_tecnico() RETURNS trigger AS $$
DECLARE
  antes   "projects" := OLD;
  despues "projects" := NEW;
BEGIN
  IF current_setting('app.is_admin', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;
  despues."current_phase" := antes."current_phase";
  despues."updated_at"    := antes."updated_at";
  IF despues IS DISTINCT FROM antes THEN
    RAISE EXCEPTION 'SOLO_FASE_DESDE_BITACORA' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS proj_solo_fase_si_tecnico ON "projects";
CREATE TRIGGER proj_solo_fase_si_tecnico
  BEFORE UPDATE ON "projects"
  FOR EACH ROW EXECUTE FUNCTION proj_solo_fase_si_tecnico();
