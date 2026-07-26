---
phase: 03-bit-cora-diaria
plan: 01
subsystem: database
tags: [prisma, postgres, migraciones, check, husos, jest, guarda-rail, fechas]

# Dependency graph
requires:
  - phase: "01-01"
    provides: "prisma.config.ts con MIGRATE_DATABASE_URL, datasource sin url"
  - phase: "02-01"
    provides: "daily_entries con sus 5 columnas y 4 FKs, el enum concept_code, la receta migrate diff + migrate deploy y la leccion del GRANT (Pitfall 7)"
  - phase: "02-02"
    provides: "test/no-free-text.e2e-spec.ts: introspeccion del catalogo del sistema con fallos como LISTA de strings"
provides:
  - "daily_entries.description (text, nullable): donde BIT-01 guarda el trabajo del dia y de donde lo lee el cuerpo de la Nota Semanal (Fase 5)"
  - "CHECK de_proyecto_por_concepto: los 5 conceptos de trabajo exigen proyecto, LR/NR/IL quedan libres, phase NO se menciona. BIT-03 pasa de promesa a garantia del MOTOR (23514)"
  - "GRANT SELECT/INSERT/UPDATE/DELETE sobre daily_entries a fava_app dentro de la migracion (Pitfall 7)"
  - "backend/src/modules/daily-entries/fecha.ts: aDate / aTexto / ventana — las dos unicas conversiones string<->Date del backend y la ventana temporal"
  - "fecha.probe.ts + fecha.spec.ts: 60 casos en 4 husos REALES, con la receta que funciona (jest NO puede cambiar el huso)"
  - "scripts/check-fecha-servidor.mjs enganchado a npm run build (raiz): reintroducir el bug de fecha tumba el deploy de Railway en el primer paso"
  - "crearJornadaAprobada() reparado: el concepto lo decide el proyecto, asi el fixture no puede fabricar filas que el motor rechaza"
