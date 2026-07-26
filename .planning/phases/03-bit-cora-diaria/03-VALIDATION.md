---
phase: 3
slug: bit-cora-diaria
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-26
updated: 2026-07-26
---

# Phase 3 — Validation Strategy

> El mapa autoritativo requisito → comportamiento → comando está en
> `03-RESEARCH.md` § Validation Architecture. Aquí, la infraestructura, las trampas y
> el reparto real por tarea que dejaron los 6 planes.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework backend** | Jest 30 + `@nestjs/testing` + `supertest` (ya configurado) |
| **Framework frontend** | `node --import tsx --test src/lib/fecha.test.ts src/lib/draft.test.ts` — **verificado funcionando, cero dependencias nuevas** (`tsx@4.23.1` ya está hoisted por los workspaces). Lo crea el plan **03-02** y queda enganchado a `npm -w frontend run build` |
| **Quick run command** | `npm -w backend run test` (unit) · `npm -w frontend run test` |
| **Full suite command** | `npm -w backend run test && npm -w backend run test:e2e && npm run build` |
| **Estimated runtime** | unit < 15 s · e2e ~90-150 s (16 suites al cerrar la fase) |

Base de datos: Postgres 17 local en el puerto 55432, con la migración de esta fase
(`<ts>_bitacora`, plan 03-01) aplicada. `npm -w backend run db:seed` después de cada
pasada completa: `truncateAll()` se lleva al Super Admin.

**Los ficheros por nombre y no por glob** en el runner del frontend: `npm` lanza los
scripts por `cmd.exe` en Windows (no expande globs) y las reglas de descubrimiento de
`node --test` para `.ts` dependen de la minor de Node.

---

## Sampling Rate

- **Por commit de tarea:** el `<automated>` de la tarea + `tsc --noEmit` en el workspace tocado
- **Por merge de wave:** `npm -w backend run test:e2e` completo (`--runInBand`, **sin paralelizar entre procesos**) + `npm run build` (arrastra los dos guarda-raíles) + `npm -w frontend run test`
- **Puerta de fase:** todo lo anterior en verde + `npm -w backend run db:seed`
- **Max feedback latency:** 150 seconds

---

## Trampas de esta fase (verificadas, no supuestas)

Tres cosas que harían pasar un test sin probar nada:

1. **`TZ=x jest` NO cambia el huso en este entorno.** Deja `process.env.TZ` en `undefined` y el offset en 300 (Bogotá): una suite «de 4 husos» correría cuatro veces en el mismo huso y saldría verde. Lo que sí funciona es **asignar `process.env.TZ` en runtime**, y admite varios cambios dentro del mismo proceso → un `describe.each` de 4 husos en una sola suite. **Cerrado por:** 03-01 T2, 03-02 T1, 03-04 T3 — los tres con la aserción de offset **dentro** de cada bloque, sobre un instante FIJO (`2026-07-14T12:00:00Z`) para que la suite no sea estacional.

2. **El bug de fecha es invisible donde uno lo miraría.** `new Date(y, m-1, d)` escribe el día correcto en Bogotá (la máquina del dev) **y en UTC (Railway)**, y el día anterior en Roma y Kiritimati. **Cerrado por:** `fecha.ts` (03-01 T2) + `scripts/check-fecha-servidor.mjs` enganchado a `npm run build` (03-01 T3) + la suite de husos e2e (03-04 T3). La verificación en rojo está **medida**: mutar `aDate` debe tumbar exactamente Roma y Kiritimati.

3. **`scripts/check-no-free-text.mjs` no cubre `Week.tsx` ni `LogDayDrawer.tsx`.** Su lista de archivos es fija. **Cerrado por:** 03-06 T2, que es una **tarea explícita con su propia verificación en rojo** (reintroducir el import vetado debe dar `8/9` y `exit 1`), no un pie de página. Agujero residual conocido y anotado: `ui.tsx` importa de `'./i18n'` (una barra) y la regex de `IMPORTS_VETADOS` busca `'../i18n'`, así que **no puede** entrar en la lista — se cierra a mano en 03-05 T1 pasando `label` por prop a `ConceptPill`.

---

## Per-Task Verification Map

