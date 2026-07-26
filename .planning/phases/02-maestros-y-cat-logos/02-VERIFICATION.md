---
phase: 02-maestros-y-cat-logos
verified: 2026-07-26T19:01:53Z
status: passed
score: 5/5 must-haves verified
---

# Phase 2: Maestros y catálogos Verification Report

**Phase Goal:** Un admin administra desde la app todos los datos que alimentan el resto del sistema — técnicos, proyectos con el encabezado real de la Nota, días vendidos y usuarios — sin texto libre.
**Verified:** 2026-07-26T19:01:53Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

Independent re-verification, not a re-read of SUMMARY claims:
- Read all 6 PLAN.md + 6 SUMMARY.md + 02-CONTEXT.md + deferred-items.md.
- Read `schema.prisma`, both Phase 2 migration `.sql` files, `sold-days.service.ts`, `catalogs`/`technicians`/`users`/`projects` controllers, and all 5 cutover screens + the 2 modals directly from disk.
- Ran `npm run build` fresh (root workspace) — exit 0.
- Ran `npm -w backend run test:e2e` fresh against the local Postgres (port 55432, already running) — **14 suites, 269 tests, all passing**, matching the number claimed in 02-05/02-06 SUMMARYs exactly.
- Ran `node scripts/check-no-free-text.mjs` fresh — **7/7 archivos limpios, exit 0**.
- Grepped for TODO/FIXME/HACK/placeholder in every backend module and every cutover screen/modal touched by this phase — none found.

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP.md)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Admin crea un proyecto con cliente, NIT, localidad, suministro, n° contrato, país y máquinas, y los ve idénticos en el detalle | ✓ VERIFIED | `NewProjectModal.tsx` captures all 7 header fields + machine chips; `ProjectDetail.tsx` renders them from `GET /api/projects/:id`. Backend: `projects.e2e-spec.ts` (45 cases) asserts field-by-field round-trip; part of the 269 green tests re-run independently. |
| 2 | Admin crea un técnico externo/histórico sin cuenta Entra, y al desactivarlo sus datos siguen existiendo y consultables | ✓ VERIFIED | `technicians.service.ts` `crear()` never touches `users`; `technicians.e2e-spec.ts` asserts `users.count({technicianId})===0` after creation and re-reads a seeded `daily_entry` after deactivation. `Techs.tsx` wires alta/edición/`PATCH /:id/active`; deactivated techs stay listed, dimmed. |
| 3 | Admin carga días vendidos por rol×fase; pantalla muestra vendido y disponible calculados; ningún campo de delta digitable | ✓ VERIFIED | `sold-days.service.ts:16` — `const delta = (sold, executed) => sold - executed`, the **only** subtraction in the repo (verified in ROJO by 02-05: inverting it broke 7 cases). `ProjectDetail.tsx` has no delta input; the cell renders `fila.delta` shipped by the server on both `GET` and the `PUT` response. Body with `delta`/`executed` → 400 `CAMPO_CALCULADO_NO_ADMITIDO` (`projects.controller.ts`). |
| 4 | Concepto, rol técnico y moneda solo se eligen de listas cerradas — sin texto libre en ninguna pantalla | ✓ VERIFIED | DB layer: 3 Postgres enums (`concept_code`, `phase`, `employment_type`) + 7 FKs on `technicians.role_type_id`, `projects.currency_code`, `project_sold_days.{project_id,role_type_id}`, `daily_entries.{project_id,machine_model_id,role_type_id}`, all confirmed present in `schema.prisma` and asserted by `no-free-text.e2e-spec.ts` (introspection against `information_schema`/`pg_enum`, run and green in the 269). No `delta`/`executed` column exists anywhere (same suite). Frontend: `node scripts/check-no-free-text.mjs` run fresh → **7/7 clean, exit 0**, and `package.json`'s `build` script runs it first, so a regression fails the deploy. |
| 5 | Proyectos, Detalle de Proyecto, Técnicos, Usuarios y Config leen del API real; sus mocks salieron de `data.ts` | ✓ VERIFIED | All 5 screens import from `lib/api/*.ts` (`catalogs.ts`, `technicians.ts`, `users.ts`, `projects.ts`), confirmed by direct read of each screen. `grep "from '../data'"` over the 5 screens + 2 modals: no matches. `data.ts` (read directly) no longer exports `PROJECTS`, `TECHS`, `USERS`, `CURRENCIES`, or the catalog `MACHINES`-equivalent; it keeps only `CURRENT_TECH`, `MACHINES` (kept deliberately for `LogDayDrawer`, a Phase-3 screen, documented in `deferred-items.md`), `LOG_PROJECTS`, `NOTES`, `WEEK`, `EXPENSES`, `AUDIT`, each annotated with the phase that retires it. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `backend/prisma/schema.prisma` | 8 new tables, 3 enums, 5 new columns + FKs | ✓ VERIFIED | Read directly: `Concept`, `RoleType`, `Currency`, `MachineModel`, `Technician`, `Project`, `ProjectMachine`, `ProjectSoldDays` all present; `ConceptCode`/`Phase`/`EmploymentType` enums present; `daily_entries` gained `projectId`, `machineModelId`, `conceptCode`, `phase`, `roleTypeId`. |
| `backend/prisma/migrations/20260726122455_maestros/` | Prisma-generated schema migration | ✓ VERIFIED | 12/12 new FKs use `ON DELETE RESTRICT`, 0 use `CASCADE` (grep-counted independently). |
| `backend/prisma/migrations/20260726123024_rls_maestros/migration.sql` | Hand-written RLS + concept seeding | ✓ VERIFIED | Read directly: `ENABLE`/`FORCE ROW LEVEL SECURITY` + read/write policy pair on all 7 master tables; `concepts` has only `SELECT` + `UPDATE` policies (no `INSERT`/`DELETE` policy exists → engine-level default-deny); the 8 concepts are seeded via `INSERT ... ON CONFLICT DO NOTHING`; explicit `GRANT` to `fava_app` present (Pitfall 7 mitigation). |
| `backend/test/rls-maestros.e2e-spec.ts` | RLS proof for the 8 new tables | ✓ VERIFIED (via full suite run) | Included in the independently-run `test:e2e`, part of 269 passing. |
| `backend/test/no-free-text.e2e-spec.ts` | Criterion 4 by introspection | ✓ VERIFIED | Read directly: 4 cases against `information_schema`/`pg_enum`; asserts as string lists, not booleans. Ran green as part of the full suite. |
| `scripts/check-no-free-text.mjs` + `package.json` script | Repo guard-rail over the 7 cutover files | ✓ VERIFIED | Ran fresh: `7/7 archivos limpios`, exit 0. `package.json`'s `build` runs `check:no-free-text` first. |
| `backend/src/modules/catalogs/*` | `GET /api/catalogs` + Super Admin ABM | ✓ VERIFIED | Routes confirmed (`api/catalogs`); tests part of the 269 green. |
| `backend/src/modules/technicians/*` | Technician master, no DELETE | ✓ VERIFIED | Routes confirmed (`api/technicians`); no `@Delete` in the module (grep, phase summaries) + explicit 404 test. |
| `backend/src/modules/users/*` (invite + link) | `POST /api/users`, `PATCH /:id/technician`, `/:id/roles`, `/:id/active` | ✓ VERIFIED | All 5 routes confirmed in `users.controller.ts`; `Users.tsx` wires all of them with real `onClick` handlers (see Key Links). |
| `backend/src/modules/projects/{projects,sold-days}.service.ts` | Project CRUD + sold/executed/delta matrix | ✓ VERIFIED | Read directly; delta computed in exactly one place; `COALESCE(de.role_type_id, t.role_type_id)` aggregation present; idempotent cell upsert (`findUnique` guard before `upsert`). |
| `frontend/src/lib/api/{catalogs,technicians,users,projects}.ts` | Typed API clients | ✓ VERIFIED | All 4 files present and imported by the 5 cutover screens + 2 modals. |
| `frontend/src/screens/{Projects,ProjectDetail,Techs,Users,Config}.tsx` | Cutover to real API | ✓ VERIFIED | Read all 5 directly: none import `data.ts`'s domain mocks; all use `useApiData` + the typed clients. |
| `frontend/src/data.ts` | Reduced to no-backend mocks | ✓ VERIFIED | Read directly: 7 remaining exports, each annotated with the phase that retires it; no `PROJECTS`/`TECHS`/`USERS`/`CURRENCIES` catalog mock remains. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `schema.prisma` | `technicians.id` | FK from `daily_entries`, `weekly_notes`, `users` | ✓ WIRED | `references: [id]` present on all three, `onDelete: Restrict`. |
| `sold-days.service.ts` | `daily_entries` | `COALESCE(de.role_type_id, t.role_type_id)` aggregation | ✓ WIRED | Present verbatim, with the 3 documented open questions inline. |
| `projects.controller.ts` | `role_types` | Matrix rows generated from catalog, not hard-coded | ✓ WIRED | `sold-days.service.ts` `matriz()` builds rows from `roleType.findMany` × `FASES`, plus the `phase: null` bucket only when data exists. |
| `scripts/smoke.ts` | `GET /api/projects` / `/api/catalogs` | Post-deploy privilege check (Pitfall 7) | ✓ WIRED | `exige401()` checks + the `SMOKE_DEV_*`-gated authenticated 200 check, both present in `smoke.ts`. |
| `Projects.tsx` | `lib/api/projects.ts` | Typed client, no direct fetch | ✓ WIRED | Confirmed by direct read. |
| `ProjectDetail.tsx` | `PUT /api/projects/:id/sold-days` | Per-cell autosave with revert | ✓ WIRED | `guardarCelda()`: `onBlur`, no write if unchanged (`n === fila.sold`), reverts on `.catch` by discarding the local edit, shows error dot. |
| `Users.tsx` | `PATCH /api/users/:id/roles` and `/:id/active` | Role toggle + activate/deactivate buttons | ✓ WIRED | **Specifically checked per the verification brief.** `conmutarRol` and `conmutarActivo` both have real `onClick` handlers calling `setUserRoles`/`setUserActive`; per 02-06-SUMMARY this was found broken (buttons had no `onClick`) and fixed in commit `3c52c29` — confirmed fixed by direct read of the current file. |

