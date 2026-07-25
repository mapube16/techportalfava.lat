---
phase: 1
slug: fundaci-n-segura-y-desplegada
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend unit/e2e contra Postgres local) — a confirmar por el planner |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npm test -- --run` (backend) |
| **Full suite command** | `npm test -- --run` + smoke de deploy Railway |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| (filled by planner) | — | — | AUTH-01..04, INFRA-01..03 | — | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Framework de test del backend instalado y configurado (sin watch mode)
- [ ] Postgres local (docker-compose) con los dos roles (owner / app sin BYPASSRLS) reproducible por script
- [ ] Stub del test e2e de RLS: dos técnicos sembrados, conexión con rol app, cross-read = 0 filas

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login Microsoft real en la URL de Railway | AUTH-01, INFRA-02, INFRA-03 | Flujo interactivo con Entra + deploy real | Abrir URL pública → login con cuenta del tenant dev → Layout muestra nombre y rol del API |
| Página puente de redirección MSAL (COOP) | AUTH-01 | Comportamiento de navegador | Verificar login sin errores de consola COOP en Chrome |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
