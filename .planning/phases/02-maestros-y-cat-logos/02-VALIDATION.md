---
phase: 2
slug: maestros-y-cat-logos
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-25
updated: 2026-07-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detalle completo del mapa requisito → test en `02-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + `@nestjs/testing` + `supertest` (ya configurado en Fase 1) |
| **Config file** | `backend/package.json` (unit) + `backend/test/jest-e2e.json` (e2e, `--runInBand`) |
| **Quick run command** | `cd fava-control-tecnico && npm -w backend run test` |
| **Full suite command** | `cd fava-control-tecnico && npm -w backend run test && npm -w backend run test:e2e` |
| **Frontend** | Sin runner (decisión de Fase 1): `npm run build` (incluye `tsc`) + script de repo `check-no-free-text.mjs` |
| **Estimated runtime** | unit < 15 s · e2e ~60-90 s |

Base de datos: Postgres 17 local en el puerto 55432 (`db:bootstrap` + `db:migrate` corridos).

---

## Sampling Rate

- **After every task commit:** `npm -w backend run test`
- **After every plan wave:** suite completa (unit + e2e) + `npm run build` en la raíz
- **Before `/gsd:verify-work`:** suite completa verde + build verde + `check-no-free-text.mjs` verde
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

El mapa autoritativo requisito → comportamiento → comando está en `02-RESEARCH.md`
§ Validation Architecture (24 comportamientos sobre CAT-01..CAT-05). Aquí, el mapa por tarea:

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | CAT-01..05 | migración + build | `prisma migrate deploy && npm -w backend run build` | ❌ la task lo crea | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | CAT-01 | e2e (RLS de maestros) | `npm -w backend run test:e2e -- rls-maestros` | ❌ la task lo crea | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | CAT-01..05 | e2e (suites de Fase 1 siguen verdes tras los FKs) | `npm -w backend run test:e2e` | ✅ existen | ⬜ pending |
| 02-01-T4 | 02-01 | 1 | CAT-01 | e2e (8 conceptos sembrados) | `npm -w backend run test:e2e -- catalogs` | ❌ la task lo crea | ⬜ pending |
| 02-02-T1 | 02-02 | 2 | CAT-01 | e2e (introspección: FKs y enum) | `npm -w backend run test:e2e -- no-free-text` | ❌ la task lo crea | ⬜ pending |
| 02-02-T2 | 02-02 | 2 | CAT-01 | e2e (API rechaza valores fuera de catálogo) | `npm -w backend run test:e2e -- no-free-text` | ❌ la task lo crea | ⬜ pending |
| 02-02-T3 | 02-02 | 2 | CAT-01 | script de repo (7 pantallas sin input libre) | `node scripts/check-no-free-text.mjs` | ❌ la task lo crea | ⬜ pending |
| 02-03-T1 | 02-03 | 2 | CAT-01 | e2e | `npm -w backend run test:e2e -- catalogs` | ❌ la task lo crea | ⬜ pending |
| 02-03-T2 | 02-03 | 2 | CAT-01 | e2e (etiquetas: Admin 403, Super 200) | `npm -w backend run test:e2e -- catalogs` | ❌ | ⬜ pending |
| 02-03-T3 | 02-03 | 2 | CAT-02 | e2e (técnico sin Entra, desactivar conserva historia) | `npm -w backend run test:e2e -- technicians` | ❌ la task lo crea | ⬜ pending |
| 02-04-T1 | 02-04 | 2 | CAT-05 | e2e (invitar + escalada) | `npm -w backend run test:e2e -- users-invite` | ❌ la task lo crea | ⬜ pending |
| 02-04-T2 | 02-04 | 2 | CAT-05 | e2e (vínculo usuario↔técnico → /api/me) | `npm -w backend run test:e2e -- users-invite` | ❌ | ⬜ pending |
| 02-04-T3 | 02-04 | 2 | CAT-05 | e2e (reasignar técnico vinculado → 409) | `npm -w backend run test:e2e -- users-invite` | ❌ | ⬜ pending |
| 02-05-T1 | 02-05 | 3 | CAT-03 | e2e (7 campos del encabezado, Decimal como number) | `npm -w backend run test:e2e -- projects` | ❌ la task lo crea | ⬜ pending |
| 02-05-T2 | 02-05 | 3 | CAT-03 | e2e (máquinas: PUT reemplaza, quitar con jornadas) | `npm -w backend run test:e2e -- projects.machines` | ❌ | ⬜ pending |
| 02-05-T3 | 02-05 | 3 | CAT-04 | e2e (delta = sold − executed, sin campo delta) | `npm -w backend run test:e2e -- sold-days` | ❌ la task lo crea | ⬜ pending |
| 02-05-T4 | 02-05 | 3 | CAT-04 | e2e (idempotencia de celda, bucket «sin fase») | `npm -w backend run test:e2e -- sold-days` | ❌ | ⬜ pending |
| 02-06-T1 | 02-06 | 4 | CAT-01, CAT-02, CAT-05 | build + script | `npm run build && node scripts/check-no-free-text.mjs` | dep: 02-02 | ⬜ pending |
| 02-06-T2 | 02-06 | 4 | CAT-03, CAT-04 | build + script | `npm run build && node scripts/check-no-free-text.mjs` | dep: 02-02 | ⬜ pending |
| 02-06-T3 | 02-06 | 4 | CAT-01..05 | build (Kpis.tsx compila con tipos nuevos) | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Toda la infraestructura de test de esta fase es nueva. Tres trampas heredadas de la Fase 1 que hay
que resolver **antes** de escribir tests nuevos (detalle en `02-RESEARCH.md`):

- [ ] `test/helpers/db.ts` → `truncateAll()` tiene la lista de tablas cableada: hay que ampliarla con las tablas nuevas o los tests arrastrarán estado
- [ ] `TEC_A` / `TEC_B` de los helpers no existen como filas de `technicians`: al añadir el FK desde `daily_entries` romperán las suites verdes de la Fase 1
- [ ] `Kpis.tsx` rompe `tsc` cuando cambien los tipos de proyecto — el build del frontend es parte de la verificación
- [ ] `scripts/check-no-free-text.mjs` — script de repo nuevo (criterio 4: ninguna de las 7 pantallas del cutover alimenta concepto/rol/moneda desde un `<input>` libre)
- [ ] Fixtures de catálogos sembrados por migración (8 conceptos, roles, monedas) disponibles para los e2e

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Autoguardado por celda: indicador visual y reversión al fallar | CAT-04 | Sin runner de frontend; es comportamiento visual | Editar una celda con el backend caído → la celda revierte y avisa |
| Las 5 pantallas del cutover muestran datos reales | CAT-01..05 | Requiere navegar la app desplegada | Recorrer Proyectos, Detalle, Técnicos, Usuarios y Config con datos sembrados |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