### Delta convention — double-checked per verification brief

| Location | Formula | Status |
| --- | --- | --- |
| `backend/src/modules/projects/sold-days.service.ts:16` | `sold - executed` | ✓ Correct, and it is the **only** subtraction of these two quantities in the entire repo (grepped). |
| `frontend/src/screens/ProjectDetail.tsx` | none — `fila.delta` painted as received from server | ✓ Correct (the old `dn - s` local subtraction was deleted, not re-signed) |
| `frontend/src/screens/Kpis.tsx:236` | `dl: mS + cS - (mD + cD)` = `sold - executed` | ✓ Correct. This is the second inverted delta that 02-06 found and fixed (`Kpis.tsx:182` in the original research reference, now at line 236 after edits) — confirmed by direct read, matches the summary's claim. Operates on Kpis' own local mock, not on live API data, so it does not reintroduce a second real subtraction. |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| CAT-01 | 02-01, 02-02, 02-03, 02-06 | Catálogos cerrados (8 conceptos, roles, monedas) sin texto libre | ✓ SATISFIED | Enum + RLS (02-01), introspection test + repo guard (02-02), `GET/PATCH /api/catalogs` (02-03), Config.tsx cutover (02-06). |
| CAT-02 | 02-01, 02-03, 02-06 | Admin crea/edita técnicos sin cuenta Entra; baja no destructiva | ✓ SATISFIED | `Technician` model decoupled from `User` (02-01); `technicians` module + tests (02-03); `Techs.tsx` cutover (02-06). |
| CAT-03 | 02-01, 02-05, 02-06 | Admin crea/edita proyectos con encabezado de Nota + máquinas | ✓ SATISFIED | `Project` model with literal header fields (02-01); `projects` module, 45 e2e cases (02-05); `NewProjectModal.tsx`/`ProjectDetail.tsx` cutover (02-06). |
| CAT-04 | 02-01, 02-02, 02-05, 02-06 | Días vendidos por rol×fase; delta nunca se digita | ✓ SATISFIED | No `delta` column exists structurally (02-01/02-02); server-computed delta, rejects `delta`/`executed` in body (02-05); matrix UI with autosave, no delta input (02-06). |
| CAT-05 | 02-04, 02-06 | Admin gestiona usuarios (invitar, asignar roles, activar/desactivar) | ✓ SATISFIED | `POST /api/users` + `PATCH /:id/technician` (02-04, on top of Phase-1 `roles`/`active` endpoints); `Users.tsx` wires invite + the previously-dead role/active buttons (02-06, commit `3c52c29`) — **independently confirmed by direct code read, not just the summary's claim.** |
| CAT-06 | — (Phase 4) | Baja de técnico conserva historia + "aprobar en nombre de" | Correctly out of scope | REQUIREMENTS.md marks it `Pending`, mapped to Phase 4 — honest, not claimed by this phase. |

