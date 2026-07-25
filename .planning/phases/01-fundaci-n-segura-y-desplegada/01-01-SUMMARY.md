---
phase: 01-fundaci-n-segura-y-desplegada
plan: 01
subsystem: infra
tags: [nestjs, prisma, postgres, npm-workspaces, typescript, helmet, jest, rls, docker-compose]

# Dependency graph
requires: []
provides:
  - "Monorepo npm workspaces en fava-control-tecnico/ (backend + frontend existente) con un solo npm install y un solo npm run build"
  - "Backend NestJS 11 compilable con TypeScript 5.9.3 exacto y arranque que muere si falta una env var"
  - "PrismaService con adapter PrismaPg, transactionOptions 10s/5s y getters base/client sobre AsyncLocalStorage"
  - "RlsInterceptor registrado como APP_INTERCEPTOR global (esqueleto pass-through, listo para 01-02)"
  - "Esquema Prisma 7 (cjs) con users, access_requests, daily_entries y weekly_notes en forma definitiva minima"
  - "scripts/db-bootstrap.ts idempotente: rol fava_app NOBYPASSRLS + ALTER DEFAULT PRIVILEGES"
  - "test/helpers/db.ts con ownerClient, appClient (rol fava_app real), truncateAll y TEC_A/TEC_B"
  - "test/jest-e2e.json y suite bootstrap.e2e-spec.ts en verde"
affects: [01-02-rls, 01-03-auth, 01-06-deploy, fase-02-dominio, fase-06-migracion]

# Tech tracking
tech-stack:
  added:
    - "@nestjs/{core,common,platform-express}@11.1.28"
    - "@nestjs/serve-static@5, @nestjs/terminus@11, @nestjs/throttler@6, @nestjs/swagger@11"
    - "prisma / @prisma/client / @prisma/adapter-pg 7.9.0 en lockstep"
    - "typescript 5.9.3 (exacto, sin caret)"
    - "helmet 8, jose 6, zod 4, dotenv 17, nestjs-pino + pino 10"
    - "jest 30 + ts-jest + supertest, tsx 4"
  patterns:
    - "Un servicio: NestJS sirve frontend/dist con ServeStatic y exclude ['/api/{*path}'] (comodin de Express 5)"
    - "Env validado por zod al cargar el modulo: el proceso muere al arrancar, no en la primera peticion"
    - "Dos roles de Postgres reproducibles por script versionado, nunca por psql interactivo"
    - "Identidad de la peticion por AsyncLocalStorage, no por parametro que se puede olvidar"
    - "helmet dual: CSP con login.microsoftonline.com en todo, COOP desactivado solo en /redirect.html"

key-files:
  created:
    - fava-control-tecnico/package.json
    - fava-control-tecnico/.gitignore
    - fava-control-tecnico/.nvmrc
    - fava-control-tecnico/docker-compose.yml
    - fava-control-tecnico/backend/package.json
    - fava-control-tecnico/backend/tsconfig.json
    - fava-control-tecnico/backend/tsconfig.build.json
    - fava-control-tecnico/backend/nest-cli.json
    - fava-control-tecnico/backend/prisma.config.ts
    - fava-control-tecnico/backend/src/main.ts
    - fava-control-tecnico/backend/src/app.module.ts
    - fava-control-tecnico/backend/src/config/env.ts
    - fava-control-tecnico/backend/src/config/env.module.ts
    - fava-control-tecnico/backend/src/common/health/health.module.ts
    - fava-control-tecnico/backend/src/common/health/health.controller.ts
    - fava-control-tecnico/backend/src/common/prisma/prisma.service.ts
    - fava-control-tecnico/backend/src/common/prisma/prisma.module.ts
    - fava-control-tecnico/backend/src/common/prisma/rls.interceptor.ts
    - fava-control-tecnico/backend/prisma/schema.prisma
    - fava-control-tecnico/backend/prisma/seed.ts
    - fava-control-tecnico/backend/prisma/migrations/20260725220221_init/migration.sql
    - fava-control-tecnico/backend/scripts/db-bootstrap.ts
    - fava-control-tecnico/backend/test/jest-e2e.json
    - fava-control-tecnico/backend/test/bootstrap.e2e-spec.ts
    - fava-control-tecnico/backend/test/helpers/db.ts
  modified: []

