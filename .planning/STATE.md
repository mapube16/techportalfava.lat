---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completado 02-06-PLAN.md (cutover de frontend: fase 2 con sus 6 planes ejecutados)"
last_updated: "2026-07-26T18:09:43.084Z"
last_activity: "2026-07-26 — 02-06 completado: las 5 pantallas de administración leen del API real. Delta invertido borrado (el servidor lo calcula), matriz derivada del catálogo de roles, autoguardado por celda y check:no-free-text en verde y enganchado al build"
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 13
  completed_plans: 11
  percent: 85
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-25)

**Core value:** Captura única — el técnico registra el día una vez → Nota Semanal firmada + KPIs + control comercial salen solos.
**Current focus:** Phase 2 — Maestros y catálogos

## Current Position

Phase: 2 of 8 (Maestros y catálogos)
Plan: 6 of 6 (los 6 ejecutados — pendiente la verificación de fase)
Status: Executing
Last activity: 2026-07-26 — 02-06 completado: las 5 pantallas de administración leen del API real. Delta invertido borrado (el servidor lo calcula), matriz derivada del catálogo de roles, autoguardado por celda y check:no-free-text en verde y enganchado al build

Progress: [█████████░] 85%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 P05 | 1 | 55 min | 55 min (3 tasks, 13 files) |
| Phase 01 P01 | 1 | 31 min | 31 min (3 tasks, 31 files) |
| Phase 01 P02 | 1 | 15 min | 15 min (3 tasks, 5 files) |
| Phase 01 P03 | 1 | 45 min | 45 min (3 tasks, 28 files) |
| Phase 01 P07 | 1 | 50 min | 50 min (3 tasks, 17 files) |
| Phase 02 P01 | 1 | 33 min | 33 min (3 tasks, 7 files) |
| Phase 02 P02 | 1 | 24 min | 24 min (2 tasks, 3 files) |
| Phase 02 P04 | 1 | 21 min | 21 min (2 tasks, 4 files) |
| Phase 02 P03 | 1 | 42 min | 42 min (2 tasks, 9 files) |
| Phase 02 P05 | 1 | 35 min | 35 min (3 tasks, 8 files) |
| Phase 02 P06 | 1 | 62 min | 62 min (3 tasks, 23 files) |

**Recent Trend:**
- Last 5 plans: 02-06 (62 min), 02-05 (35 min), 02-03 (42 min), 02-04 (21 min), 02-02 (24 min)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisiones completas en PROJECT.md (Key Decisions). Las que afectan el trabajo actual:

- [Roadmap]: Entra ID real + RLS + deploy Railway van en Phase 1, no al final — los límites de Railway y el bypass de RLS por owner solo aparecen desplegado.
- [Roadmap]: Frontend existente se cablea pantalla por pantalla desde Phase 1; nunca hay una fase final de "conectar todo".
- [Roadmap]: Migración (Phase 6) puede correr en paralelo con Phases 3-5, pero debe cerrar antes de los tableros (Phase 7).
- [Stack]: TypeScript pineado en 5.9.x y Prisma 7 con `moduleFormat = "cjs"` — sin eso NestJS no arranca.
- [Stack]: `jose` reemplaza `passport-azure-ad` (archivado); Nivo reemplaza ECharts.
- [Phase 01]: [01-05]: Sin @azure/msal-react (exige React >=19.2.1) — MSAL Browser v5 directo desde state.tsx
- [Phase 01]: [01-05]: sessionStatus de /api/me gobierna el arbol de render; el 401 se maneja una vez en el cliente API
- [Phase 01]: [01-05]: Tipos del API a mano (4 interfaces); codegen OpenAPI aplazado a Fase 2
- [Phase 01-fundaci-n-segura-y-desplegada]: EnvModule global (zod + declaration merging) sustituye a ConfigModule; @nestjs/config no instalado — inyectar EnvService de src/config/env.ts
- [Phase 01-fundaci-n-segura-y-desplegada]: Sin setGlobalPrefix: los controladores declaran la ruta completa (@Controller('api/...')); /health queda en la raiz para Railway
- [Phase 01-fundaci-n-segura-y-desplegada]: Prisma 7 prohibe url en el bloque datasource: la URL de migraciones vive en backend/prisma.config.ts (raiz del paquete, unico sitio que auto-descubre)
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-02]: users y access_requests SIN politica RLS: el guard busca por entra_oid fuera de la transaccion, una politica ahi bloquearia el login
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-02]: PrismaService.base/.client devuelven el Proxy de Prisma; dentro de la clase this NO expone los delegados de modelo
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-02]: transicion multi-tabla valida bajo concurrencia bloqueando primero la nota semanal (raiz del agregado), despues las entradas
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-03]: EntraGuard consulta users por entra_oid en CADA peticion (sin cache): desactivar corta en la siguiente peticion con el mismo token
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-03]: La escalada de roles y los dos anti-lockout viven en users.service (no en decoradores); los anti-lockout se evaluan antes que el permiso
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-03]: jose 6 es ESM-only: engines.node >=22.12 (require(esm)) y Jest transpila jose con allowJs + transformIgnorePatterns
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-07]: El modo dev conmuta el KEYSET en jwks.provider, nunca el guard: entra.guard.ts tiene 0 lineas de diff y el token de dev recorre la misma validacion
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-07]: DevAuthModule se REGISTRA o no segun env.DEV_AUTH_ENABLED: apagado la ruta responde 404 (no 401) y el par local ni se genera
- [Phase 01-fundaci-n-segura-y-desplegada]: [01-07]: El oid ficticio lleva prefijo dev: — el cutover al tenant real EXIGE UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%' o el primer login real falla en silencio
- [Phase 02-maestros-y-cat-logos]: [02-01]: daily_entries.concept_code sin FK a concepts: el enum ya lo constrine; una FK obligaria a leer el catalogo en cada escritura de bitacora sin ganar garantia
- [Phase 02-maestros-y-cat-logos]: [02-01]: onDelete Restrict explicito en las 12 FKs nuevas: el default SetNull de Prisma en relaciones opcionales vaciaria project_id de la bitacora en silencio
- [Phase 02-maestros-y-cat-logos]: [02-01]: Los catalogos NUNCA se truncan en tests: un TRUNCATE CASCADE se lleva los 8 conceptos que sembro la migracion y migrate deploy no los repone
- [Phase 02-maestros-y-cat-logos]: [02-01]: Los 8 conceptos son estructura y van en la MIGRACION (ON CONFLICT DO NOTHING), no en seed.ts: un deploy que olvide db:seed no puede dejar el catalogo vacio
- [Phase 02-maestros-y-cat-logos]: [02-01]: concepts sin politica de INSERT ni DELETE: ni el admin puede anadir o borrar un concepto (42501 / 0 filas). CAT-01 queda cerrado por MOTOR
- [Phase 02-maestros-y-cat-logos]: [02-01]: GRANT explicito a fava_app dentro de la migracion de RLS (contra la doctrina de 01-02): ALTER DEFAULT PRIVILEGES solo cubre las tablas creadas por ESE rol (Pitfall 7)
- [Phase 02-maestros-y-cat-logos]: [02-01]: La receta de migracion de este repo es migrate diff --from-config-datasource + migrate deploy: migrate dev aborta en entorno no interactivo y --from-url fue removido en Prisma 7
- [Phase 02-maestros-y-cat-logos]: [02-01]: Fase 5: el NIT: del encabezado de la Nota es el de FAVA (901137532-4), constante del membrete, NUNCA projects.client_nit
- [Phase 02-maestros-y-cat-logos]: [02-02]: El criterio 4 se demuestra por INTROSPECCION (information_schema + pg_enum), no por endpoint: un test de API prueba que ESE endpoint valida hoy; el catalogo del sistema prueba que ningun endpoint, script, seed ni consola de BD podra meter un valor fuera de la lista
- [Phase 02-maestros-y-cat-logos]: [02-02]: Los fallos de un test de introspeccion se afirman como LISTA de strings (expect(faltantes).toEqual([])), nunca como booleano: el mensaje tiene que nombrar la columna
- [Phase 02-maestros-y-cat-logos]: [02-02]: check:no-free-text NO se engancha a npm run build mientras salga rojo (4 hallazgos legitimos de mocks); engancharlo es una linea y es tarea de 02-06 cuando lo ponga en verde
- [Phase 02-maestros-y-cat-logos]: [02-02]: El DDL sobre la base local esta denegado por el sandbox: la verificacion en rojo de un test table-driven se hace anadiendo una fila falsa a la tabla de casos, no rompiendo el esquema
- [Phase 02-maestros-y-cat-logos]: [02-04]: La regla de escalada se extrae a exigirSuperParaAdmins y la comparten asignarRoles y crear: una condicion, dos caminos, imposible relajar uno solo
- [Phase 02-maestros-y-cat-logos]: [02-04]: Prisma 7 con driver adapter NO rellena meta.target: el nombre de la restriccion violada solo viaja en meta.driverAdapterError.cause.originalMessage (mensaje traducido, identificador no)
- [Phase 02-maestros-y-cat-logos]: [02-04]: app.technician_id ya se puede poblar y esta probado end-to-end (endpoint -> columna -> guard -> interceptor -> politica): un tecnico sin vinculo ve CERO registros, no un error
- [Phase 02]: [02-03]: @Roles restrictivo en la CLASE y relajado en el metodo que lo necesita (el guard hace getAllAndOverride): el olvido del decorador en un endpoint futuro cae del lado seguro, no queda abierto
- [Phase 02]: [02-03]: El duplicado se detecta con un findUnique PREVIO, no capturando P2002: un error del motor aborta la transaccion-por-peticion y el SELECT que distingue YA_EXISTE de YA_EXISTE_INACTIVO ya no se podria ejecutar
- [Phase 02]: [02-03]: Traduccion Prisma->HTTP obligatoria en todo servicio nuevo (P2002->409, P2003->400, P2025->404): sin ella un id inexistente o un FK roto salen como 500
- [Phase 02]: [02-03]: GET /api/catalogs es el contrato cerrado que consume la Fase 3 y 02-06; los listados NO filtran por isActive (filtran los selectores del cliente)
- [Phase 02]: [02-03]: Las suites e2e de la fase NO se pueden correr en paralelo contra el mismo Postgres: truncateAll() es global y sin aislamiento por suite; ante un fallo asi se reejecuta, no se edita el test
- [Phase 02]: [02-06]: El delta invertido del prototipo se BORRA, no se corrige de signo: el servidor manda delta en cada fila y en la respuesta del PUT, asi que la unica resta del repo sigue en sold-days.service.ts
- [Phase 02]: [02-06]: Ninguna lista de dominio se carga en el arranque de la sesion: GET /api/projects es A·S y un tecnico habria recibido 403 al entrar. Cada pantalla carga lo suyo (state.dataVersion + refresh())
- [Phase 02]: [02-06]: Los tipos del API viven junto a su cliente en lib/api/*.ts, que es donde esta el contrato; types.ts se queda con los tipos de interfaz
- [Phase 02]: [02-06]: check:no-free-text esta enganchado a npm run build (raiz): un input de concepto/rol/moneda o un mock de vuelta tumban el deploy de Railway en el primer paso
- [Phase 02]: [02-06]: LogDayDrawer sigue con mock a proposito: la Fase 3 tiene que RELAJAR el @Roles del GET /api/projects a T, no crear un endpoint nuevo

### Pending Todos

Ninguno. (.planning/todos/ aún no existe)

### Blockers/Concerns

Decisiones abiertas con FAVA — detalle y fase que bloquean en ROADMAP.md § "Decisiones abiertas con FAVA":

- [Phase 3] ¿Un MD puede repartirse entre 2 proyectos? Define si UNIQUE(técnico, fecha) debe relajarse.
- [Phase 4] ¿Se aprueba una nota sin firma del cliente? Define las reglas de validación del submit.
- [Phase 5] ¿Existe PDF rellenable (AcroForm)? Es un correo de 30 minutos que cambia toda la implementación del PDF.
- [Phase 7] Denominador de utilización (LR/NR/IL) — define si el KPI titular es defendible.
- [Phase 8] ¿Railway es mandato o IT de FAVA exige Azure? CONTEXTO §12 está escrito para Azure.

Riesgo técnico:
- ~~[Phase 1] Prisma 7 + RLS + `$transaction()` interactivo~~ — **cerrado por 01-02**: 200 transiciones multi-tabla concurrentes sobre un pool de 10, sin P2028 ni fuga de GUC (`test/rls-transaction.e2e-spec.ts`). Pendiente repetir una version reducida ya desplegado (Plan 01-06).
- [Phase 1] Railway no debe entregar al runtime una `DATABASE_URL` de superusuario: un superusuario se salta RLS **incluso con FORCE** y sin ningún síntoma. Verificar en el Plan 01-06.
- [Phase 2] **Pitfall 7 mitigado, no cerrado.** El `GRANT` dentro de `20260726123024_rls_maestros` cubre el caso en que `db:bootstrap` y `migrate deploy` los corra un rol distinto (las 8 tablas nuevas nacerían sin permisos y la app daría `permission denied for table projects` justo tras un deploy exitoso). Confirmarlo en Railway exige un `GET /api/projects` autenticado en el smoke — dueño: el plan que amplíe `scripts/smoke.ts`.
- ~~[Phase 2] `frontend/src/screens/Kpis.tsx` romperá el build cuando `types.ts` deje de ser el contrato~~ — **cerrado por 02-06**: la pantalla lleva su propio mock con la forma nueva (filas rol × fase) y `npm run build` es verde.
- [Phase 2] **Las suites e2e no están aisladas entre procesos.** `truncateAll()` vacía `users` global, así que dos agentes (o un CI con `--maxWorkers>1`) sobre la misma base se tumban tests mutuamente: en 02-03 pasó tres veces (7 fallos en `catalogs`, 2 en `users-invite`, 1 build sin error de tsc) y las tres se resolvieron re-ejecutando, sin tocar código. Dentro de un proceso `--runInBand` ya lo cubre; entre procesos hace falta base por worker — dueño: el plan que monte el CI de la fase.
- [Phase 2] `gsd-tools roadmap update-plan-progress` responde `updated: true` pero **no escribe** la fila de la tabla de progreso (verificado dos veces en 02-03: `summary_count: 4`, fila intacta en `2/6`), y `state advance-plan` falla siempre en este repo porque busca los campos `Current Plan` / `Total Plans in Phase` y el STATE.md usa `Plan: N of M`. Los dos se están supliendo a mano en cada plan.

Nota de inventario:
- REQUIREMENTS.md declaraba 38 requisitos v1; el conteo real por ID es 41. Corregido en la sección Traceability.
- [Phase 1] Mientras DEV_AUTH_ENABLED este encendido, quien conozca la contrasena compartida entra como CUALQUIER email dado de alta (incluido el Super Admin): no meter datos reales hasta el cutover al tenant de FAVA (docs/ENV.md)

## Session Continuity

Last session: 2026-07-26T18:09:28.489Z
Stopped at: Completado 02-06-PLAN.md (cutover de frontend: fase 2 con sus 6 planes ejecutados)
Resume file: None
