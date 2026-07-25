---
phase: 1
slug: fundaci-n-segura-y-desplegada
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-25
updated: 2026-07-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x (el que instala `@nestjs/cli@11`) + `@nestjs/testing` + `supertest` — decisión del planner: NO Vitest (los decoradores de Nest exigirían `unplugin-swc`; Jest viene configurado por el scaffold) |
| **Config file** | `backend/package.json` (unit) + `backend/test/jest-e2e.json` (e2e) — los crea Plan 01-01 (Wave 0) |
| **Quick run command** | `cd fava-control-tecnico && npm -w backend run test` |
| **Full suite command** | `cd fava-control-tecnico && npm -w backend run test && npm -w backend run test:e2e` (requiere `docker compose up -d db` + `db:bootstrap` corrido) |
| **Post-deploy** | `npm -w backend run smoke -- https://<dominio>.up.railway.app` |
| **Estimated runtime** | unit < 10 s · e2e ~30-60 s (incluye el test de concurrencia 2×100) |

**Frontend:** sin runner en Fase 1 (decisión del planner, alineada con research § Wave 0 Gaps: montar Vitest para testear un solo `apiFetch` es más código del que prueba). `apiFetch` y las pantallas de sesión se verifican por build (`tsc`) + checklist manual del Plan 01-06.

---

## Sampling Rate

- **After every task commit:** `npm -w backend run test` (unit, < 10 s)
- **After every plan wave:** full suite (unit + e2e contra el Postgres del compose)
- **After every deploy:** `npm -w backend run smoke -- <url>` — obligatorio: 3 de los 5 criterios solo son observables desplegados
- **Before `/gsd:verify-work`:** full suite verde + smoke verde + checklist manual de 3 cuentas
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | INFRA-01 | build | `npm install && npm -w backend run build` | ❌ W0 (la task lo crea) | ⬜ pending |
| 01-01-T2 | 01-01 | 1 | INFRA-01, INFRA-02 | script (idempotencia ×2) | `npm -w backend run db:bootstrap` ×2 + `prisma migrate deploy` + `db seed` | ❌ W0 | ⬜ pending |
| 01-01-T3 | 01-01 | 1 | INFRA-01 | e2e | `npm -w backend run test:e2e -- bootstrap` | ❌ la task crea el test | ⬜ pending |
| 01-02-T1 | 01-02 | 2 | AUTH-03 | migración + build | `prisma migrate deploy && npm -w backend run build` | dep: 01-01 | ⬜ pending |
| 01-02-T2 | 01-02 | 2 | AUTH-03 | e2e (rol fava_app real + aserción pg_class) | `npm -w backend run test:e2e -- rls-isolation` | ❌ la task crea el test | ⬜ pending |
| 01-02-T3 | 01-02 | 2 | AUTH-03, INFRA-02 | e2e (multi-tabla + concurrencia 2×100) | `npm -w backend run test:e2e -- rls-transaction` | ❌ la task crea el test | ⬜ pending |
| 01-03-T1 | 01-03 | 2 | AUTH-01 | unit (4 rechazos + vinculación) | `npm -w backend run test -- entra.guard` | ❌ la task crea el test | ⬜ pending |
| 01-03-T2 | 01-03 | 2 | AUTH-01, AUTH-04 | e2e | `npm -w backend run test:e2e -- auth && npm -w backend run test:e2e -- tenant-swap` | ❌ la task crea los tests | ⬜ pending |
| 01-03-T3 | 01-03 | 2 | AUTH-02 | e2e | `npm -w backend run test:e2e -- users-roles` | ❌ la task crea el test | ⬜ pending |
| 01-04-T1 | 01-04 | 1 | AUTH-01 | doc grep | `grep requestedAccessTokenVersion docs/ENTRA-SETUP.md` (+3 greps) | ❌ la task lo crea | ⬜ pending |
| 01-04-T2 | 01-04 | 1 | AUTH-01 | **manual** (checkpoint:human-action) | — registros en el tenant dev | — | ⬜ pending |
| 01-05-T1 | 01-05 | 1 | AUTH-01, INFRA-03 | build (dos entradas HTML) | `npm run build && grep -rq redirect dist/` | ❌ la task lo crea | ⬜ pending |
| 01-05-T2 | 01-05 | 1 | INFRA-03 | build + grep | `npm run build && grep api/me src/state.tsx && grep sessionStatus src/App.tsx` | ❌ | ⬜ pending |
| 01-05-T3 | 01-05 | 1 | INFRA-03 | build + grep | `npm run build && grep solicitar src/i18n.ts && grep access-requests src/screens/Users.tsx` | ❌ | ⬜ pending |
| 01-06-T1 | 01-06 | 3 | INFRA-02 | HTTP | `curl -sf https://<dominio>/health` | dep: deploy | ⬜ pending |
| 01-06-T2 | 01-06 | 3 | INFRA-02 | smoke (4 aserciones, incluye COOP ausente en /redirect.html) | `npm -w backend run smoke -- <url>` | ❌ la task lo crea | ⬜ pending |
| 01-06-T3 | 01-06 | 3 | AUTH-01, AUTH-04, INFRA-03 | **manual** (checkpoint:human-verify) | — checklist 3 cuentas | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Continuidad de muestreo: no hay 3 tareas consecutivas sin verify automatizado (los dos manuales — 01-04-T2 y 01-06-T3 — están aislados entre tareas automatizadas).

---

## Wave 0 Requirements

Cubiertos por Plan 01-01 (Wave 1 es el Wave 0 efectivo de esta fase — el backend no existía):

- [x] Framework de test del backend instalado y configurado (Jest del scaffold de Nest, sin watch mode) → 01-01-T3
- [x] Postgres local (docker-compose) con los dos roles (owner / app sin BYPASSRLS) reproducible por script → 01-01-T1/T2
- [x] Helpers de test: `test/helpers/db.ts` (owner+app clients, truncateAll, TEC_A/TEC_B) → 01-01-T3; `test/helpers/tokens.ts` (tokens firmados sin red) → 01-03-T1
- [x] Test e2e de RLS con dos técnicos sembrados y cross-read = 0 filas → 01-02-T2

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login Microsoft real en la URL de Railway | AUTH-01, INFRA-02, INFRA-03 | Flujo interactivo con Entra + deploy real | Plan 01-06 Task 3: checklist de 3 cuentas (invitada / no invitada / desactivada) |
| Página puente de redirección MSAL (COOP/CSP) | AUTH-01 | Comportamiento de navegador (el punto CSP es MEDIUM confidence — verificar con consola abierta) | Plan 01-06 Task 3: consola Chrome sin errores COOP/CSP; el smoke ya cubre la AUSENCIA de la cabecera COOP por máquina |
| Registros Entra + `ver: "2.0"` del token | AUTH-01 | Tenant del usuario, admin consent | Plan 01-04 Task 2 siguiendo ENTRA-SETUP.md |
| Baja en el directorio corta al expirar el token (60-90 min) | AUTH-04 | CAE fuera de alcance (Pitfall 7) — ventana documentada, no bug | Documentado en SUMMARY de 01-03; procedimiento operativo: desactivar en app Y directorio |
| `apiFetch` y pantallas de sesión del frontend | INFRA-03 | Sin runner frontend en Fase 1 (decisión: no montar Vitest para 4 interfaces) | Build `tsc` + checklist del Plan 01-06 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (2 checkpoints manuales justificados arriba)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 01-01 crea toda la infraestructura de test)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (unit <10 s; e2e ~30-60 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — pendiente de ejecución