key-decisions:
  - "EnvModule global (zod + declaration merging) sustituye a ConfigModule: @nestjs/config no se instalo porque ConfigService solo anadiria lookups por string sin tipos sobre un objeto ya validado y congelado"
  - "Sin setGlobalPrefix: los controladores declaran la ruta completa (@Controller('api/...')), /health queda en la raiz para el healthcheck de Railway"
  - "ThrottlerModule registrado sin APP_GUARD: el limite se aplica con @UseGuards(ThrottlerGuard) en POST /api/access-requests (Plan 01-03), el unico endpoint escribible por cualquier miembro del tenant"
  - "prisma.config.ts vive en backend/ (raiz del paquete), no en backend/prisma/: Prisma 7 solo auto-descubre el archivo en la raiz del proyecto"
  - "La url de migraciones va en prisma.config.ts como MIGRATE_DATABASE_URL; Prisma 7 rechaza `url` en el bloque datasource, asi que el runtime no puede acabar conectado como owner ni por accidente"
  - "/health sin indicadores de BD: un check de Postgres ahi haria que Railway reiniciase el contenedor en cada hipo de la base; la liveness de la BD la cubre el smoke del Plan 01-06"
  - "src/generated/ gitignored y `prisma generate` dentro del script build: codigo generado fuera del repo"

patterns-established:
  - "Ruta del estatico resuelta probando process.cwd() y __dirname/../..: npm -w backend deja cwd en backend/, Railway puede arrancar desde la raiz"
  - "db-bootstrap pasa el password como bind parameter y lo lee con current_setting dentro de un DO/EXECUTE: nunca aparece en el texto de la query visible en pg_stat_activity"
  - "El rol de Postgres lo crea el bootstrap (idempotente, fuera de Prisma); las politicas RLS iran en migraciones SQL versionadas"
  - "Los tests e2e usan appClient conectado como fava_app: con el owner las politicas quedan escritas y sin efecto y el test pasaria por el motivo equivocado"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 31min
completed: 2026-07-25
---

# Phase 1 Plan 01: Fundación (monorepo, NestJS 11, Prisma 7, dos roles de Postgres) Summary

**Monorepo npm workspaces con backend NestJS 11 + Prisma 7 (cjs), esquema de 4 tablas con los campos `source_*` de Fase 6 ya puestos, y bootstrap idempotente del rol `fava_app` (NOBYPASSRLS) probado contra un Postgres 17 real.**

## Performance

- **Duration:** ~31 min
- **Started:** 2026-07-25T16:37:00Z (aprox.)
- **Completed:** 2026-07-25T17:08:24Z
- **Tasks:** 3 de 3
- **Files modified:** 31 (26 creados en el repo + lockfile + migración)

## Accomplishments

- Un `npm install` en `fava-control-tecnico/` instala backend y frontend; un `npm run build` compila los dos. El frontend existente entró como workspace sin tocar su `package.json` ni romper su build (762 módulos, `redirect.html` incluido).
- TypeScript **5.9.3 exacto** verificado con `npm ls typescript` — `npm view typescript version` devuelve hoy 7.x (compilador en Go), que nunca se comprometió con `emitDecoratorMetadata` y no habría compilado un solo decorador de Nest.
- El proceso muere al arrancar si falta una variable: `env.ts` hace `safeParse` de las 8 variables al **cargar el módulo**, antes de que exista un servidor HTTP. Probado en el e2e importando `app.module` con `ENTRA_TENANT_ID` fuera del entorno.
- `db-bootstrap` corrido dos veces seguidas deja el mismo estado y verifica su propio resultado: aborta si `fava_app` sale con `rolbypassrls` o `rolsuper` en true. Se comprobó además que `ALTER DEFAULT PRIVILEGES` funciona de verdad creando una tabla nueva como owner y leyéndola como `fava_app` sin re-`GRANT`.
- Las 4 tablas existen con su forma definitiva mínima: `daily_entries` y `weekly_notes` ya traen `source_year`/`source_sheet`/`source_row`, así que Fase 6 no migra dos veces, y el spike de RLS del Plan 01-02 correrá sobre tablas reales en vez de tablas desechables.
- Suite `bootstrap` en verde (4 tests) contra Postgres 17, con `helpers/db.ts` listo para que 01-02 y 01-03 arranquen en paralelo.