| Criterio / Req | Comportamiento | Tipo | Plan · Tarea | Comando |
|---|---|---|---|---|
| 1 · BIT-01 | `daily_entries.description` existe (`text`, nullable) | introspección | **03-01 T1** | `npm -w backend run test:e2e -- no-free-text` |
| 1 · BIT-01 | Los 5 campos del día van y vuelven idénticos, `description` incluida (cada campo afirmado por separado) | e2e | **03-04 T1** | `npm -w backend run test:e2e -- daily-entries.e2e` |
| 1 · BIT-01 | Un técnico ve `GET /api/projects` con **exactamente** `{id, name, machines}` y cero dato comercial (conjunto de claves + sonda sobre el JSON completo) | e2e | **03-03 T1** | `npm -w backend run test:e2e -- projects` |
| 1 · BIT-01 | Solo proyectos activos, ordenados; máquinas del proyecto ordenadas por código | e2e | **03-03 T2** | ídem |
| 1 · BIT-01 | La máquina tiene que ser **del proyecto**: una del catálogo global no asociada → 400 | e2e | **03-04 T2** | `… -- daily-entries.e2e` |
| 1 · BIT-01 | La grilla pinta los 7 días de la semana en curso desde el API y navega entre semanas | manual | **03-05 T2** | sonda documentada |
| 2 · BIT-02 | La columna contiene **exactamente** el string enviado, con el proceso en 4 husos, leída con `to_char` | e2e | **03-04 T3** | `… -- daily-entries-fecha` |
| 2 · BIT-02 | El `GET` devuelve el mismo string en los 4 husos (la vuelta, no solo la ida) | e2e | **03-04 T3** | ídem |
| 2 · BIT-02 | `aDate`/`aTexto` son round-trip en 4 husos; `2026-02-30` es `FECHA_INVALIDA` | unit | **03-01 T2** | `npm -w backend run test` |
| 2 · BIT-02 | `hoyLocal()` da el día del DISPOSITIVO en 4 husos; `sumarDias`/`lunesDe` inmunes al DST | unit | **03-02 T1** | `npm -w frontend run test` |
| 2 · BIT-02 | Dos `PUT` a la misma fecha → **1 fila** (el segundo edita) | e2e | **03-04 T1** | `… -- daily-entries.e2e` |
| 2 · BIT-02 | Ningún `new Date()` sin argumentos ni `new Date(y,m,d)` ni getter local en el módulo de bitácora | script | **03-01 T3** | `npm run check:fecha-servidor` (dentro de `npm run build`) |
| 3 · BIT-03 | El `CHECK de_proyecto_por_concepto` existe en `pg_constraint` y **no menciona `phase`** | introspección | **03-01 T1** | `… -- no-free-text` |
| 3 · BIT-03 | `LR`/`NR`/`IL` sin proyecto → 200; los 5 de trabajo sin proyecto → 400 (`it.each`, el mensaje nombra el concepto) | e2e | **03-04 T2** | `… -- daily-entries.e2e` |
| 3 · BIT-03 | Un `INSERT` directo de `DC` sin proyecto falla con **SQLSTATE 23514** (la garantía es del motor, no del handler) | e2e | **03-04 T2** | ídem |
| 3 · BIT-03 | Con `LR`/`NR`/`IL` la UI oculta proyecto y máquina; con los otros exige proyecto | manual | **03-06 T1** | sonda documentada |
| 4 · BIT-04 | 8 `PUT` idénticos **simultáneos** → 8×200 y 1 fila | e2e | **03-04 T1** | `… -- daily-entries.e2e` |
| 4 · BIT-04 | `draft.ts`: round-trip, JSON corrupto → `null`, cuota agotada → `false` sin lanzar, `enConflicto` devuelve la lista de fechas | unit | **03-02 T2** | `npm -w frontend run test` |
| 4 · BIT-04 | Cerrar y reabrir el navegador con la semana a medio llenar conserva lo escrito | manual | **03-05 T3** | sonda documentada |
| 4 · BIT-04 | Conflicto local↔servidor: se muestran las dos versiones y elige el técnico | manual | **03-05 T3** | sonda documentada |
| — | Ventana temporal: por encima de `max` → 400 `FECHA_FUTURA`; por debajo de `min` → 400 `FECHA_DEMASIADO_ANTIGUA`; las dos fronteras exactas → 200 | e2e | **03-04 T2** | `… -- daily-entries.e2e` |
| — | `ventana()` en el límite de mes y en el cruce de año | unit | **03-01 T2** | `npm -w backend run test` |
| — | Usuario T sin `technician_id` → **409 con código**, no `[]` ni 42501 | e2e | **03-04 T2** | `… -- daily-entries.e2e` |
| — | El técnico sigue recibiendo 403 en las 6 rutas restantes de `/api/projects` (`it.each`, el mensaje nombra la ruta) | e2e | **03-03 T2** | `… -- projects` |
| — | `DELETE /:date` solo vacía borradores; `submitted`/`approved` → 409 | e2e | **03-04 T2** | `… -- daily-entries.e2e` |
| 5 | `Week.tsx` y `LogDayDrawer.tsx` sin mocks ni catálogos cableados; el guarda-rail los cubre | script | **03-06 T2** | `node scripts/check-no-free-text.mjs` → `9/9`, dentro de `npm run build` |
| 5 | Las dos pantallas contra el API real | manual | **03-06 T2** | sonda documentada contra el backend local, como hizo 02-06 |

