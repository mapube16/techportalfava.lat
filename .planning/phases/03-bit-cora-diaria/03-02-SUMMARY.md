---
phase: 03-bit-cora-diaria
plan: 02
subsystem: testing
tags: [node-test, tsx, timezone, localStorage, react, typescript, tdd]

# Dependency graph
requires:
  - phase: 02-maestros-y-cat-logos
    provides: "el patrón de módulo puro en frontend/src/lib (useApiData, client) y el tsconfig strict del workspace"
provides:
  - "Primer runner de tests ejecutable del frontend: `npm -w frontend run test` (node --test + tsx, cero dependencias nuevas)"
  - "El runner enganchado al build del workspace: test → tsc → vite build, o sea dentro del build de Railway"
  - "frontend/src/lib/fecha.ts: aritmética de calendario sobre strings YYYY-MM-DD, con la regla de fecha del CLIENTE (getters locales) escrita al lado"
  - "frontend/src/lib/draft.ts: el borrador local como módulo puro con Storage inyectable y detección de conflicto por marca de tiempo"
  - "35 casos verdes que cubren 4 husos del dispositivo y los 4 modos de fallo reales del borrador"
affects: [03-05 (grilla semanal y drawer), 03-06 (cutover de Week.tsx), fase-04-notas-semanales, cualquier plan futuro con tests de frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "node:test + tsx sobre módulos puros, ficheros listados POR NOMBRE en el script"
    - "process.env.TZ asignado en runtime + aserción del offset sobre un instante FIJO"
    - "Storage inyectado por parámetro en vez de tocar window/localStorage"

key-files:
  created:
    - fava-control-tecnico/frontend/src/lib/fecha.ts
    - fava-control-tecnico/frontend/src/lib/fecha.test.ts
    - fava-control-tecnico/frontend/src/lib/draft.ts
    - fava-control-tecnico/frontend/src/lib/draft.test.ts
  modified:
    - fava-control-tecnico/frontend/package.json

key-decisions:
  - "El runner se engancha al build del WORKSPACE de frontend, no al de la raíz: los tests entran en el build de Railway sin tocar el package.json que 03-01 edita en esta misma wave"
  - "Los .test.ts van listados por nombre en el script, no por glob: npm lanza los scripts por cmd.exe en Windows (no expande globs) y las reglas de descubrimiento de .ts de node --test dependen de la minor de Node"
  - "`import { strict as assert } from 'node:assert'` en vez de `import assert from 'node:assert/strict'`: el tsconfig del frontend no tiene esModuleInterop y el default import de un `export =` no type-checa"
  - "El instante de las 03:30Z del plan NO tumba São Paulo bajo la mutación (a esa hora São Paulo ya coincide con UTC): se añadió un tercer instante a las 02:30Z para que la mutación tumbe los CUATRO husos, como exige el criterio de éxito"
  - "enConflicto usa `>` estricto y el test tiene el caso de igualdad exacta: es la única frontera que se mueve si alguien lo relaja a `>=`"
  - "BIT-02 y BIT-04 NO se marcan Complete aquí: este plan entrega la mitad cliente y los reclaman 5 y 4 planes de la fase respectivamente"

patterns-established:
  - "Test de husos: `process.env.TZ` en runtime dentro de un before/after por bloque, con la aserción del offset sobre `2026-07-14T12:00:00Z` (instante fijo) ANTES de cualquier aserción de fecha — con `new Date()` la suite sería estacional"
  - "Módulo probable sin DOM: la dependencia del navegador (Storage) entra por parámetro; el falso son 8 líneas sobre un Map"
  - "Verificación en rojo registrada con los casos exactos que caen, no con un «pasa a rojo»"

requirements-completed: [BIT-02, BIT-04]

# Metrics
duration: 34min
completed: 2026-07-26
---

# Phase 3 Plan 2: Runner de tests del frontend + fecha y borrador del cliente Summary

**El frontend estrena runner de tests (`node --import tsx --test`, cero dependencias nuevas y enganchado al build) con 35 casos verdes que prueban `hoyLocal()` en 4 husos reales del dispositivo y el borrador local en sus 4 modos de fallo — incluida la cuota agotada de Safari.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-07-26T19:34:00Z
- **Completed:** 2026-07-26T20:08:00Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files modified:** 5 (4 creados, 1 modificado)

## Accomplishments

- **El frontend deja de tener 0 % de cobertura ejecutable.** `npm -w frontend run test` corre 35 casos en ~400 ms sin instalar nada: `tsx@4.23.1` y `@types/node@22.20.1` ya venían hoisted por los workspaces. `package-lock.json` sin un solo cambio.
- **Los tests corren dentro del build de Railway** sin tocar el `package.json` de la raíz (que 03-01 edita en paralelo): el `build` del workspace de frontend es ahora `npm run test && tsc && vite build`, y el `build` de la raíz ya llamaba a `npm -w frontend run build`.
- **La regla de fecha del cliente queda encerrada en un módulo** con la tabla de la regla opuesta a la del backend escrita en el docstring. Fuera de `fecha.ts` no hay ningún objeto `Date`.
- **El borrador es probable sin DOM:** `Storage` entra por parámetro, así que `draft.ts` no menciona `window`, `localStorage` ni `document` en código (solo en comentarios) y no importa React.

## Task Commits

1. **Task 1 (RED): runner + suite de 4 husos** — `8d3305f` (test)
2. **Task 1 (GREEN): `fecha.ts`** — `0babd3e` (feat)
3. **Task 2 (RED): suite del borrador con Storage falso** — `2647c3c` (test)
4. **Task 2 (GREEN): `draft.ts`** — `f747bb2` (feat)

_TDD: rojo commiteado antes que el verde en las dos tareas. Sin fase de refactor: no hubo nada que limpiar._

## El contrato para 03-05 (firmas exactas)

`frontend/src/lib/fecha.ts` — todo entra y sale como string `'YYYY-MM-DD'`:

```ts
export const hoyLocal: (ahora?: Date) => string;              // getters LOCALES
export const sumarDias: (s: string, n: number) => string;     // sobre UTC
export const lunesDe: (s: string) => string;                  // lunes ISO, sobre UTC
export const diasDeSemana: (lunes: string) => string[];       // los 7, en orden
export const primerDiaMesAnterior: (hoy: string) => string;   // sobre el string
```

`frontend/src/lib/draft.ts`:

```ts
export interface FilaDia { date: string; projectId: string | null; machineModelId: string | null;
                           conceptCode: string | null; phase: 'MONTAJE' | 'COLLAUDO' | null;
                           description: string | null }
export interface Borrador { entries: Record<string, FilaDia>; savedAt: number }

export const claveBorrador: (technicianId: string, lunes: string) => string;
export function guardar(st: Storage, clave: string, b: Borrador): boolean;   // sella savedAt
export function leer(st: Storage, clave: string): Borrador | null;           // corrupto -> null
export function borrar(st: Storage, clave: string): void;
export function enConflicto(b: Borrador, servidor: { date: string; updatedAt: string }[]): string[];
```

**Consecuencia de contrato para 03-04:** el `GET` de la semana **tiene que devolver `updatedAt`** por fila; sin él `enConflicto` no puede responder.

**Nota para la UI (Pitfall 6):** «sin caducidad» significa que este código no lo borra. El ITP de WebKit se lleva todo el almacenamiento escribible por script tras 7 días de Safari en uso sin visitar el sitio, e IndexedDB está en la misma lista. La pantalla no debe prometer que el borrador es eterno; está escrito en el docstring del módulo.

## El runner: qué invocación funcionó

**La que funciona, tal cual quedó en `frontend/package.json`:**

```json
"test": "node --import tsx --test src/lib/fecha.test.ts src/lib/draft.test.ts",
"build": "npm run test && tsc && vite build"
```

- Node v22.17.0, `tsx@4.23.1` resuelto desde `fava-control-tecnico/node_modules` (hoisted por los workspaces, es devDependency de `backend`).
- Funcionó **a la primera**, sin descartar ninguna alternativa: no hizo falta probar `--loader tsx`, ni `--experimental-strip-types`, ni instalar nada.
- `tsc` type-checa los dos `.test.ts` (caen dentro de `"include": ["src"]`) y **no hizo falta añadir `"types": ["node"]`** al tsconfig: `@types/node` se resuelve solo desde la raíz del workspace. El tsconfig del frontend queda con 0 líneas de diff.
- Los ficheros van **por nombre**. Con glob, `cmd.exe` pasaría el literal `src/lib/*.test.ts` a Node.

## Verificaciones en rojo (los casos exactos que cayeron)

### 1. `hoyLocal` mutado a `ahora.toISOString().slice(0, 10)`

Resultado: **`# pass 20 / # fail 4`** — cae `hoyLocal da el dia del CALENDARIO DEL DISPOSITIVO` en **los cuatro** husos:

| Instante | Bogotá (300) | Roma (−120) | São Paulo (180) | Kiritimati (−840) |
|---|---|---|---|---|
| `02:30Z` esperado | `2026-07-13` ❌ | `2026-07-14` ✓ | `2026-07-13` ❌ | `2026-07-14` ✓ |
| `03:30Z` esperado | `2026-07-13` ❌ | `2026-07-14` ✓ | `2026-07-14` ✓ | `2026-07-14` ✓ |
| `22:30Z` esperado | `2026-07-14` ✓ | `2026-07-15` ❌ | `2026-07-14` ✓ | `2026-07-15` ❌ |

(❌ = el caso que la mutación tumba en ese huso. La mutación devuelve `2026-07-14` en las tres filas.)

Los 4 casos de `el huso cambio de verdad` siguieron **verdes** durante la mutación, que es lo que demuestra que los 4 bloques corrían de verdad en 4 husos distintos y no cuatro veces en Bogotá.

### 2. `guardar` sin su `try/catch`

Resultado: **`# pass 34 / # fail 1`**. El caso `con la cuota agotada devuelve false y NO propaga` cambia de naturaleza: ya no falla una aserción, **lanza** — `error: 'QuotaExceededError'`, `failureType: testCodeFailure`. Es exactamente el modo de fallo que dejaría la pantalla de captura en blanco en Safari privado.

### 3. `enConflicto` con `>=` en vez de `>`

Resultado: **`# pass 34 / # fail 1`**, y se movió **solo el caso de frontera**:

| Caso | con `>` | con `>=` |
|---|---|---|
| `devuelve las FECHAS que el servidor escribio despues` | ✓ | ✓ (no se mueve) |
| `un dia que el borrador no toca nunca es conflicto` | ✓ | ✓ (no se mueve) |
| **`mismo instante NO es conflicto: la frontera es estricta`** | ✓ | **❌ se mueve** |
| `sin filas del servidor no hay conflicto` | ✓ | ✓ (no se mueve) |

Hay caso de frontera y es el único que responde a la mutación: no hizo falta añadir ninguno.

## Files Created/Modified

- `fava-control-tecnico/frontend/package.json` — **solo `scripts`**: `test` nuevo y `build` con el `npm run test &&` delante. Dependencias intactas.
- `fava-control-tecnico/frontend/src/lib/fecha.ts` (53 líneas) — los 5 exports de calendario, con la tabla de las dos reglas opuestas en el docstring.
- `fava-control-tecnico/frontend/src/lib/fecha.test.ts` (90 líneas) — 4 husos × 6 casos = 24.
- `fava-control-tecnico/frontend/src/lib/draft.ts` (79 líneas) — los 5 exports del borrador + `FilaDia`/`Borrador`.
- `fava-control-tecnico/frontend/src/lib/draft.test.ts` (131 líneas) — 11 casos, `Storage` falso sobre un `Map` y el de cuota agotada.

## Decisions Made

- **El enganche va en el build del workspace, no en el de la raíz.** Es lo que permite que 03-01 edite el `package.json` de la raíz en la misma wave sin colisión, y el efecto en Railway es idéntico.
- **`import { strict as assert } from 'node:assert'`.** El `import assert from 'node:assert/strict'` que sugería el plan no type-chequea con este tsconfig (sin `esModuleInterop`, un `export =` no admite default import). El named import del namespace `assert` da el mismo objeto (`equal === strictEqual`) y evita tocar el tsconfig, que no es un fichero de este plan.
- **La aritmética de semanas no usa librería.** `sumarDias` son 4 líneas sobre `setUTCDate`, que ya resuelve fin de mes, cambio de año y bisiestos; `date-fns` sería la vía más corta a reintroducir husos en un dominio que es puro calendario.
- **`enConflicto` compara marcas de tiempo, no campos.** Una comparación de enteros frente a cinco de strings con `trim`, y responde la pregunta correcta («¿alguien escribió después que yo?») en vez de una aproximada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El instante de las 03:30Z del plan no tumba São Paulo: añadido un tercer instante a las 02:30Z**

- **Found during:** Task 1 (suite de husos)
- **Issue:** El plan afirma que *«el de las 03:30Z cae en Bogotá y São Paulo»* y su criterio de éxito exige que la mutación a `toISOString()` **tumbe los cuatro husos**. Las dos cosas son incompatibles: a las `2026-07-14T03:30:00Z` São Paulo (UTC−3) está a las 00:30 del **14**, o sea el mismo día que UTC, así que la mutación devuelve el valor esperado y el caso queda verde. Con solo los dos instantes del plan, São Paulo nunca cae y la suite estaría probando un instante y no la regla — literalmente lo que el propio plan advierte.
- **Fix:** conservados los dos instantes del plan **y añadido un tercero a `2026-07-14T02:30:00Z`**, donde Bogotá (−5, 21:30 del 13) y São Paulo (−3, 23:30 del 13) están los dos en el día anterior a UTC. Cada huso tiene ahora al menos un instante que la mutación tumba, y el 03:30Z se queda como lo que realmente es: la frontera en la que São Paulo pasa a coincidir con UTC.
- **Files modified:** `fava-control-tecnico/frontend/src/lib/fecha.test.ts`
- **Verification:** mutación ejecutada → `# fail 4`, un `hoyLocal` caído en cada uno de los cuatro bloques (tabla arriba).
- **Committed in:** `8d3305f` (commit rojo de la Task 1)

**2. [Rule 3 - Blocking] `import assert from 'node:assert/strict'` no type-checa con este tsconfig**

- **Found during:** Task 1 (estructura obligatoria del test)
- **Issue:** El plan prescribe el default import. `frontend/tsconfig.json` no activa `esModuleInterop` (ni `allowSyntheticDefaultImports`), y `@types/node` declara `assert/strict` con `export =`: el default import da error de compilación, y `tsc` type-checa los `.test.ts` porque caen dentro de `"include": ["src"]`. Habría dejado el `build` en rojo justo en el paso que este plan añade.
- **Fix:** `import { strict as assert } from 'node:assert'` en los dos ficheros de test. Mismo objeto, mismas aserciones estrictas, sin tocar el tsconfig (que no es fichero de este plan y lo comparten las 7 pantallas).
- **Files modified:** `fecha.test.ts`, `draft.test.ts`
- **Verification:** `npm -w frontend run build` verde (test → tsc → vite build), tsconfig con 0 líneas de diff.
- **Committed in:** `8d3305f` y `2647c3c`

**3. [Rule 3 - Blocking] El script `test` lista un solo fichero durante la Task 1**

- **Found during:** Task 1
- **Issue:** El plan pide dejar el script con los dos ficheros ya en la Task 1, pero `draft.test.ts` no existe hasta la Task 2 y `node --test` falla con un fichero inexistente: el `<verify>` de la Task 1 (`npm -w frontend run test` en verde) sería imposible de cumplir y el repo quedaría con el build roto entre commits.
- **Fix:** la Task 1 deja `"test": "node --import tsx --test src/lib/fecha.test.ts"` y la Task 2 añade `src/lib/draft.test.ts`. El estado final es exactamente el que pide el plan.
- **Files modified:** `fava-control-tecnico/frontend/package.json`
- **Verification:** `npm -w frontend run test` verde al cierre de cada tarea.
- **Committed in:** `8d3305f` (un fichero) y `2647c3c` (los dos)

**4. [Rule 1 - Bug] `roadmap update-plan-progress 3` corrompió el mapa de cutover de ROADMAP.md**

- **Found during:** cierre del plan (actualización de estado)
- **Issue:** el comando busca la fila `| N |` y acierta en la tabla equivocada («Frontend Cutover Map», cuya primera columna también es el número de fase). Dejó `| 3 | 1/6 | In Progress|  | Inbox, Notes, ReturnModal, Audit, bandeja de Home |` y **se comió entera la fila de la Fase 4**.
- **Fix:** restauradas a mano las dos filas (`| 3 | Week, LogDayDrawer |` y la de la Fase 4) y marcado `- [x] 03-02-PLAN.md` en la lista de planes, que es la actualización que el comando debía hacer. La fila `| 1 |`, corrupta por una ejecución anterior y **ya commiteada**, se deja como está: es dato de otra fase → `deferred-items.md` §3, junto con el aviso de que 03-01 y 03-03 volverán a ejecutar el mismo comando en esta wave.
- **Files modified:** `.planning/ROADMAP.md`, `.planning/phases/03-bit-cora-diaria/deferred-items.md`
- **Verification:** `git diff .planning/ROADMAP.md` = 1 línea (el checkbox de 03-02); la tabla de cutover vuelve a tener sus 6 filas.
- **Committed in:** commit de metadatos

**5. [Rule 1 - Bug] `requirements mark-complete BIT-02 BIT-04` marcaba como completo lo que no lo está**

- **Found during:** cierre del plan
- **Issue:** el `requirements` del frontmatter se ejecutó tal cual y REQUIREMENTS.md quedó con BIT-02 y BIT-04 en `[x] · Complete`. Es falso: **BIT-02 lo reclaman 5 de los 6 planes de la fase y BIT-04, 4 de 6**. Este plan entrega la mitad cliente; la columna `DATE`, el `UNIQUE` y la idempotencia del `PUT` son 03-01 y 03-04. Un `Complete` prematuro es exactamente lo que hace que la puerta de fase dé por cerrado un criterio sin motor.
- **Fix:** revertidos los dos checkboxes a `[ ]` y la trazabilidad a `In Progress` **nombrando la mitad que falta** (`mitad cliente en 03-02; servidor en 03-01/03-04` y `borrador local en 03-02; idempotencia en 03-04`). Anotado en `deferred-items.md` §4 que quien cierra la fase es quien los marca.
- **Files modified:** `.planning/REQUIREMENTS.md`, `.planning/phases/03-bit-cora-diaria/deferred-items.md`
- **Verification:** la tabla de trazabilidad dice qué falta y en qué plan, en vez de mentir con un `Complete`.
- **Committed in:** commit de metadatos

---

**Total deviations:** 5 auto-fixed (3 sobre el código y la suite, 2 sobre los documentos de estado)
**Impact on plan:** Ninguna amplía el alcance. La 1 evita cerrar el criterio con una suite que no probaba lo que dice probar; la 2 y la 3 son mecánica de compilación y de orden de tareas; la 4 y la 5 deshacen daño de las herramientas de estado sobre documentos que lee la puerta de fase. Cero dependencias nuevas, cero ficheros de código fuera de los que este plan posee.

## Issues Encountered

- **La verificación del plan incluye `npm run build` en la raíz. No se ejecutó**, y a propósito: los planes 03-01 y 03-03 corren en paralelo y tienen cambios sin commitear en el workspace de `backend` (`schema.prisma`, `projects.controller.ts`, `projects.service.ts`, migración nueva). Un build de la raíz habría fallado —o pasado— por razones ajenas a este plan. El enganche se verificó **estáticamente**, que es donde vive la garantía: el `build` de la raíz es `npm run check:no-free-text && npm -w frontend run build && npm -w backend run build`, y `npm -w frontend run build` es ahora `npm run test && tsc && vite build`. Queda para la puerta de wave.
- Sin conflictos de ficheros con los planes paralelos: los 5 ficheros de este plan son suyos en exclusiva, y los `git add` fueron uno a uno.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **03-05 (grilla y drawer) tiene su contrato cerrado**: las 10 firmas de arriba, ya probadas. La grilla puede pedirle `diasDeSemana(lunesDe(hoyLocal()))` y el `<input type="date">` su `max={hoyLocal()}` y su `min={primerDiaMesAnterior(hoyLocal())}` sin tocar un `Date`.
- **03-04 queda avisado**: el `GET` de la semana debe devolver `updatedAt` por fila o `enConflicto` no tiene con qué comparar.
- **Cualquier plan futuro con lógica de frontend ya tiene dónde probarla**: añadir un módulo nuevo es añadir su `.test.ts` al script por nombre. Cuando sean diez, se cambia a `--test src/lib` (anotado como `ponytail:` en el propio script).
- Sin blockers.

## Self-Check: PASSED

- `fava-control-tecnico/frontend/src/lib/fecha.ts` — FOUND
- `fava-control-tecnico/frontend/src/lib/fecha.test.ts` — FOUND
- `fava-control-tecnico/frontend/src/lib/draft.ts` — FOUND
- `fava-control-tecnico/frontend/src/lib/draft.test.ts` — FOUND
- Commits `8d3305f`, `0babd3e`, `2647c3c`, `f747bb2` — FOUND
- `npm -w frontend run test` → `# tests 35 / # pass 35 / # fail 0`
- `npm -w frontend run build` → test → tsc → `✓ built in 13.66s`
- `git diff a76b70b -- package.json package-lock.json` → vacío (cero dependencias nuevas)

---
*Phase: 03-bit-cora-diaria*
*Completed: 2026-07-26*