## Task Commits

1. **Task 1: Workspace raíz, docker-compose y scaffold NestJS pineado** — `9803c9d` (feat)
2. **Task 2: Esquema Prisma 7, migración inicial, db-bootstrap y seed** — `907514b` (feat)
3. **Task 3 (TDD): test e2e de arranque + helper de BD**
   - RED — `96a001f` (test)
   - GREEN — `cc8bd33` (feat)

## Files Created/Modified

- `fava-control-tecnico/package.json` — workspaces `[backend, frontend]`, `engines.node 22.x`, scripts `build`/`start`/`db:bootstrap`
- `fava-control-tecnico/.gitignore` — `node_modules`, `dist`, `.env*` (con excepción para `.env.example`) y el cliente generado de Prisma
- `fava-control-tecnico/docker-compose.yml` — `postgres:17` (misma major que Railway), volumen nombrado y healthcheck
- `backend/src/config/env.ts` — zod sobre las 8 variables + `EnvService` inyectable por declaration merging
- `backend/src/main.ts` — helmet dual (CSP con `login.microsoftonline.com`; COOP desactivado solo en `/redirect.html`), `listen(PORT, '0.0.0.0')`
- `backend/src/app.module.ts` — ServeStatic con `exclude: ['/api/{*path}']`, pino con `authorization` redactado, throttler, Prisma, Health y `RlsInterceptor` global
- `backend/src/common/prisma/prisma.service.ts` — `PrismaPg` con `max: 10`, `transactionOptions` 10s/5s, `als`, getters `base` y `client`
- `backend/src/common/prisma/rls.interceptor.ts` — esqueleto pass-through, ya registrado, para que 01-02 no toque `app.module`
- `backend/prisma/schema.prisma` — `provider = "prisma-client"` + `moduleFormat = "cjs"`, enum `Role { T A S }`, 4 modelos snake_case
- `backend/scripts/db-bootstrap.ts` — rol `fava_app` idempotente + `ALTER DEFAULT PRIVILEGES` + autoverificación de `rolbypassrls`
- `backend/prisma/seed.ts` — upsert por email del Super Admin con `entraOid` null (lo fija el primer login)
- `backend/test/helpers/db.ts` — `ownerClient`, `appClient` (rol `fava_app`), `truncateAll()`, `TEC_A`/`TEC_B`
- `backend/test/bootstrap.e2e-spec.ts` — 4 tests: `/health` 200, boot que muere sin env, identidad de cada cliente, `truncateAll`

## Decisions Made

Ver `key-decisions` en el frontmatter. Las tres que más afectan a las plans siguientes:

1. **`@nestjs/config` no está instalado.** Usar `EnvService` (o el export `env`) de `src/config/env.ts`. Es lo que espera el `jwksProvider` del research.
2. **No hay `setGlobalPrefix`.** Los controladores de 01-03 deben declararse como `@Controller('api/me')`, `@Controller('api/users')`, `@Controller('api/access-requests')`.
3. **`ThrottlerGuard` no es global.** Aplicarlo explícitamente en el endpoint público de solicitud de acceso.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 rechaza `url` en el bloque `datasource` del schema**
- **Found during:** Task 2
- **Issue:** El plan pedía `datasource postgresql con env("DATABASE_URL")`. `prisma validate` falla con P1012: *«The datasource property `url` is no longer supported in schema files»*.
- **Fix:** El bloque `datasource` queda solo con `provider`; la URL de migraciones va en `prisma.config.ts` (`datasource.url = env('MIGRATE_DATABASE_URL')`) y la del cliente la trae el adapter `PrismaPg`. Efecto lateral positivo: el runtime no puede acabar conectado como owner ni por accidente.
- **Files modified:** `backend/prisma/schema.prisma`, `backend/prisma.config.ts`
- **Verification:** `npx prisma validate` → válido; `migrate dev`/`migrate deploy`/`db seed` corren contra la URL del owner.
- **Committed in:** `907514b`