**Sin 3 tareas consecutivas sin `<automated>`:** las 15 tareas de los 6 planes tienen
comando automatizado. Las verificaciones manuales son **adicionales**, nunca la única
red de una tarea.

---

## Wave 0 Requirements

Todo Wave 0 vive en la **wave 1** (planes 03-01, 03-02, 03-03), que no depende de nada
y corre en paralelo sin compartir un solo archivo:

- [ ] **03-01 T1** — Migración `<ts>_bitacora`: columna `description` + CHECK `de_proyecto_por_concepto` + GRANT (receta `migrate diff` → `migrate deploy`; `migrate dev` aborta aquí)
- [ ] **03-01 T2** — `backend/src/modules/daily-entries/fecha.ts` + su unit de 4 husos con `process.env.TZ` en runtime
- [ ] **03-01 T3** — `scripts/check-fecha-servidor.mjs` enganchado a `npm run build`
- [ ] **03-02 T1** — Runner de tests del frontend (`node --import tsx --test`, sin dependencias nuevas) + `lib/fecha.ts`
- [ ] **03-02 T2** — `lib/draft.ts` como módulo puro con `Storage` inyectable
- [ ] **03-03 T1/T2** — `GET /api/projects` con proyección de técnico (precondición del selector del drawer)
- [ ] **03-06 T2** — Ampliar `scripts/check-no-free-text.mjs` con `Week.tsx` y `LogDayDrawer.tsx` (va en la wave 4 **a propósito**: ampliarlo antes deja el build en rojo, y la doctrina del repo es engancharlo en el mismo commit que lo pone verde)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Captura real de los 7 días desde la pantalla | BIT-01 | El frontend no tiene runner de integración y montarlo es una fase entera | Sesión de técnico contra el backend local (`DEV_AUTH_ENABLED=true`): llenar los 7 días, recargar, comprobar que sale exactamente lo mismo |
| Borrador que sobrevive al cierre del navegador | BIT-04 | Requiere ciclo de vida real de pestaña (`pagehide`) | Llenar 3 días sin guardar, cerrar el navegador, reabrir |
| Aviso de conflicto borrador vs. servidor | BIT-04 | Requiere provocar divergencia entre dos dispositivos | Registrar un día en escritorio con borrador local pendiente en móvil |
| Vista móvil en tarjetas | BIT-01 | Depende del viewport real | Semana en móvil: una tarjeta por día, sin scroll horizontal |
| «Igual que ayer» | BIT-01 | Interacción | Sobre un día en blanco con el anterior lleno: copia los 5 campos |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 15/15
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — todo en la wave 1 salvo la ampliación del guarda-rail, diferida a la wave 4 con motivo escrito
- [x] No watch-mode flags
- [x] Feedback latency < 150s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (2026-07-26) — 6 planes, 4 waves, 15 tareas.
