---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completado 02-01-PLAN.md (esquema de maestros cerrado)
last_updated: "2026-07-26T12:50:55.683Z"
last_activity: "2026-07-26 — 02-01 completado: esquema de maestros cerrado (8 tablas, 3 enums, 12 FKs, RLS en las 8) y las 7 suites de la Fase 1 verdes sin editarlas"
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 13
  completed_plans: 6
  percent: 46
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-25)

**Core value:** Captura única — el técnico registra el día una vez → Nota Semanal firmada + KPIs + control comercial salen solos.
**Current focus:** Phase 2 — Maestros y catálogos

## Current Position

Phase: 2 of 8 (Maestros y catálogos)
Plan: 2 of 6
Status: Executing
Last activity: 2026-07-26 — 02-01 completado: esquema de maestros cerrado (8 tablas, 3 enums, 12 FKs, RLS en las 8) y las 7 suites de la Fase 1 verdes sin editarlas

Progress: [█████░░░░░] 46%

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

**Recent Trend:**
- Last 5 plans: 02-01 (33 min), 01-07 (50 min), 01-03 (45 min), 01-02 (15 min), 01-05 (55 min)
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
- [Phase 2] `frontend/src/screens/Kpis.tsx` romperá el build (`tsc && vite build`) cuando `types.ts` deje de ser el contrato del API. Salida de una línea documentada en `.planning/phases/02-maestros-y-cat-logos/deferred-items.md` — dueño: plan 02-06.

Nota de inventario:
- REQUIREMENTS.md declaraba 38 requisitos v1; el conteo real por ID es 41. Corregido en la sección Traceability.
- [Phase 1] Mientras DEV_AUTH_ENABLED este encendido, quien conozca la contrasena compartida entra como CUALQUIER email dado de alta (incluido el Super Admin): no meter datos reales hasta el cutover al tenant de FAVA (docs/ENV.md)

## Session Continuity

Last session: 2026-07-26T12:50:36.710Z
Stopped at: Completado 02-01-PLAN.md (esquema de maestros cerrado)
Resume file: .planning/phases/02-maestros-y-cat-logos/02-02-PLAN.md