**2. [Rule 3 - Blocking] `prisma.config.ts` no se auto-descubre en `prisma/`**
- **Found during:** Task 2
- **Issue:** Con el archivo en `backend/prisma/prisma.config.ts` (la ruta del plan), `prisma migrate status` falla: *«The datasource.url property is required in your Prisma config file»* — nunca lo cargó.
- **Fix:** Movido a `backend/prisma.config.ts`, la raíz del paquete, que es donde Prisma 7 lo busca. `Loaded Prisma config from prisma.config.ts.` en cada comando lo confirma.
- **Files modified:** `backend/prisma.config.ts`
- **Verification:** `npx prisma migrate status` carga el config y resuelve el datasource.
- **Committed in:** `907514b`

**3. [Rule 3 - Blocking] Sin Docker en la máquina: cluster Postgres 17 aislado**
- **Found during:** Task 2
- **Issue:** `docker` no existe en esta máquina, y el Postgres 17 del sistema (puerto 5432) tiene una contraseña que no está disponible. Sin base de datos no hay forma de verificar bootstrap, migración, seed ni e2e.
- **Fix:** `docker-compose.yml` se entrega como pide el plan (es la ruta reproducible y la que fija la major de Railway). Para ejecutar aquí se creó un **cluster aparte** con el `initdb` del PostgreSQL 17 ya instalado: datadir `C:/tmp/fava-pg/data`, puerto **55432**, `listen_addresses=localhost`, auth `scram-sha-256`. No toca el cluster del usuario ni añade nada al repo; `backend/.env` (gitignored) apunta ahí y lo documenta.
- **Files modified:** `backend/.env` (gitignored, no versionado)
- **Verification:** `pg_isready -p 55432` OK; bootstrap ×2, `migrate deploy`, `db seed` y la suite e2e corrieron todos contra él.
- **Committed in:** — (no versionado)
- **Comando para volver a levantarlo:** `"C:/Program Files/PostgreSQL/17/bin/pg_ctl" -D C:/tmp/fava-pg/data -l C:/tmp/fava-pg/server.log -o "-p 55432" start`

**4. [Rule 1 - Bug] `rootPath` del estático rompía según desde dónde se arranque**
- **Found during:** Task 1
- **Issue:** El plan fija `join(process.cwd(), 'frontend', 'dist')`. `npm -w backend run start:prod` deja el cwd en `backend/`, con lo que la ruta resuelve a `backend/frontend/dist` y el frontend no se sirve. El research ya marcaba `__dirname` como trampa simétrica (apunta a `backend/dist/`).
- **Fix:** Se prueban las dos rutas y se toma la que existe (`existsSync`), con fallback a la del plan.
- **Files modified:** `backend/src/app.module.ts`
- **Verification:** La suite e2e arranca la app entera y `/health` responde 200 (ServeStatic no revienta el boot).
- **Committed in:** `9803c9d`

**5. [Rule 3 - Blocking] Verificación del plan usaba `npx -w backend`, que no existe**
- **Found during:** Task 2
- **Issue:** `npx` no acepta `-w`. El comando de verificación del plan no se podía ejecutar tal cual.
- **Fix:** Se añadieron los scripts `db:migrate` (`prisma migrate deploy`) y `db:seed` (`prisma db seed`) al backend. La verificación queda: `npm -w backend run db:bootstrap` ×2 `&& npm -w backend run db:migrate && npm -w backend run db:seed`.
- **Files modified:** `backend/package.json`
- **Verification:** La cadena completa corre en verde.
- **Committed in:** `907514b`

### Simplificaciones deliberadas

- **`@nestjs/config` / `ConfigModule` no instalados.** `env` ya está validado por zod y congelado; `ConfigService` encima solo añadiría lookups por string sin tipos. En su lugar, `EnvModule` global con `EnvService` tipado por declaration merging (~15 líneas), que es exactamente lo que el research inyecta en el `jwksProvider`. `dotenv` se instaló explícitamente porque la carga del `.env` tiene que ocurrir **antes** que la validación, y `ConfigModule` la haría después.
- **Sin `setGlobalPrefix('api')`.** Un prefijo global obliga a coordinar con las plans paralelas qué ruta declara cada controlador; declararla completa es explícito y greppable. Documentado arriba.
- **`ThrottlerGuard` no registrado como `APP_GUARD`.** Limitar `/health` a 20 req/min haría flakear los e2e y el healthcheck de Railway sin proteger nada.
- **`@@index([technicianId])` omitido en `daily_entries`.** El `@@unique([technicianId, date])` ya crea un índice con `technician_id` como primera columna: el segundo índice cuesta escrituras y espacio sin ganar ni un plan de consulta. `weekly_notes`, que no tiene unique, sí lo lleva.
- **`/health` sin indicadores.** Ver `key-decisions`.