affects: [03-04-endpoints, 03-05-pantallas, 03-06-cutover, fase-05-nota-pdf, fase-06-migracion, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El huso del proceso NO se puede cambiar dentro de jest (sustituye global.process por una copia): las medidas de husos se toman en un proceso hijo de Node y las aserciones se quedan en jest"
    - "La asercion de offset va PRIMERO y DENTRO de cada bloque de huso, sobre un instante FIJO: es lo unico que distingue «4 husos» de «4 veces el mismo huso»"
    - "El round-trip toISOString().slice(0,10) === entrada es obligatorio en aDate: es lo UNICO que atrapa 2026-02-30 (medido: no da Invalid Date, da el 2 de marzo)"
    - "Ventana temporal por TOLERANCIA de huso (+14h techo / -12h suelo), no por zona configurada: la ventana del servidor contiene siempre a la del cliente sin tabla de husos"
    - "Un guarda-rail que llega a verde se engancha a npm run build en el MISMO commit (doctrina de 02-06)"
    - "El guarda-rail no se dispara con la prosa que documenta el bug: se saltan las lineas de comentario y las marcadas // fecha-ok: <motivo>"

key-files:
  created:
    - fava-control-tecnico/backend/prisma/migrations/20260726150806_bitacora/migration.sql
    - fava-control-tecnico/backend/src/modules/daily-entries/fecha.ts
    - fava-control-tecnico/backend/src/modules/daily-entries/fecha.probe.ts
    - fava-control-tecnico/backend/src/modules/daily-entries/fecha.spec.ts
    - fava-control-tecnico/scripts/check-fecha-servidor.mjs
    - .planning/phases/03-bit-cora-diaria/deferred-items.md
  modified:
    - fava-control-tecnico/backend/prisma/schema.prisma
    - fava-control-tecnico/backend/test/no-free-text.e2e-spec.ts
    - fava-control-tecnico/backend/test/helpers/fixtures.ts
    - fava-control-tecnico/backend/test/technicians.e2e-spec.ts
    - fava-control-tecnico/package.json

key-decisions:
  - "El CHECK de_proyecto_por_concepto queda ESTRICTO: ni un OR source_row IS NOT NULL preventivo. La salida de la Fase 6 es la cuarentena, no relajar la garantia por adelantado"
  - "El CHECK NO menciona phase y el test lo afirma explicitamente: TODO el historico del Excel entra con phase = NULL y un CHECK con fase haria imposible la Fase 6"
  - "Las medidas de husos se toman en un proceso hijo de Node: dentro de jest process.env.TZ guarda el valor pero NO cambia el huso, asi que la receta del research producia 4 bloques midiendo Bogota"
  - "ventana() el 1 de septiembre a las 00:00 UTC devuelve min 2026-07-01, NO 2026-08-01: a esa hora un tecnico en UTC-12 sigue a 31 de agosto y su mes anterior es JULIO"
  - "crearJornadaAprobada emite LR cuando no hay proyecto y DC cuando lo hay: un fixture que puede fabricar una fila que el motor rechaza esta roto, aunque fixtures.ts fuera contrato cerrado desde 02-01"
  - "El .sql completo NO es re-aplicable (el ADD COLUMN de Prisma no lleva IF NOT EXISTS y no se toca); el bloque escrito a mano SI, y se re-aplico dos veces"
  - "BIT-01/02/03 NO se marcan completos: este plan pone el motor y el contrato de fecha, no el entregable. Los cierran 03-04 (endpoints) y 03-05/03-06 (pantallas)"

patterns-established:
  - "Una verificacion en rojo que tumba TODOS los casos o NINGUNO significa que el test esta mal: la firma esperada se mide antes y se registra"
  - "Los fixtures compartidos codifican las reglas del motor: si el CHECK dice que una jornada de trabajo necesita proyecto, el fixture no puede ofrecer lo contrario"

requirements-completed: []

# Metrics
duration: 42min
completed: 2026-07-26
---

# Phase 3 Plan 01: Motor de la bitácora y contrato de fecha del servidor Summary

**La columna `description` y el `CHECK de_proyecto_por_concepto` que BIT-01 y BIT-03 daban por hechos y que la introspección demostró inexistentes, más `fecha.ts` con las dos únicas conversiones string↔Date del backend y su guarda-rail dentro de `npm run build` — y, de paso, el descubrimiento de que la receta de husos que traía la investigación **no funciona dentro de jest**, que habría dejado una suite de 4 husos midiendo Bogotá cuatro veces.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 3 de 3
- **Files modified:** 11 (6 creados, 5 modificados)
- **Suites:** 14 e2e / 278 casos y 2 unit / 72 casos, todo en verde

## Accomplishments

- **BIT-03 pasa de promesa a propiedad del motor.** Verificado contra Postgres, no contra el summary: un `INSERT` directo de `DC` sin `project_id` devuelve **SQLSTATE 23514** (`de_proyecto_por_concepto`), `LR` sin proyecto pasa, y `concept_code NULL` pasa. Venga de un endpoint, de un script de migración o de la consola de la base.
- **La trampa 1 de la fase estaba una capa más abajo de donde la buscaban, y la aserción de offset la destapó.** El research verificó que `process.env.TZ` en runtime funciona — y funciona, **en Node a secas**. Dentro de jest **no**: jest sustituye `global.process` por una copia con su propio `env`, así que la asignación guarda el valor (`process.env.TZ` responde `'Europe/Rome'`) pero no resetea la caché de zona de V8, que la resetea el setter del `env` real. Medido: los cuatro husos daban offset **300**. Sin la aserción de offset dentro de cada bloque, la suite habría salido verde probando Bogotá cuatro veces — exactamente el fallo que el plan quería evitar, con la receta que el plan proponía para evitarlo.
- **Los cuatro husos son reales ahora.** Las medidas las toma `fecha.probe.ts` en un proceso hijo de Node (uno solo: ahí sí se puede cambiar el huso varias veces), las aserciones se quedan en jest, y `HUSOS`/`INVALIDAS` viven en un único sitio a los dos lados de la frontera de proceso. `tsx` ya estaba instalado: **cero dependencias nuevas**.
- **La mutación produce EXACTAMENTE la firma medida por la investigación.** Sustituir el cuerpo de `aDate` por `new Date(+a, +m-1, +d)` tumba **14 casos**, y el que importa —el round-trip a día calendario— cae en **Europe/Rome y Pacific/Kiritimati** y queda **verde en America/Bogota y America/Sao_Paulo**. Es el hallazgo 3 escrito en números: el bug es invisible en la máquina del dev y en Railway.
- **`new Date('2026-02-30')` no da `Invalid Date`: da el 2 de marzo.** Medido en este runtime. El `NaN` check no lo atrapa; el round-trip sí. Sin él, el día de trabajo de un técnico acabaría en otro mes sin un solo error por el camino.
- **El guarda-rail no se dispara con su propia documentación.** La cabecera de `fecha.ts` escribe `new Date(2026, 6, 14)` y `fila.date.getDate()` a propósito, para que quien la lea sepa qué evitar. Un script que marcara eso como hallazgo se acabaría desactivando, así que se saltan las líneas de comentario y las marcadas `// fecha-ok: <motivo>`.
- **Cero dependencias nuevas.** `package-lock.json` sin tocar en los 6 commits; el único cambio en un `package.json` son las dos líneas de script en la raíz.

## Task Commits

1. **Task 1 (TDD RED): introspección de la columna y del CHECK** — `627b8b7` (test)
2. **Task 1 (GREEN): migración `20260726150806_bitacora`** — `8d1e766` (feat)
3. **Task 2 (TDD RED): suite de husos** — `a954600` (test)
4. **Task 2 (GREEN): `fecha.ts` + `fecha.probe.ts`** — `6896b31` (feat)
5. **Task 3: `check-fecha-servidor.mjs` y su enganche al build** — `3c1aad9` (chore)
6. **Regresión destapada por el CHECK: el fixture de jornada** — `99b9119` (fix)

## Las tres verificaciones en rojo, con números exactos

| Verificación | Rotura aplicada | Resultado medido |
|---|---|---|
| **Migración** (Task 1) | ninguna: los 2 casos se escribieron y ejecutaron **antes** de crear la columna y el CHECK | **2 fallidos de 6**, nombrando `daily_entries.description es NO EXISTE (esperado text/YES)` y `daily_entries no tiene el CHECK de_proyecto_por_concepto`. Tras la migración: **6/6** |
| **Husos** (Task 2) | cuerpo de `aDate` → `new Date(+a, +m - 1, +d)` (sin round-trip, que es como se escribe el bug de verdad) | **14 fallidos de 60.** Desglose: 4 × «medianoche UTC» (el instante se mueve en los 4 husos), **2 × round-trip a día calendario — Roma y Kiritimati, y solo esos dos**, 8 × las dos fechas que se normalizan en silencio (`2026-02-30`, `2026-02-29`) × 4 husos |
| **Guarda-rail** (Task 3) | 3 roturas, una a una, al final de `fecha.ts` | Las **3** dan `exit 1` con `fecha.ts:84` y `1/2 archivos limpios`: `new Date(2026, 6, 14)`, `fila.date.getDate()` y `new Date()` sin argumentos |

La segunda fila es la importante y por eso se desglosa: **si la mutación tumbara los cuatro husos o ninguno, el test estaría mal**. Tumba los cuatro en la aserción del instante exacto (correcto: el instante SÍ se mueve en todos) y exactamente dos en la del día calendario (correcto: el día solo se mueve al este de UTC). Las dos mitades juntas son la afirmación completa.

## Lo que la Fase 6 y el plan 03-04 necesitan citar

**La migración es `backend/prisma/migrations/20260726150806_bitacora/migration.sql`.** Contiene el `ADD COLUMN description TEXT` generado, y a mano el `CHECK` idempotente (`DROP IF EXISTS` + `ADD`) y el `GRANT` a `fava_app`.

**El contrato de `ventana(ahora)`, que consume 03-04:**

```
max = dia de (ahora + 14 h)
min = dia 1 del mes ANTERIOR al dia de (ahora - 12 h)
```

Todo es aritmética sobre strings (ni un `getMonth()`, ni un `setMonth()`). La tolerancia sustituye a una zona configurada: los offsets reales van de UTC−12 a UTC+14, así que **la ventana del servidor contiene siempre a la del cliente**, sin tabla de husos y sin `projects.timezone`. El coste aceptado es que un cliente malicioso puede escribir 1 día en el futuro; el beneficio es que ningún técnico legítimo queda bloqueado.

Consecuencia que hay que tener delante al escribir la validación: **el 1 de septiembre a las 00:00 UTC el suelo es `2026-07-01`, no `2026-08-01`**. A esa hora un técnico en UTC−12 sigue a 31 de agosto y para él «el mes anterior» es julio. La suite lo afirma como propiedad, recorriendo los offsets −12/−5/0/+2/+14 en el peor instante posible (las 06:00 UTC del día 1, cuando conviven técnicos en dos meses distintos).

**⚠️ El CHECK es ESTRICTO y la Fase 6 se va a chocar con él.** El Excel marca **1.438 filas** con el centinela «Sin Proyecto» y no se ha podido comprobar qué conceptos llevan. Si alguna lleva `DC`/`MD`/`DFD`/`DVSF`/`DVRC`, la migración del histórico se cae con 23514. **La salida es la cuarentena (`migration_rejects`), NO relajar el CHECK bajo presión** — el razonamiento completo, incluida la alternativa que existe y por qué no se toma por adelantado, está en `.planning/phases/03-bit-cora-diaria/deferred-items.md` § 1.

**Para 03-04 T3 (la suite de husos e2e): la receta del research no sirve tal cual.** `process.env.TZ` dentro de jest no cambia el huso. Hay que tomar las medidas fuera de jest, como hace `fecha.probe.ts`, o el «servidor en Kiritimati» será el servidor en Bogotá. El motivo largo y los dos experimentos están en la cabecera de ese archivo.

## Decisions Made

Ver `key-decisions` en el frontmatter. Las tres que más afectan a lo que viene:

1. **El CHECK no menciona `phase`, y el test lo afirma explícitamente** con `pg_get_constraintdef` + `/\bphase\b/`. Todo el histórico del Excel entra con `phase = NULL`; la fase se valida en la capa de servicio para las jornadas nuevas, nunca en el motor.
2. **La ventana del servidor es más ancha que la del cliente a propósito**, y diverge siempre por el lado seguro. Si algún día las dos dejan de coincidir, el que bloquea es el cliente (UX), no el servidor (autoridad).
3. **BIT-01/02/03 no se marcan completos.** Este plan pone el motor y el contrato; sin endpoints ni pantallas no son verificables. Los cierran 03-04 y 03-06, igual que 02-01 dejó CAT-01..05 abiertos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dentro de jest el huso del proceso NO cambia: la suite de 4 husos habría medido Bogotá cuatro veces**

- **Found during:** Task 2, en la primera ejecución en verde de la implementación (3 fallidos de 64, todos en la aserción de offset).
- **Issue:** El plan y el research prescriben `process.env.TZ = zona` en `beforeAll`, «verificado que funciona». Funciona **en Node a secas**; dentro de jest no. Diagnóstico ejecutado y retirado: `process.env.TZ` responde `'Europe/Rome'` pero `new Date(I).getTimezoneOffset()` sigue devolviendo `300`, y `process !== require('node:process')` (jest sustituye `global.process` por una copia). Node resetea la caché de zona de V8 desde el setter del `env` **real**, que nunca se ejecuta. Es el Pitfall 1 con otra piel: la receta pensada para evitar la suite-que-no-prueba-nada producía exactamente esa suite.
- **Fix:** `fecha.probe.ts` toma las medidas en **un** proceso hijo de Node (`node --import tsx`, `TZ` recorrido en un bucle — ahí sí se puede cambiar varias veces), imprime JSON, y `fecha.spec.ts` hace de arnés: las aserciones siguen siendo de jest y `HUSOS`/`INVALIDAS`/`ROUND_TRIP` viven en un solo sitio.
- **Files modified:** `fecha.probe.ts` (nuevo), `fecha.spec.ts`
- **Verification:** 60/60 en verde con los offsets reales (300 / −120 / 180 / −840); la mutación de `aDate` tumba Roma y Kiritimati y solo esos.
- **Committed in:** `6896b31`

**2. [Rule 1 - Bug] El valor esperado de `ventana()` el 1 de septiembre era el de la ventana del CLIENTE**

- **Found during:** Task 2, al escribir el caso.
- **Issue:** El `<behavior>` del plan pide `ventana(new Date('2026-09-01T00:00:00Z'))` === `{ min: '2026-08-01', max: '2026-09-01' }`. Ese es el par que da la fórmula **del cliente** (`min` = día 1 del mes anterior a *su hoy*), y es el que aparece en el research en el párrafo del límite de mes — que habla de la grilla, no del servidor. Con la fórmula del servidor que el propio plan escribe en el docstring (`−12 h` en el suelo), a las 00:00 UTC del 1 de septiembre el suelo cae en agosto y su mes anterior es **julio**: `min = '2026-07-01'`. Implementar `'2026-08-01'` habría bloqueado a un técnico en UTC−12 —que a esa hora sigue a 31 de agosto y tiene derecho a registrar julio— durante las primeras horas de cada mes: justo la clase de bug que este plan existe para evitar, y en el peor día del mes para la adopción.
- **Fix:** Implementada la fórmula documentada (`+14 h` techo, `−12 h` suelo) y el caso afirma `min: '2026-07-01'`, con el porqué escrito al lado. Añadido un caso que afirma **la propiedad entera** en vez de un valor suelto: para los offsets −12/−5/0/+2/+14 en el instante peor, el día local del técnico está bajo el techo y el suelo del servidor está por debajo del suelo que calcularía su cliente. Ese caso sí distingue las dos fórmulas.
- **Files modified:** `fecha.ts`, `fecha.probe.ts`, `fecha.spec.ts`
- **Verification:** el caso de contención falla con la fórmula del plan y pasa con la documentada.
- **Committed in:** `6896b31`

**3. [Rule 1 - Bug] `crearJornadaAprobada()` fabricaba una fila que BIT-03 prohíbe**

- **Found during:** la suite e2e completa, después de la Task 3 (2 fallidos de 278: `sold-days` y `technicians`).
- **Issue:** El fixture emitía `conceptCode: 'DC'` siempre, incluso cuando se le omitía `projectId` — o sea una jornada de trabajo sin proyecto, exactamente lo que el CHECK nuevo rechaza con 23514. No era interferencia entre suites paralelas (se comprobó antes de tocar nada): era una fila imposible que nadie había podido detectar porque hasta ahora **no existía ningún CHECK que lo dijera**. `sold-days` la creaba a propósito para probar que la matriz no cuenta las jornadas sin proyecto.
- **Fix:** El concepto lo decide el proyecto: con proyecto `DC`, sin proyecto `LR` (que es lo que BIT-03 permite suelto). Un arreglo en el fixture en vez de en los dos llamadores, que es donde todos pasan. La intención de los dos tests se conserva intacta: `sold-days` sigue creando una jornada sin proyecto y sigue comprobando que no se cuenta. En `technicians`, la aserción `conceptCode: 'DC'` estaba acoplada a una elección interna del fixture: se sustituye por comparar la fila **entera** contra la creada, que dice más («no cambió nada», que es el punto del test) y no se acopla a nada.
- **Files modified:** `test/helpers/fixtures.ts`, `test/technicians.e2e-spec.ts`
- **Verification:** 14 suites / 278 casos en verde.
- **Committed in:** `99b9119`
- **Nota sobre `fixtures.ts`:** 02-01 lo declaró «contrato cerrado, ningún plan posterior lo modifica», y esa regla existe para que dos planes en paralelo no se pisen el archivo. Aquí el fixture había quedado **incorrecto** respecto del motor, y el precedente del propio 02-01 es reparar el helper en el mismo commit que el cambio de esquema que lo rompe. Se comprobó que ningún otro plan de la wave lo tenía tocado antes de editarlo.

### Desviaciones deliberadas respecto al texto del plan

- **El `.sql` completo no se re-aplica; el bloque escrito a mano, sí.** El `<done>` pedía re-aplicar el fichero entero con `ON_ERROR_STOP=1`. El `ADD COLUMN` que genera Prisma no lleva `IF NOT EXISTS` y **no se toca** (es SQL generado, y `migrate deploy` no reejecuta migraciones aplicadas). Lo que sí tiene que ser idempotente es el bloque de `CHECK` + `GRANT`, y se re-aplicó **dos veces seguidas sin error**, medido.
- **La suite de husos vive en un arnés + una sonda, no en un solo `.spec.ts`.** Obligado por la desviación 1. Sigue siendo un unit de jest lanzado por `npm -w backend run test`, como pedía el plan.
- **Un caso de `ventana` más que los del `<behavior>`** (la contención como propiedad sobre 5 offsets). Sin él, dos fórmulas distintas pasaban los mismos casos.
- **La sonda `fecha.probe.ts` NO se excluye del guarda-rail.** Podría haberse metido en la lista de exclusiones junto a los `*.spec.ts`, pero pasa limpia sin necesitarlo: usa `getTimezoneOffset` (que lee el huso a propósito y no está prohibido) e instantes fijos. Cada exclusión que no se añade es una puerta que no queda abierta.

### Simplificaciones deliberadas

- **`aDate` acepta `unknown`, no `string`.** Lo que llega es el cuerpo de un `PUT`: `null`, un número o un instante ISO completo tienen que morir en la frontera, no más adentro. Los tres están en la lista de entradas inválidas.
- **`crearJornadaAprobada` no gana un parámetro `conceptCode`.** Ningún llamador lo necesita; la doctrina de 02-01 es que un spec que necesite más se defina su propio creador.
- **El guarda-rail sigue siendo `matchAll` sin parser**, con el `ponytail:` que nombra el techo: `[^)]*` corta en el primer `)`, así que `new Date(f.getTime() + 1)` cuenta como un argumento — que es la respuesta correcta. El modo de fallo del naive es un falso **negativo**, nunca una alarma falsa.
- **`ventana` no consulta `projects.timezone` ni ninguna tabla de husos.** Dos constantes horarias hacen el mismo trabajo sin configuración que mantener.

---

**Total deviations:** 3 auto-fixed (3 bugs) + 4 desviaciones deliberadas + 4 simplificaciones
**Impact on plan:** Ninguna reduce el alcance. Dos de los tres bugs (el huso dentro de jest y el suelo de la ventana) estaban **en el plan**, no en el código, y las dos se habrían cerrado en verde sin que nadie lo notara: la primera dando una suite de husos que mide un solo huso, la segunda bloqueando a los técnicos al oeste de UTC el día 1 de cada mes.

## Issues Encountered

- **`prisma migrate dev` sigue sin poder usarse aquí** (entorno no interactivo). La receta de 02-01 —`migrate diff --from-config-datasource` + `migrate deploy`— funcionó sin fricción y el SQL generado fue exactamente el `ADD COLUMN` esperado.
- **`truncateAll()` se lleva al Super Admin**, como siempre: repuesto con `npm -w backend run db:seed` después de la pasada completa (verificado).
- **`deferred-items.md` lo comparten varios planes de la wave.** 03-02 le añadió su § 3 mientras este plan corría; las dos entradas de este plan (§ 1 y § 2) están intactas.

## User Setup Required

None. Todo corre contra el cluster local del puerto 55432.

**Producción NO se tocó.** La migración `20260726150806_bitacora` se aplicará en Railway en el `preDeployCommand` del próximo deploy, y lleva su `GRANT` para que el Pitfall 7 no se cobre el primer `GET /api/daily-entries`.

## Next Phase Readiness

**Para 03-04 (endpoints de la bitácora), ahora mismo:**
- `import { aDate, aTexto, ventana } from './fecha'` — el módulo está en su sitio y es el único lugar del backend donde existe un `Date` para la fecha de trabajo.
- El `upsert` sobre `technicianId_date` ya tiene columna donde escribir `description`.
- Un `DC` sin proyecto responde **23514** desde el motor; el handler solo tiene que traducirlo a 400, no re-implementar la regla.
- La suite de husos e2e **no puede usar `process.env.TZ` dentro de jest**. Ver la cabecera de `fecha.probe.ts`.

**Para la Fase 6 (migración del Excel):**
- El CHECK estricto es la única cosa nueva que puede tumbar la carga del histórico. `deferred-items.md` § 1 tiene el escenario y la salida.
- `description` es nullable a propósito: las filas del Excel sin texto entran con `NULL`, no con `''`.

**Concerns:**
- **El guarda-rail solo vigila `src/modules/daily-entries/`.** Si 03-04 pone lógica de fecha en otro módulo (por ejemplo un helper compartido en `src/common/`), queda fuera de la red. Dueño: el plan que la mueva — la salida es una línea en el array de rutas del script.
- **`deferred-items.md` § 3 (de 03-02) avisa de que `gsd-tools roadmap update-plan-progress` corrompe la tabla «Frontend Cutover Map» de ROADMAP.md.** Este plan actualizó ROADMAP.md **a mano** por ese motivo y verificó el diff.

## Self-Check: PASSED

- 6/6 archivos declarados como creados existen en disco; 5/5 modificados también.
- 6/6 commits existen en el historial (`627b8b7`, `8d1e766`, `a954600`, `6896b31`, `3c1aad9`, `99b9119`).
- `migration.sql` contiene `de_proyecto_por_concepto` y `GRANT ... TO fava_app`; `fecha.ts` exporta `aDate`, `aTexto` y `ventana`; `package.json` contiene `check:fecha-servidor` dentro de `build`.
- `fecha.ts` 83 líneas (mín. 40) · `fecha.spec.ts` 87 líneas (mín. 40) · `check-fecha-servidor.mjs` 117 líneas (mín. 40).
- `npm -w backend run test` → **2 suites, 72 passed**. `npm -w backend run test:e2e` → **14 suites, 278 passed**.
- `npm run check:fecha-servidor` → `2/2 archivos limpios`, exit 0. `npm run build` (raíz) lo ejecuta y compila los dos workspaces.
- `migrate diff --exit-code` → **«No difference detected»**.
- Contra el motor: `DC` sin proyecto → `23514 de_proyecto_por_concepto`; `LR` sin proyecto → OK; `concept_code NULL` → OK; la definición del CHECK no contiene `phase`.
- Bloque escrito a mano re-aplicado ×2 sin error.
- **Cero dependencias nuevas:** `package-lock.json` sin un solo cambio en los 6 commits; el único diff de `package.json` son las dos líneas de script de la raíz.
- Las 3 verificaciones en rojo registradas con sus números exactos (2/6, 14/60 con Roma+Kiritimati aislados, 3×exit 1).

---
*Phase: 03-bit-cora-diaria*
*Completed: 2026-07-26*
