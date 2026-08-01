-- Fase 2.1 — la ORDEN pasa a ser la dueña del contrato.
--
-- `migrate diff` proponia DROP TABLE de project_machines y project_sold_days sin mover
-- una fila, y las tablas nuevas nacian sin RLS (Prisma no genera ni preserva politicas).
-- Esta migracion esta escrita a mano por las dos razones.
--
-- Por que el cambio: JAV Marata tiene TRES maquinas contratadas, cada una con su OA, su
-- commessa y su importe (182.500 / 130.000 / 182.500), y a nivel de proyecto no hay ni
-- OA ni valor. Ademas dos de ellas son el mismo modelo `PL 6000 KG` y solo se distinguen
-- por la commessa, que es justo lo que `project_machines` (PK proyecto+modelo) no podia
-- representar. Ver .planning/MODELO-VERIFICADO.md §3.

-- ── 1. La orden ──
CREATE TABLE "orders" (
    "id"               UUID NOT NULL,
    "project_id"       UUID NOT NULL,
    "label"            TEXT NOT NULL,
    "machine_model_id" UUID,
    "commessa"         TEXT,
    "commessa_short"   TEXT,
    "oa_number"        TEXT,
    "contract_value"   DECIMAL(14,2),
    "currency_code"    TEXT,
    "is_active"        BOOLEAN NOT NULL DEFAULT true,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_commessa_key" ON "orders"("commessa");
CREATE INDEX "orders_project_id_idx" ON "orders"("project_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_machine_model_id_fkey"
  FOREIGN KEY ("machine_model_id") REFERENCES "machine_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_currency_code_fkey"
  FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. Traspaso de project_machines -> orders ──
-- Una orden por maquina seleccionada. Los tres campos comerciales que estaban en el
-- proyecto se COPIAN a todas sus ordenes: no se puede saber a cual pertenecian, y esa
-- ambiguedad es precisamente el bug que esta migracion cierra. Queda visible en la UI
-- para que un admin lo reparta bien, en vez de perderse.
INSERT INTO "orders" (
  "id", "project_id", "label", "machine_model_id",
  "oa_number", "contract_value", "currency_code", "updated_at"
)
SELECT gen_random_uuid(), pm."project_id", mm."code", pm."machine_model_id",
       p."oa_number", p."contract_value", p."currency_code", now()
  FROM "project_machines" pm
  JOIN "machine_models" mm ON mm."id" = pm."machine_model_id"
  JOIN "projects"       p  ON p."id"  = pm."project_id";

-- Proyectos SIN maquinas que si tenian datos comerciales: una orden marcador, para que
-- el importe no desaparezca en silencio. La etiqueta dice de donde salio.
INSERT INTO "orders" ("id", "project_id", "label", "oa_number", "contract_value", "currency_code", "updated_at")
SELECT gen_random_uuid(), p."id", 'Sin máquina asignada', p."oa_number", p."contract_value", p."currency_code", now()
  FROM "projects" p
 WHERE NOT EXISTS (SELECT 1 FROM "project_machines" pm WHERE pm."project_id" = p."id")
   AND (p."oa_number" IS NOT NULL OR p."contract_value" IS NOT NULL);

-- ── 3. Los dias vendidos cuelgan de la orden ──
CREATE TABLE "order_sold_days" (
    "id"            UUID NOT NULL,
    "order_id"      UUID NOT NULL,
    "role_type_id"  UUID NOT NULL,
    "phase"         "phase" NOT NULL,
    "ordinal"       INTEGER NOT NULL DEFAULT 0,
    "line_label"    TEXT,
    "sold_days"     INTEGER NOT NULL,
    "updated_by_id" UUID,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_sold_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_sold_days_order_id_role_type_id_phase_ordinal_key"
  ON "order_sold_days"("order_id", "role_type_id", "phase", "ordinal");

ALTER TABLE "order_sold_days" ADD CONSTRAINT "order_sold_days_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_sold_days" ADD CONSTRAINT "order_sold_days_role_type_id_fkey"
  FOREIGN KEY ("role_type_id") REFERENCES "role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Traspaso. `DISTINCT ON (project_id)` toma UNA orden por proyecto: lo vendido estaba
-- guardado por proyecto y no hay dato que diga a que maquina correspondia. Se ancla a la
-- primera orden en vez de duplicarlo en todas, que inflaria el vendido; el admin lo
-- reparte desde la pantalla. Con un proyecto de una sola maquina (el caso de todo lo
-- cargado hasta hoy) el traspaso es exacto.
INSERT INTO "order_sold_days" ("id", "order_id", "role_type_id", "phase", "sold_days", "updated_by_id", "updated_at")
SELECT gen_random_uuid(), o."id", psd."role_type_id", psd."phase", psd."sold_days",
       psd."updated_by_id", psd."updated_at"
  FROM "project_sold_days" psd
  JOIN (SELECT DISTINCT ON ("project_id") "project_id", "id"
          FROM "orders" ORDER BY "project_id", "created_at", "id") o
    ON o."project_id" = psd."project_id";

-- ── 4. La jornada dice a que orden fue ──
ALTER TABLE "daily_entries"
  ADD COLUMN "order_id"   UUID,
  ADD COLUMN "in_factory" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill solo donde NO hay ambiguedad: proyecto con exactamente una orden. Si tiene
-- varias, la jornada se queda con order_id NULL y cae en el bucket «sin orden» de la
-- agregacion. Adivinar aqui seria inventar el reparto que la app existe para eliminar.
UPDATE "daily_entries" de
   SET "order_id" = u."id"
  FROM (SELECT "project_id", MIN("id"::text)::uuid AS "id"
          FROM "orders" GROUP BY "project_id" HAVING COUNT(*) = 1) u
 WHERE de."project_id" = u."project_id"
   AND de."order_id" IS NULL;

-- ── 5. Fuera lo viejo ──
DROP TABLE "project_sold_days";
DROP TABLE "project_machines";

ALTER TABLE "projects"
  DROP CONSTRAINT "projects_currency_code_fkey",
  DROP COLUMN "oa_number",
  DROP COLUMN "contract_value",
  DROP COLUMN "currency_code";

-- ── 6. RLS de las tablas nuevas ──
-- Mismo patron que 20260726123024_rls_maestros: leer todos, escribir solo admin. Sin
-- esto las dos tablas quedarian sin politica y, con FORCE en el resto del esquema, un
-- controlador mal decorado en una fase futura si podria escribirlas.
GRANT SELECT, INSERT, UPDATE, DELETE ON "orders", "order_sold_days" TO fava_app;

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ord_read  ON "orders";
DROP POLICY IF EXISTS ord_write ON "orders";

CREATE POLICY ord_read  ON "orders" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY ord_write ON "orders" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

ALTER TABLE "order_sold_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_sold_days" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osd_read  ON "order_sold_days";
DROP POLICY IF EXISTS osd_write ON "order_sold_days";

CREATE POLICY osd_read  ON "order_sold_days" FOR SELECT TO fava_app USING (TRUE);
CREATE POLICY osd_write ON "order_sold_days" FOR ALL TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');