---

**Total deviations:** 5 auto-fixed (4 blocking, 1 bug) + 5 simplificaciones deliberadas
**Impact on plan:** Ninguna toca el alcance. Tres de los cuatro «blocking» son correcciones de Prisma 7 y del comando de verificación; el cuarto es la ausencia de Docker en esta máquina, resuelta sin añadir nada al repo. El bug del `rootPath` habría aparecido en el primer deploy de Railway como un frontend en blanco.

## Issues Encountered

- **`daily_entries` sin índice separado por técnico:** decidido a propósito (ver simplificaciones). Si Fase 3 mide un plan de consulta que lo pida, es un `@@index` de una línea.
- **`truncateAll()` borra al Super Admin del seed.** Es lo correcto para aislar tests, pero tras correr la suite hay que reponerlo con `npm -w backend run db:seed`. Documentado en el propio helper.
- **31 vulnerabilidades en `npm audit`** (3 moderate, 28 high), todas en dependencias transitivas del toolchain de build (`glob`/`inflight` viejos vía `@nestjs/cli`). Fuera del alcance de esta plan; anotado para revisar antes del deploy de producción del Plan 01-06.

## User Setup Required

None en esta plan — las variables de Entra son placeholders hasta que el Plan 01-04 cree los registros. `docs/ENV.md` y `docs/ENTRA-SETUP.md` (Plan 01-04) documentan el resto.

Para reproducir el entorno local **con** Docker: `docker compose up -d db` y cambiar el puerto `55432` → `5432` en `backend/.env`.

## Next Phase Readiness

**Listo para 01-02 (RLS):**
- `daily_entries` y `weekly_notes` existen con `technician_id uuid`; las políticas y el `FORCE ROW LEVEL SECURITY` van en una migración SQL nueva.
- `RlsInterceptor` ya está registrado como `APP_INTERCEPTOR`: 01-02 solo edita ese archivo, no `app.module.ts`.
- `als`, `PrismaService.base` y `PrismaService.client` exportados con el contrato exacto del plan.
- `test/helpers/db.ts` da `appClient` conectado como `fava_app` real y `TEC_A`/`TEC_B` para sembrar.

**Listo para 01-03 (auth):**
- `User.entraOid` es `@unique` (lookup por petición sin seq scan, sin cache — AUTH-04).
- `AccessRequest` existe con `entraOid @unique` y `status` por defecto `pending`.
- `EnvService` inyectable con `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID` y `ENTRA_REQUIRED_SCOPE`.
- `jose` y `@nestjs/swagger` ya instalados.

**Concerns:**
- La major de Postgres del `docker-compose.yml` (17) debe verificarse contra la que provisiona Railway en el Plan 01-06.
- La CSP contra `login.microsoftonline.com` sigue siendo el punto MEDIUM del research: hay que verificarla con la consola del navegador abierta en el primer deploy, no darla por buena.

## Self-Check: PASSED

- 25/25 archivos declarados existen en disco.
- 4/4 commits de tarea existen en el historial (`9803c9d`, `907514b`, `96a001f`, `cc8bd33`).
- `npm run build` en la raíz compila los dos workspaces.
- `npm -w backend run db:bootstrap` ×2 sin error; `rolbypassrls = f`, `rolsuper = f` para `fava_app`.
- `npm -w backend run test:e2e -- bootstrap` → 4 passed.
- `schema.prisma` contiene `daily_entries` y `weekly_notes` con `source_year`/`source_sheet`/`source_row` (verificado también en `information_schema.columns`).

---
*Phase: 01-fundaci-n-segura-y-desplegada*
*Completed: 2026-07-25*
