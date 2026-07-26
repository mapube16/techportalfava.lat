---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-07-26T01:53:23.856Z"
last_activity: "2026-07-25 — 01-07 completado: login de desarrollo temporal con el keyset conmutado y el EntraGuard sin tocar (0 líneas de diff)"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 7
  completed_plans: 5
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-25)

**Core value:** Captura única — el técnico registra el día una vez → Nota Semanal firmada + KPIs + control comercial salen solos.
**Current focus:** Phase 1 — Fundación segura y desplegada

## Current Position

Phase: 1 of 8 (Fundación segura y desplegada)
Plan: 7 of 7
Status: Executing
Last activity: 2026-07-25 — 01-07 completado: login de desarrollo temporal con el keyset conmutado y el EntraGuard sin tocar (0 líneas de diff)

Progress: [███████░░░] 71%

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

**Recent Trend:**
- Last 5 plans: 01-07 (50 min), 01-03 (45 min), 01-02 (15 min), 01-05 (55 min), 01-01 (31 min)
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

Nota de inventario:
- REQUIREMENTS.md declaraba 38 requisitos v1; el conteo real por ID es 41. Corregido en la sección Traceability.
- [Phase 1] Mientras DEV_AUTH_ENABLED este encendido, quien conozca la contrasena compartida entra como CUALQUIER email dado de alta (incluido el Super Admin): no meter datos reales hasta el cutover al tenant de FAVA (docs/ENV.md)

## Session Continuity

Last session: 2026-07-26T01:53:23.842Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-maestros-y-cat-logos/02-CONTEXT.md
