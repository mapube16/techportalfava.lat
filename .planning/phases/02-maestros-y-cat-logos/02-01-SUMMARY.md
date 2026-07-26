---
phase: 02-maestros-y-cat-logos
plan: 01
subsystem: database
tags: [prisma, postgres, rls, migraciones, enum, jest, e2e, fixtures]

# Dependency graph
requires:
  - phase: "01-01"
    provides: "monorepo, prisma.config.ts con MIGRATE_DATABASE_URL, datasource sin url, test/helpers/db.ts"
  - phase: "01-02"
    provides: "patron de migracion RLS a mano e idempotente, las 3 GUCs del RlsInterceptor, control anti-mentira sobre pg_class"
provides:
  - "8 tablas nuevas (concepts, role_types, currencies, machine_models, technicians, projects, project_machines, project_sold_days) + 3 enums de Postgres"
  - "5 columnas nuevas en daily_entries (project_id, machine_model_id, concept_code, phase, role_type_id) y 6 de las 12 FKs nuevas sobre tablas que ya existian"
  - "users.technician_id con @unique + FK: la GUC app.technician_id ya tiene de donde salir"
  - "RLS en las 8 tablas: leer todos / escribir admin; concepts sin politica de INSERT ni DELETE (catalogo cerrado por motor)"
  - "Los 8 conceptos sembrados por la MIGRACION, con etiquetas ES/IT: existen sin correr db:seed"
  - "seed.ts con los catalogos de arranque que si son ABM del usuario (4 roles, 5 monedas, 3 modelos)"
  - "test/helpers/db.ts con baseline conocido (TABLAS_TX vs CATALOGOS, seedCatalogos, TEC_A/TEC_B como tecnicos reales)"
  - "test/helpers/fixtures.ts: contrato cerrado de fixtures para las waves 2-3"
  - "test/rls-maestros.e2e-spec.ts: 61 casos conectados como fava_app, verificados en rojo"
