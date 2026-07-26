-- RLS de los maestros y catalogos de la Fase 2: LEER todos, ESCRIBIR solo admin.
--
-- Escrita a mano y versionada: Prisma no genera ni preserva politicas. Idempotente
-- (DROP POLICY IF EXISTS antes de cada CREATE) porque `migrate dev` la corre tambien
-- contra la shadow database y porque re-aplicar el .sql tiene que ser inocuo.
--
-- Contexto = las MISMAS 3 GUCs que fija RlsInterceptor con set_config(..., TRUE):
--   app.user_id, app.technician_id, app.is_admin ('on' | 'off').
-- NO se anade una cuarta (app.is_super): tocaria rls.interceptor.ts, que es un archivo
-- compartido, para una garantia que @Roles('S') ya da en la capa de servicio.
--
-- Por que la lectura es abierta: en la Fase 3 el tecnico necesita leer proyectos,
-- maquinas, roles y conceptos para registrar su dia. El aislamiento que exige AUTH-03
-- es sobre REGISTROS (daily_entries / weekly_notes), no sobre catalogos. Cerrar la
-- lectura aqui obligaria a reabrirla en la fase siguiente.
--
-- Por que escritura por politica y no solo por @Roles: misma defensa en profundidad de
-- AUTH-03. Cuesta seis lineas por tabla, se escribe una vez, y hace que un controlador
-- mal decorado en cualquier fase futura NO pueda escribir maestros.
--
-- Dos detalles que no son estilo:
--   * Sin la politica de SELECT la tabla no da error: da CERO filas, la API responde
--     200 [], los logs quedan limpios y el bug parece del frontend. Por eso va primero.
--   * FOR ALL reutiliza USING como WITH CHECK, asi que dos politicas cubren SELECT,
--     INSERT, UPDATE y DELETE (las permisivas se combinan con OR: TRUE OR is_admin).

-- Privilegios de tabla. El ALTER DEFAULT PRIVILEGES del bootstrap (Plan 01-01) ya los
-- da... siempre que las migraciones las corra EL MISMO rol que corrio el bootstrap.
-- Si en Railway no coincide, las 8 tablas nacen sin permisos para fava_app y la app
-- responde «permission denied for table projects» justo despues de un migrate deploy
-- exitoso. Estas 8 lineas son idempotentes y cierran ese agujero desde la migracion.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "concepts", "role_types", "currencies", "machine_models",
  "technicians", "projects", "project_machines", "project_sold_days"
  TO fava_app;

-- ── role_types ──
ALTER TABLE "role_types" ENABLE ROW LEVEL SECURITY;
-- FORCE: ni el dueno de la tabla se salta la politica (los superusuarios si, siempre).
ALTER TABLE "role_types" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rt_read ON "role_types";
DROP POLICY IF EXISTS rt_write ON "role_types";

CREATE POLICY rt_read ON "role_types" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY rt_write ON "role_types" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── currencies ──
ALTER TABLE "currencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "currencies" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cur_read ON "currencies";
DROP POLICY IF EXISTS cur_write ON "currencies";

CREATE POLICY cur_read ON "currencies" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY cur_write ON "currencies" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── machine_models ──
ALTER TABLE "machine_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "machine_models" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mm_read ON "machine_models";
DROP POLICY IF EXISTS mm_write ON "machine_models";

CREATE POLICY mm_read ON "machine_models" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY mm_write ON "machine_models" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── technicians ──
-- Lectura abierta: la bitacora y la Nota muestran el nombre del tecnico, y el selector
-- de la pantalla de captura lo necesita. Lo que se aisla son sus REGISTROS.
ALTER TABLE "technicians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "technicians" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tec_read ON "technicians";
DROP POLICY IF EXISTS tec_write ON "technicians";

CREATE POLICY tec_read ON "technicians" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY tec_write ON "technicians" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── projects ──
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proj_read ON "projects";
DROP POLICY IF EXISTS proj_write ON "projects";

CREATE POLICY proj_read ON "projects" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY proj_write ON "projects" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── project_machines ──
ALTER TABLE "project_machines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_machines" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_read ON "project_machines";
DROP POLICY IF EXISTS pm_write ON "project_machines";

CREATE POLICY pm_read ON "project_machines" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY pm_write ON "project_machines" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── project_sold_days ──
ALTER TABLE "project_sold_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_sold_days" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psd_read ON "project_sold_days";
DROP POLICY IF EXISTS psd_write ON "project_sold_days";

CREATE POLICY psd_read ON "project_sold_days" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY psd_write ON "project_sold_days" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── concepts: la excepcion. El catalogo NO puede crecer ni encoger, ni siquiera
--    desde SQL suelto y ni siquiera para un admin ──
ALTER TABLE "concepts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "concepts" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conc_read ON "concepts";
DROP POLICY IF EXISTS conc_label ON "concepts";

CREATE POLICY conc_read ON "concepts" FOR SELECT TO fava_app USING (TRUE);
-- Solo UPDATE, y solo para admin. Al NO existir politica de INSERT ni de DELETE, el
-- default-deny de Postgres las bloquea: los 8 codigos son fijos POR MOTOR, no por
-- convencion. (El WITH CHECK explicito aqui si hace falta: en FOR UPDATE, USING filtra
-- la fila vieja y WITH CHECK valida la nueva.)
CREATE POLICY conc_label ON "concepts" FOR UPDATE TO fava_app
  USING      (current_setting('app.is_admin', TRUE) = 'on')
  WITH CHECK (current_setting('app.is_admin', TRUE) = 'on');

-- ── Siembra ESTRUCTURAL de los 8 conceptos ──
-- Van en la migracion y no en seed.ts porque son estructura, no datos de ejemplo: si un
-- deploy olvida `db:seed`, un catalogo vacio rompe la captura de la Fase 3 y la pantalla
-- Config. ON CONFLICT DO NOTHING = idempotente en shadow DB, CI y re-deploy.
-- Textos ES/IT tomados de frontend/src/i18n.ts (CONCEPTS), ya revisados.
INSERT INTO "concepts" ("code", "label_es", "label_it", "sort_order", "updated_at") VALUES
  ('DC',   'Día completo',        'Giornata intera',      1, now()),
  ('MD',   'Medio día',           'Mezza giornata',       2, now()),
  ('DFD',  'Festivo / dominical', 'Festivo / domenicale', 3, now()),
  ('DVSF', 'Viaje salida',        'Viaggio andata',       4, now()),
  ('DVRC', 'Viaje retorno',       'Viaggio ritorno',      5, now()),
  ('LR',   'Libre remunerado',    'Permesso retribuito',  6, now()),
  ('NR',   'No remunerado',       'Non retribuito',       7, now()),
  ('IL',   'Incapacidad',         'Malattia',             8, now())
ON CONFLICT ("code") DO NOTHING;
