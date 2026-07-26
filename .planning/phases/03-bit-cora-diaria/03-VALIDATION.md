---
phase: 3
slug: bit-cora-diaria
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-26
---

# Phase 3 — Validation Strategy

> El mapa autoritativo requisito → comportamiento → comando está en
> `03-RESEARCH.md` § Validation Architecture. Aquí, la infraestructura y las trampas.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework backend** | Jest 30 + `@nestjs/testing` + `supertest` (ya configurado) |
| **Framework frontend** | `node --import tsx --test <fichero>.ts` — **verificado funcionando, cero dependencias nuevas** (`tsx` ya está hoisted por los workspaces). Primera vez que el frontend tiene tests |
| **Quick run command** | `cd fava-control-tecnico && npm -w backend run test` |
| **Full suite command** | `npm -w backend run test && npm -w backend run test:e2e && npm run build` |
| **Estimated runtime** | unit < 15 s · e2e ~90-120 s |

Base de datos: Postgres 17 local en el puerto 55432, con la migración de esta fase aplicada.

---

## Sampling Rate

- **After every task commit:** `npm -w backend run test`
- **After every plan wave:** suite completa + `npm run build` (que incluye `check:no-free-text`)
- **Before `/gsd:verify-work`:** todo verde
- **Max feedback latency:** 120 seconds

---

## Trampas de esta fase (verificadas, no supuestas)

Tres cosas que harían pasar un test sin probar nada:

1. **`TZ=x jest` NO cambia el huso en este entorno.** Deja `process.env.TZ` en `undefined` y el offset en 300 (Bogotá): una suite «de 4 husos» correría cuatro veces en el mismo huso y saldría verde. Lo que sí funciona es **asignar `process.env.TZ` en runtime**, y admite varios cambios dentro del mismo proceso → un `describe.each` de 4 husos en una sola suite.

2. **El bug de fecha es invisible donde uno lo miraría.** `new Date(y, m-1, d)` escribe el día correcto en Bogotá (la máquina del dev) **y en UTC (Railway)**, y el día anterior en Roma y Kiritimati. O sea: el entorno de desarrollo y el de producción **ambos ocultan el fallo**. Solo lo caza el test con husos forzados o un guarda-rail de repo que prohíba `toISOString()` para fechas de trabajo.

3. **`scripts/check-no-free-text.mjs` no cubre `Week.tsx` ni `LogDayDrawer.tsx`.** Su lista de archivos es fija. La fase puede cerrarse con los mocks dentro y el build en verde si nadie la amplía — **ampliarla es obligatorio en esta fase**.

---

## Per-Task Verification Map

Lo completa el planner. Cobertura mínima exigida por criterio:

| Criterio | Comportamiento | Tipo |
|---|---|---|
| 1 (BIT-01) | 7 días con proyecto, máquina, concepto, fase y descripción; recargar devuelve lo mismo | e2e |
| 2 (BIT-02) | La misma fecha de trabajo se guarda y se lee igual en 4 husos (incluido uno al este de UTC y uno extremo) | e2e con `process.env.TZ` en runtime |
| 2 (BIT-02) | Dos registros para la misma fecha son imposibles | e2e + restricción única |
| 3 (BIT-03) | LR/NR/IL sin proyecto → aceptado; DC/MD/DFD/DVSF/DVRC sin proyecto → rechazado por el CHECK | e2e + introspección de `pg_constraint` |
| 4 (BIT-04) | N envíos concurrentes del mismo día → 1 fila, 0 errores | e2e de concurrencia |
| 4 (BIT-04) | El borrador local sobrevive al cierre del navegador | unit de frontend (`node --test`) |
| 5 | `Week.tsx` y `LogDayDrawer.tsx` sin imports de `data.ts`; el guarda-rail los cubre | build + script ampliado |

---

## Wave 0 Requirements

- [ ] Migración: columna `description` + CHECK por concepto + GRANT (receta `migrate diff` → `migrate deploy`; `migrate dev` aborta aquí)
- [ ] Ampliar `scripts/check-no-free-text.mjs` con `Week.tsx` y `LogDayDrawer.tsx`
- [ ] Helper de husos que asigna `process.env.TZ` en runtime (el patrón `TZ=x jest` no sirve)
- [ ] Runner de tests de frontend vía `node --import tsx --test` (sin dependencias nuevas)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Captura real desde un móvil en la app desplegada | BIT-01, BIT-04 | Requiere dispositivo y red intermitente | Llenar 3 días, cerrar el navegador, reabrir y comprobar el borrador |
| Aviso de conflicto borrador vs. servidor | BIT-04 | Requiere provocar divergencia entre dos dispositivos | Registrar un día en escritorio con borrador local pendiente en móvil |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