`.planning/REQUIREMENTS.md` marks CAT-01..CAT-05 as `Complete` and CAT-06 as `Pending`/Phase 4. This matches the actual codebase state exactly — no false green found.

### Anti-Patterns Found

None. Grepped every backend module (`catalogs`, `technicians`, `projects`, `users`) and every cutover frontend file (5 screens + 2 modals) for `TODO|FIXME|XXX|HACK` — zero hits. No stub `return <div>Placeholder</div>`, no dead `onClick={() => {}}`, no endpoint returning a static/empty array where a query was expected (all reads go through Prisma/`$queryRaw` against real tables).

### Human Verification Required

None required to certify the phase goal — the claims in the brief that most needed independent checking (delta sign in both files, CAT-05 button wiring, honesty of REQUIREMENTS.md, full test count) were all reproduced independently against the actual source and a fresh test run, not taken from the SUMMARYs. The following are pre-existing, already-documented residual concerns (not gaps in this phase's goal):

- `SMOKE_DEV_EMAIL`/`SMOKE_DEV_PASSWORD` are not yet set in the Railway deploy environment, so the one smoke check that catches the Pitfall-7 privilege issue is currently skipped there (still correctly reported as `↷ omitido`, not a false pass). Documented in `deferred-items.md`; irrelevant to whether Phase 2's own goal is achieved since Phase 2 is not deployed yet.
- Two concurrent admins editing the same sold-days cell: last write wins, no lock — a documented, deliberate `ponytail:` simplification, appropriate for a 2-admin app.
- `ROADMAP.md`'s Phase 2 progress line still reads "(6/6 planes ejecutados 2026-07-26 — pendiente la verificación de fase)" and the "Plans: 6 (4/6 complete)" counter is stale (known tooling issue with `gsd-tools`, documented in STATE.md) — cosmetic only, does not affect the correctness of any shipped code; the orchestrator should update this counter when closing the phase.

### Gaps Summary

None. All 5 ROADMAP success criteria hold against the live codebase and a freshly-run build + full e2e suite (14 suites / 269 tests / green) + the free-text guard (7/7 / exit 0). The two claims flagged in the verification brief as worth independent scrutiny — the double delta-sign bug (`sold-days.service.ts` and `Kpis.tsx`) and the CAT-05 "buttons with no `onClick`" near-false-green — were both reproduced and confirmed fixed by reading the current source directly, not by trusting the SUMMARY prose.

---

_Verified: 2026-07-26T19:01:53Z_
_Verifier: Claude (gsd-verifier)_