affects: [02-02-catalogos, 02-03-technicians, 02-04-users, 02-05-projects, 02-06-cutover, fase-03-bitacora, fase-05-nota-pdf, fase-06-migracion, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enum de Postgres para los codigos cerrados + tabla solo para lo mutable: CAT-01 es estructural, no una validacion de servicio"
    - "Siembra ESTRUCTURAL dentro de la migracion (ON CONFLICT DO NOTHING): lo que no puede faltar no depende de db:seed"
    - "onDelete: Restrict EXPLICITO en toda FK opcional: el default de Prisma (SetNull) vaciaria columnas en silencio"
    - "GRANT explicito en la migracion de RLS: ALTER DEFAULT PRIVILEGES solo cubre las tablas creadas por ESE rol (Pitfall 7)"
    - "truncateAll() deja un BASELINE (transaccionales vacias + catalogos + tecnicos base) en vez de solo vaciar: los FKs nuevos exigen filas, no UUID sueltos"
    - "Las escrituras de admin en los tests van en una tx que termina en rollback deliberado: prueban el permiso sin ensuciar catalogos que no se truncan"

key-files:
  created:
    - fava-control-tecnico/backend/prisma/migrations/20260726122455_maestros/migration.sql
    - fava-control-tecnico/backend/prisma/migrations/20260726123024_rls_maestros/migration.sql
    - fava-control-tecnico/backend/test/helpers/fixtures.ts
    - fava-control-tecnico/backend/test/rls-maestros.e2e-spec.ts
  modified:
    - fava-control-tecnico/backend/prisma/schema.prisma
    - fava-control-tecnico/backend/prisma/seed.ts
    - fava-control-tecnico/backend/test/helpers/db.ts

key-decisions:
  - "daily_entries.concept_code NO lleva FK a concepts: el enum ya constrine la columna y la FK obligaria a leer el catalogo en cada escritura de bitacora sin ganar ninguna garantia"
  - "onDelete: Restrict explicito en las 12 FKs nuevas; ni un ON DELETE CASCADE en todo el esquema"
  - "weekly_notes.technician_id tambien recibe su FK (el research solo nombraba daily_entries y users): cerrar el esquema significa cerrarlo entero"
  - "projects.created_by_id y project_sold_days.updated_by_id SIN FK: un Restrict impediria dar de baja al usuario y un SetNull falsearia el rastro de autoria"
  - "GRANT SELECT/INSERT/UPDATE/DELETE a fava_app dentro de la migracion de RLS, contra la doctrina de 01-02 (nada de GRANT en migraciones): es la unica reparacion del Pitfall 7 que funciona cuando bootstrap y migrate los corre rol distinto"
  - "truncateAll() conserva nombre y firma y las 3 suites de la Fase 1 no se tocan: los catalogos NUNCA se truncan (un TRUNCATE CASCADE se llevaria los 8 conceptos que sembro la migracion y ninguna migracion los repondria)"
  - "Los tests de escritura de admin usan una transaccion con rollback deliberado en vez de limpiar despues: sin eso la segunda pasada de la suite choca con los @unique de los catalogos"
  - "CAT-01..CAT-05 NO se marcan completos: este plan es la precondicion (esquema), no el entregable; los 6 planes de la fase declaran los mismos IDs y es 02-06 el que los hace verificables"

patterns-established:
  - "Toda tabla nueva necesita su ENABLE + FORCE + politica de SELECT ANTES que la de escritura: sin la de SELECT no hay error, hay cero filas"
  - "Cada suite de RLS se verifica en rojo rompiendo la propiedad (DISABLE ROW LEVEL SECURITY y DROP POLICY) y se deja constancia en el summary"
  - "Los SQLSTATE se afirman por codigo (42501, 22P02, 23505), nunca por texto: el cluster traduce los mensajes"
  - "El conteo del tecnico se compara con el del owner, no con «> 0»: es la unica forma de detectar el fallo silencioso de la lista vacia"

requirements-completed: []

# Metrics
duration: 33min
completed: 2026-07-26
---

# Phase 2 Plan 01: Esquema completo de maestros y catálogos Summary

**8 tablas + 3 enums de Postgres + 12 FKs (6 de ellas sobre tablas que ya existían) en dos migraciones (una generada, una a mano), con RLS «leer todos / escribir admin» sobre las 8, `concepts` cerrado por motor al no tener política de INSERT ni DELETE, y los 8 conceptos sembrados por la migración — todo con las 7 suites de la Fase 1 verdes sin editar una sola línea de ellas.**

## Performance

- **Duration:** ~33 min
- **Started:** 2026-07-26T12:14:00Z (aprox.)
- **Completed:** 2026-07-26T12:47:00Z
- **Tasks:** 3 de 3
- **Files modified:** 7 (4 creados, 3 modificados)

## Accomplishments

- **El esquema de la fase queda cerrado antes de escribir un solo controlador.** Las 8 tablas, los 3 enums, las 5 columnas nuevas de `daily_entries` y los 6 FKs que faltaban sobre lo existente entran en **una** migración generada + **una** migración SQL a mano. Las waves 2-3 pueden arrancar en paralelo sin negociar contrato.
- **Las 3 trampas de Wave 0 están cerradas, no diferidas.** `truncateAll()` tenía la lista de tablas cableada (Pitfall 2) y `TEC_A`/`TEC_B` eran UUID literales que el FK nuevo habría rechazado (Pitfall 3): las dos se arreglaron **en el mismo commit que el FK**, y la prueba es que las 7 suites de la Fase 1 siguen verdes con **cero cambios en sus archivos**. La tercera (`Kpis.tsx`) queda anotada para su dueño en `deferred-items.md`.
- **CAT-01 es estructural, no una promesa.** Verificado contra el motor: el `INSERT` de un concepto devuelve `42501` **incluso siendo admin** (no hay política de INSERT), el `DELETE` afecta 0 filas y deja los 8 en su sitio, y un código inventado (`'XX'`) no pasa del enum (`22P02`) — falla antes incluso de llegar a RLS.
- **Sobre base LIMPIA, `migrate deploy` deja los 8 conceptos y las 8 tablas con `relforcerowsecurity`, SIN correr `db:seed`.** Probado de verdad en una base creada al efecto (`fava_clean`, retirada después): 8 conceptos, 8 tablas forzadas, `role_types` y `currencies` en 0 hasta que corre el seed. Es exactamente el reparto que se buscaba: estructura en la migración, ABM del usuario en el seed.
- **Idempotencia real, no la que finge `migrate deploy`.** El `.sql` de RLS re-aplicado dos veces seguidas con `psql -v ON_ERROR_STOP=1` no da error (solo el `NOTICE` de un `DROP POLICY IF EXISTS`), y los acentos de las etiquetas ES/IT sobreviven.
- **La suite nueva se verificó en rojo, dos veces y con dos roturas distintas:** `ALTER TABLE projects DISABLE ROW LEVEL SECURITY` tumba 4 casos (el anti-mentira de `pg_class` + los 3 de escritura), y `DROP POLICY proj_read` tumba **exactamente 1**: el de lectura. Esa segunda rotura es la importante — es el Pitfall 1 (RLS sin política de SELECT = listas vacías y cero errores), y la suite lo detecta porque compara el conteo del técnico con el del **owner** en vez de pedir «> 0».
- **Cero dependencias nuevas.** `package.json` no se tocó.

## Task Commits

1. **Task 1: Esquema completo + reparación de los helpers que los FKs rompen** — `43ba1f8` (feat)
2. **Task 2: Migración SQL de RLS + siembra estructural de los 8 conceptos + fixtures** — `2fb9517` (feat)
3. **Task 3 (TDD): `rls-maestros.e2e-spec.ts`** — `7657afd` (test) · verificada en rojo con `DISABLE ROW LEVEL SECURITY` y con `DROP POLICY proj_read`

## Files Created/Modified

- `backend/prisma/schema.prisma` — 3 enums (`concept_code`, `phase`, `employment_type`), 8 modelos nuevos, 5 columnas y 6 FKs sobre `daily_entries` / `users` / `weekly_notes`. El comentario del Pitfall 6 va literal junto a `clientNit`, que es donde lo lee quien vaya a usarla en la Fase 5
- `backend/prisma/migrations/20260726122455_maestros/migration.sql` — generada con `migrate diff` y revisada: **12/12 FKs con `ON DELETE RESTRICT`**, ni un `ON DELETE CASCADE`. (Las 12 llevan `ON UPDATE CASCADE`, que es el default de Prisma y aquí es lo correcto: las únicas PKs editables son `currencies.code` y `machine_models.code`, y si el Super Admin corrige un código, propagarlo es el comportamiento deseado)
- `backend/prisma/migrations/20260726123024_rls_maestros/migration.sql` — `ENABLE` + `FORCE` + 2 políticas por tabla (la de `SELECT` primero), `concepts` con solo `SELECT` + `UPDATE`, `GRANT` a `fava_app` y los 8 conceptos con `ON CONFLICT DO NOTHING`
- `backend/prisma/seed.ts` — añade los catálogos de arranque por clave natural (4 roles, 5 monedas, 3 modelos); el upsert del Super Admin no se tocó
- `backend/test/helpers/db.ts` — `TABLAS_TX` (8, se truncan) vs `CATALOGOS` (4, nunca), `seedCatalogos()` idempotente con `ROL_TEST`/`CUR_TEST`/`MAQ_TEST`, y `truncateAll()` reponiendo `TEC_A`/`TEC_B` como filas reales
- `backend/test/helpers/fixtures.ts` — `crearTecnico` / `crearProyecto` / `crearJornadaAprobada`, contrato **cerrado** para las waves 2-3
- `backend/test/rls-maestros.e2e-spec.ts` — 61 casos: anti-mentira (3), lectura table-driven (8), escritura vetada al técnico (24), escritura permitida al admin (21), `concepts` cerrado por motor (5)

## Decisions Made

Ver `key-decisions` en el frontmatter. Las cuatro que más afectan a lo que viene:

1. **`daily_entries.concept_code` no tiene FK a `concepts`.** El enum ya lo constriñe; una FK obligaría a tocar el catálogo en cada escritura de bitácora (Fase 3) sin ganar ninguna garantía. `Concept` queda sin relaciones.
2. **`onDelete: Restrict` explícito en las 12 FKs nuevas.** Prisma pone `SetNull` por defecto en las relaciones opcionales: un borrado accidental de proyecto vaciaría en silencio el `project_id` de la bitácora. Ni un `ON DELETE CASCADE` en todo el esquema.
3. **Los catálogos NO se truncan entre tests.** Cualquier plan que añada `concepts` a `TABLAS_TX` se lleva los 8 conceptos que sembró la migración, y **ninguna migración los repone** (`migrate deploy` no reejecuta). Está escrito en el propio helper.
4. **CAT-01..CAT-05 no se marcan completos.** Los 6 planes de la fase declaran los mismos IDs; este es la precondición (esquema), y es 02-06 (wave 4) el que los hace verificables desde la interfaz. Marcarlos aquí haría que la verificación de fase mintiera con 5 planes por delante.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate dev` no funciona en entorno no interactivo**
- **Found during:** Task 1
- **Issue:** El comando del plan (`npx prisma migrate dev --name maestros`) aborta: *«Prisma Migrate has detected that the environment is non-interactive, which is not supported»*. El aviso que lo dispara es el `@unique` nuevo sobre `users.technician_id` («If there are existing duplicate values, this will fail»), que exige confirmación. `--from-url` de `migrate diff`, la salida obvia, también fue **removido** en Prisma 7.
- **Fix:** Migración generada con `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/<ts>_maestros/migration.sql` y aplicada con `migrate deploy`. El SQL es el mismo que habría emitido `migrate dev`; se revisó línea a línea antes de aplicarlo.
- **Files modified:** `backend/prisma/migrations/20260726122455_maestros/migration.sql`
- **Verification:** `migrate deploy` aplica sin error y `migrate diff --exit-code` responde **«No difference detected»** — es decir, el esquema en disco y la base coinciden exactamente, que es la garantía que da `migrate dev`.
- **Committed in:** `43ba1f8`

**2. [Rule 2 - Missing Critical] `GRANT` explícito en la migración de RLS (Pitfall 7)**
- **Found during:** Task 2
- **Issue:** El plan no lo pide y 01-02 decidió explícitamente «ni `GRANT` ni `REVOKE` en la migración» porque el `ALTER DEFAULT PRIVILEGES` del bootstrap ya cubre los privilegios. Pero ese `ALTER` solo aplica a los objetos creados **por el mismo rol que lo ejecutó**: si en Railway las migraciones las corre un usuario distinto del que corrió `db:bootstrap`, las 8 tablas nuevas nacen sin permisos para `fava_app` y la app responde `permission denied for table projects` **inmediatamente después de un `migrate deploy` exitoso**. En local no se ve porque ahí es el mismo rol. Es la primera fase que estrena tablas después de un deploy, así que es aquí donde el agujero se abre.
- **Fix:** Un `GRANT SELECT, INSERT, UPDATE, DELETE ON <las 8 tablas> TO fava_app` al principio de la migración de RLS, con el razonamiento al lado. Idempotente, y funciona precisamente en el escenario que falla (quien crea la tabla puede otorgar sobre ella).
- **Files modified:** `backend/prisma/migrations/20260726123024_rls_maestros/migration.sql`
- **Verification:** El `.sql` re-aplicado dos veces con `ON_ERROR_STOP=1` no falla; las 61 pruebas leen y escriben las 8 tablas como `fava_app`.
- **Committed in:** `2fb9517`

**3. [Rule 1 - Bug] Las escrituras de admin de la suite se deshacían entre sí**
- **Found during:** Task 3
- **Issue:** El caso «el admin borra la fila que acaba de insertar» fallaba en las 7 tablas (7 de 61): el helper ejecutaba **cada sentencia en su propia transacción**, y como esas transacciones terminan en rollback deliberado, el `DELETE` nunca veía la fila del `INSERT`.
- **Fix:** El helper acepta varias sentencias y las corre en la **misma** transacción, midiendo la última.
- **Files modified:** `backend/test/rls-maestros.e2e-spec.ts`
- **Verification:** 61/61 en verde; el fallo era del test, no de las políticas (las otras 54 aserciones ya pasaban).
- **Committed in:** `7657afd`

### Desviaciones deliberadas respecto al texto del plan

- **`ROL_TEST` / `MAQ_TEST` son UUID fijos (el `id`), no nombres.** El plan pedía «códigos fijos»; los fixtures necesitan el `id` para rellenar FKs sin un lookup previo, así que el upsert va por `id` con nombre/código de prueba estables. `CUR_TEST` sí es el código (`'TST'`), porque en `currencies` el código **es** la PK. Se eligió `'TST'` y no `'USD'` para que las suites no dependan de que `db:seed` haya corrido.
- **El «INSERT de un 9º concepto» se prueba de dos formas, no de una.** Un noveno concepto **no se puede ni nombrar**: el enum tiene exactamente 8 valores y los 8 están sembrados. Así que la suite afirma las dos mitades de la garantía: un código inventado muere en el enum (`22P02`) y cualquier `INSERT` en la tabla muere en RLS (`42501`, comprobado con `psql` que la política se evalúa **antes** del `unique`). Juntas son la afirmación completa; por separado, cada una deja una puerta sin cerrar.
- **`DELETE` de un concepto son «0 filas», no `42501`.** El plan admitía ambas. Verificado contra el motor: sin política de `DELETE` el default-deny **filtra** las filas, así que Postgres devuelve `DELETE 0` sin error. La aserción es doble (0 filas **y** los 8 conceptos siguen ahí), que es la garantía real e inmune a cuál de los dos modos elija Postgres.
- **El admin `DELETE` se prueba sobre una fila desechable creada en la misma transacción**, no sobre la siembra. Un `DELETE FROM role_types` a pelo choca con el FK de `technicians` (`23503`), que no dice nada de RLS. El caso mide el permiso, no la integridad referencial.

### Simplificaciones deliberadas

- **Sin `WITH CHECK` en las 14 políticas `FOR ALL`** (en `FOR ALL` Postgres reutiliza `USING`), pero **sí** en `conc_label`: en `FOR UPDATE`, `USING` filtra la fila vieja y `WITH CHECK` valida la nueva — ahí no es redundante.
- **Sin cuarta GUC `app.is_super`.** Tocaría `rls.interceptor.ts` (archivo compartido con las waves siguientes) para una garantía que `@Roles('S')` ya da en la capa de servicio.
- **Sin índices parciales.** Un `@unique` normal significa que desactivar un rol no libera su nombre, que es el comportamiento correcto (la UI ofrece reactivarlo) y evita depender del preview feature `partialIndexes`.
- **`fixtures.ts` es un contrato cerrado.** Ningún plan posterior lo modifica: si a un spec le falta un fixture, se lo define en su propio archivo. Así dos planes en paralelo no se pisan el mismo archivo.

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing-critical, 1 bug) + 4 desviaciones deliberadas + 4 simplificaciones
**Impact on plan:** Ninguna reduce el alcance ni ablanda las pruebas. La única que añade algo al plan es el `GRANT`, y lo hace porque es la fase que estrena tablas tras un deploy: sin él, el Pitfall 7 se cobra el primer `GET /api/projects` en Railway.

## Issues Encountered

- **`prisma migrate dev` es inutilizable aquí y `--from-url` ya no existe.** Resuelto con `migrate diff --from-config-datasource` (ver Desviación 1). Conviene que las fases siguientes lo sepan: **la receta para generar una migración en este repo es `migrate diff` + `migrate deploy`**, no `migrate dev`.
- **`truncateAll()` sigue borrando al Super Admin del seed.** Repuesto con `npm -w backend run db:seed` tras la suite (verificado). Ahora el seed repone además los catálogos de arranque.
- **La base local quedó con los catálogos que dejó la última pasada** (los 8 conceptos + 4 roles + 5 monedas + 3 modelos + `ROL_TEST`/`CUR_TEST`/`MAQ_TEST`/`TEST-MAQ-2` de los tests). Es el estado esperado: los catálogos no se truncan a propósito.

## User Setup Required

None. Todo corre contra el cluster local del puerto 55432 documentado en el Plan 01-01.

**Producción NO se tocó**, como exige el plan: las dos migraciones se aplican en Railway en el `preDeployCommand` del próximo deploy.

## Next Phase Readiness

**Para las waves 2 y 3 (planes 02-02 a 02-05), ahora mismo:**
- Las 8 tablas existen con RLS y privilegios; `PrismaService.client` dentro del `RlsInterceptor` ya puede leerlas como técnico y escribirlas como admin sin ninguna migración adicional.
- `test/helpers/fixtures.ts` da `crearTecnico` / `crearProyecto` / `crearJornadaAprobada`; `truncateAll()` garantiza catálogos + `TEC_A`/`TEC_B`.
- Los tipos y enums de TypeScript salen de `src/generated/prisma` (`ConceptCode`, `Phase`, `EmploymentType`) tras `prisma generate`, que ya corre dentro de `npm run build`.
- **Receta de migración de este repo:** `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/<ts>_<nombre>/migration.sql` y luego `npm -w backend run db:migrate`.

**Para la Fase 5 (Nota Semanal en PDF) — anotado explícitamente por petición del plan:**
- **El `NIT:` del encabezado de la Nota es el de FAVA (`901137532-4`), constante del membrete, NO `projects.client_nit`.** El comentario va literal en `schema.prisma` junto a la columna. Enchufar `client_nit` en esa casilla entregaría a un cliente un documento firmado con el identificador fiscal equivocado.
- Los 7 campos del encabezado (`client_name`, `locality` + `country`, `supply`, `contract_number`, más los modelos de máquina del proyecto) están en su forma final. `locality` y `country` son **dos** columnas y la Nota las imprime unidas por `, `.
- El «Cargo durante esta semana» sigue siendo de la Fase 4 (NOTA-09): no está en `technicians`.

**Para la Fase 6 (migración del Excel):**
- `daily_entries` ya tiene `role_type_id` (5 de 14 técnicos tienen más de un rol en los datos reales) y `phase` nullable (las hojas diarias no traen fase). No hay que migrar dos veces.
- `technicians.aliases` está listo para la conciliación de grafías (MIG-01).

**Concerns:**
- **Pitfall 7 mitigado, no cerrado.** El `GRANT` de la migración cubre el caso conocido, pero el primer deploy con tablas nuevas sigue mereciendo un `GET /api/projects` autenticado en el smoke (dueño: el plan que amplíe `scripts/smoke.ts`).
- **`Kpis.tsx` romperá el build del frontend** cuando `types.ts` deje de ser el contrato. Anotado en `deferred-items.md` con su dueño (plan 02-06) y la salida de una línea.
- **CAT-01..CAT-05 siguen abiertos** a propósito: sin endpoints ni pantallas no son verificables. Los cierra la fase, no este plan.

## Self-Check: PASSED

- 7/7 archivos declarados existen en disco (+ `deferred-items.md`).
- 3/3 commits de tarea existen en el historial (`43ba1f8`, `2fb9517`, `7657afd`).
- `schema.prisma` contiene `model ProjectSoldDays`; la migración de RLS contiene `FORCE ROW LEVEL SECURITY`; `db.ts` contiene `CATALOGOS` y `TEC_A`; el spec contiene `relforcerowsecurity`.
- `fixtures.ts` 90 líneas (mín. 30) · `rls-maestros.e2e-spec.ts` 314 líneas (mín. 80).
- **12/12 FKs con `ON DELETE RESTRICT`**, ni un `ON DELETE CASCADE`.
- `npm -w backend run test` → **12 passed**. `npm -w backend run test:e2e` → **8 suites, 114 passed** (las 7 de la Fase 1 sin tocar + `rls-maestros`).
- `npm run build` en la raíz compila los dos workspaces.
- `migrate diff --exit-code` → «No difference detected» (esquema en disco == base).
- Base LIMPIA con solo `migrate deploy`: 8 conceptos, 8 tablas con `relforcerowsecurity`, `role_types`/`currencies` en 0.
- `.sql` de RLS re-aplicado ×2 con `ON_ERROR_STOP=1` sin error.
- **Cero dependencias nuevas:** `git diff` de `package.json` / `package-lock.json` en los 3 commits está vacío.
- Verificación en rojo registrada: `DISABLE ROW LEVEL SECURITY` en `projects` → 4 fallos; `DROP POLICY proj_read` → 1 fallo (el de lectura). Estado restaurado re-aplicando la migración.

---
*Phase: 02-maestros-y-cat-logos*
*Completed: 2026-07-26*
