# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-25)

**Core value:** Captura única — el técnico registra el día una vez → Nota Semanal firmada + KPIs + control comercial salen solos.
**Current focus:** Phase 1 — Fundación segura y desplegada

## Current Position

Phase: 1 of 8 (Fundación segura y desplegada)
Plan: — (sin planes aún)
Status: Ready to plan
Last activity: 2026-07-25 — Roadmap creado, 41 requisitos v1 mapeados a 8 fases

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
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

### Pending Todos

Ninguno. (.planning/todos/ aún no existe)

### Blockers/Concerns

Decisiones abiertas con FAVA — detalle y fase que bloquean en ROADMAP.md § "Decisiones abiertas con FAVA":

- [Phase 3] ¿Un MD puede repartirse entre 2 proyectos? Define si UNIQUE(técnico, fecha) debe relajarse.
- [Phase 4] ¿Se aprueba una nota sin firma del cliente? Define las reglas de validación del submit.
- [Phase 5] ¿Existe PDF rellenable (AcroForm)? Es un correo de 30 minutos que cambia toda la implementación del PDF.
- [Phase 7] Denominador de utilización (LR/NR/IL) — define si el KPI titular es defendible.
- [Phase 8] ¿Railway es mandato o IT de FAVA exige Azure? CONTEXTO §12 está escrito para Azure.

Riesgo técnico abierto:
- [Phase 1] Prisma 7 + RLS + `$transaction()` interactivo es una tensión documentada por Prisma. Prototipar la transición submit/approve multi-tabla antes de confiar en el patrón.

Nota de inventario:
- REQUIREMENTS.md declaraba 38 requisitos v1; el conteo real por ID es 41. Corregido en la sección Traceability.

## Session Continuity

Last session: 2026-07-25
Stopped at: ROADMAP.md y STATE.md escritos; traceability de REQUIREMENTS.md actualizada
Resume file: None
