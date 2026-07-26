---
phase: 02-maestros-y-cat-logos
plan: 02
subsystem: testing
tags: [introspeccion, information_schema, pg_enum, jest, e2e, guarda-rail, node, criterio-4]

# Dependency graph
requires:
  - phase: "02-01"
    provides: "las 8 tablas, los 3 enums de Postgres y las 12 FKs que esta suite introspecciona; test/helpers/db.ts con ownerClient"
  - phase: "01-01"
    provides: "monorepo con workspaces, backend/test/jest-e2e.json, engines.node >=22.12"
provides:
  - "test/no-free-text.e2e-spec.ts: el criterio 4 del roadmap demostrado contra el catalogo del sistema de Postgres (4 casos), no contra un endpoint"
  - "scripts/check-no-free-text.mjs: guarda-rail de repo sobre las 7 pantallas del cutover, la unica comprobacion posible en un frontend sin runner"
  - "npm run check:no-free-text en la raiz del workspace: invocable en el phase gate"
  - "El inventario exacto de la deuda de mocks del frontend (4 hallazgos, 2 archivos) con el plan que cierra cada uno"
affects: [02-06-cutover, fase-03-bitacora, fase-06-migracion, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Los fallos de un test de introspeccion se afirman como LISTA de strings (expect(faltantes).toEqual([])), nunca como booleano: «expected true, received false» no ahorra un minuto de depuracion"
    - "La verificacion en rojo de un test table-driven se hace desde el lado de la CONSTANTE (anadir una fila falsa), no rompiendo el esquema: la comparacion es simetrica y no hay que hacer DDL reversible en la base local"
    - "Un guarda-rail de repo se verifica en rojo Y en verde contra una COPIA desechable del arbol (el script resuelve rutas con import.meta.dirname): cero riesgo de tocar archivos que otro plan esta editando"
    - "Un guarda-rail que hoy sale rojo se registra como script npm suelto y NO se engancha a `build`: el contrato queda escrito sin romper el build de los planes que corren en paralelo"

key-files:
  created:
    - fava-control-tecnico/backend/test/no-free-text.e2e-spec.ts
    - fava-control-tecnico/scripts/check-no-free-text.mjs
  modified:
    - fava-control-tecnico/package.json

key-decisions:
  - "Este plan NO tiene ni una asercion a nivel de API: el criterio 4 se demuestra en el motor y en los archivos, las dos capas que no dependen de 02-03 ni de 02-04. Nada queda pendiente de la wave 2"
  - "La verificacion en rojo se hizo desde las constantes del test y no con ALTER TABLE: el DDL sobre la base local fue denegado por el sandbox y, siendo la comparacion simetrica, el lado de la constante prueba lo mismo sin dejar la base a medio restaurar"
  - "El caso de las columnas prohibidas se verifico en rojo con 'phase' en la lista: devolvio daily_entries.phase y project_sold_days.phase, o sea que la consulta SI encuentra columnas reales y encontraria un 'delta' si alguien lo creara"
  - "El script veta el IDENTIFICADOR CONCEPTS, no el modulo i18n: el mapa codigo->color puede seguir viniendo de ahi (los 8 codigos son fijos, el mapa no se desincroniza); lo que no puede venir de ahi son las etiquetas"
  - "check:no-free-text NO se engancha a `npm run build`: hoy sale rojo por 4 hallazgos legitimos y engancharlo romperia el build de 02-03/02-04/02-05 sin arreglar nada"
  - "La regex de los tres datos cerrados exige limite a ambos lados con sufijos opcionales (id/code/name/s): asi caza roleTypeId, role_type_id y concept_code sin marcar cursor, currentTarget ni la etiqueta t.proj_cur (una etiqueta no es un binding)"
  - "Los 4 hallazgos abiertos NO se anotaron en deferred-items.md: ese archivo lo pueden estar editando los planes que corren en paralelo y este summary es donde el planificador de 02-06 los va a leer"
  - "CAT-01..CAT-04 NO se marcan completos (mismo criterio que 02-01): este plan aporta la COMPROBACION del criterio 4, no los endpoints ni las pantallas que los cuatro requisitos describen; ademas su propio guarda-rail sigue en rojo. Los cierra 02-06"

patterns-established:
  - "«Sin texto libre» se comprueba en tres capas y este plan cubre dos: motor (enum + FK) y archivos (guarda-rail de repo). La UI es la tercera, y es la que menos garantiza"
  - "Un test de introspeccion vale por lo que prohibe a los caminos que AUN NO EXISTEN: un test de API demuestra que ese endpoint valida hoy; information_schema demuestra que ningun endpoint, script, seed o consola de BD podra meter un valor fuera de la lista"

requirements-completed: []

# Metrics
duration: 24min
completed: 2026-07-26
---

# Phase 2 Plan 02: El criterio 4 deja de ser una promesa Summary

**«Concepto, rol y moneda solo se eligen de listas cerradas» pasa de afirmacion de summary a propiedad comprobable en dos capas: 4 casos de introspeccion contra `information_schema` y `pg_enum` que nombran la columna concreta cuando fallan, y un guarda-rail de repo de Node puro sobre las 7 pantallas del cutover — verde el primero, rojo el segundo con 4 hallazgos legitimos que cierra 02-06, y ninguna de las dos comprobaciones depende de los endpoints que 02-03 y 02-04 estan escribiendo ahora mismo.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 2 de 2
- **Files:** 3 (2 creados, 1 modificado)
- **Dependencias nuevas:** 0

## Accomplishments

- **Ninguna asercion queda pendiente de la wave 2.** El aviso del briefing era que las comprobaciones a nivel de API apuntarian a endpoints que 02-03 y 02-04 todavia no han creado. No hubo que decidir nada: el plan no pide ni una asercion de API. Las dos comprobaciones atacan el catalogo del sistema de Postgres (que 02-01 ya dejo cerrado) y archivos del frontend que nadie mas toca en esta wave. **Las dos corren verdes/rojas por su propio merito hoy, y su resultado no cambia cuando aterrice la wave 2.**
- **La suite de introspeccion nombra la columna, no dice «false».** Los cuatro casos comparan LISTAS de strings contra `[]`. El mensaje real de un fallo es `["technicians.role_type_id -> role_types"]` o `["technicians.full_name es text/text (esperado enum employment_type)"]`: se lee el problema sin abrir `psql`.
- **Verificada en rojo en los 4 casos, y el cuarto es el que mas dice.** Con `'phase'` anadido a `COLUMNAS_PROHIBIDAS`, la consulta devolvio `daily_entries.phase` y `project_sold_days.phase`. Es decir: la consulta **encuentra columnas que existen de verdad**, asi que encontraria un `delta` el dia que alguien lo cree. Un `toEqual([])` que siempre devuelve `[]` porque la consulta esta mal escrita es el modo de fallo tipico de este tipo de test, y aqui esta descartado empiricamente.
- **El guarda-rail se verifico en rojo Y en verde sin tocar un solo archivo del repo.** Sobre una copia desechable del arbol (el script resuelve rutas con `import.meta.dirname`, asi que una copia funciona igual): con tres `<input>` inyectados en tres grafias distintas (`{cur}`, `{roleTypeId}` en etiqueta **multilinea**, `{concept_code}`) los caza los tres con `archivo:linea`; y quitando los 4 imports de mock devuelve `7/7 archivos limpios` con `exit 0`. **El verde es alcanzable, no teorico** — que es la duda razonable con un script que hoy sale rojo.
- **Cero falsos positivos sobre los archivos reales.** Los 9 `<input>` que hay hoy en las 7 pantallas (nombre, cliente, OA, pais, valor, horas, dias vendidos, nombre y email de invitacion) no producen ni una alarma, pese a que esos archivos estan llenos de `cursor`, `currentTarget` y `t.proj_cur`.
- **La moneda y las maquinas ya se eligen bien.** `NewProjectModal` usa `<select>` para la moneda y botones tipo chip para las maquinas: la deuda del criterio 4 en el frontend **no es de widgets, es de origen de datos** (los mocks). Eso reduce el trabajo de 02-06 a cambiar la fuente, no a rehacer formularios.

## Task Commits

1. **Task 1 (TDD): `no-free-text.e2e-spec.ts` — el criterio 4 por introspeccion** — `922ce6e` (test) · 129 lineas · verificada en rojo en los 4 casos
2. **Task 2: `check-no-free-text.mjs` + entrada npm** — `49a38e0` (chore) · 104 lineas de script, cero dependencias

## Files Created/Modified

- `backend/test/no-free-text.e2e-spec.ts` — 4 casos como `ownerClient.$queryRaw`, sin app de Nest y **sin `truncateAll()`** (no escribe una fila; truncar seria ruido para las suites en paralelo):
  1. las **7 FKs de eleccion cerrada** existen en `information_schema.table_constraints` + `key_column_usage` + `constraint_column_usage`
  2. las **4 columnas de dominio cerrado** (`daily_entries.concept_code`, `daily_entries.phase`, `project_sold_days.phase`, `technicians.employment_type`) son `USER-DEFINED` con su `udt_name`, no `text` ni `character varying`
  3. el enum `concept_code` tiene **exactamente** `DC, MD, DFD, DVSF, DVRC, LR, NR, IL`, en el orden de `enumsortorder`
  4. **ninguna** columna `delta` ni `executed` en el esquema `public` (criterio 3: el delta se calcula)
  El bloque de cabecera documenta como reproducir cada rojo, para que el proximo que la toque no tenga que inventarlo.
- `scripts/check-no-free-text.mjs` — Node puro sobre las 7 pantallas del cutover. Tres reglas: (1) ningun `<input>` alimenta concepto / rol tecnico / moneda; (2) ningun `import` de `CONCEPTS` desde `../i18n`; (3) ningun `import` de `MACHINES` o `CURRENCIES` desde `../data`. Salida `archivo:linea + motivo` y resumen `N/N archivos limpios`.
- `package.json` (raiz del workspace) — una linea: `"check:no-free-text": "node scripts/check-no-free-text.mjs"`.

## Hallazgos abiertos del guarda-rail (lo que pide el `<output>` del plan)

`npm run check:no-free-text` devuelve **exit 1 con 4 hallazgos en 2 archivos**. Los cuatro son legitimos: son la deuda de mocks que esta fase retira, y **ninguno se ablando para que el script pasara**.

| # | Archivo:linea | Hallazgo | Por que esta mal | Cierra |
|---|---|---|---|---|
| 1 | `screens/Config.tsx:3` | `import { CONCEPTS } from '../i18n'` | Las etiquetas ES/IT de los 8 conceptos son **editables por el Super Admin** (CAT-01) y viven en la tabla `concepts`. Leerlas de una constante hace que la pantalla de Config muestre algo distinto de lo que se guardo | **02-06** |
| 2 | `screens/Config.tsx:4` | `import { CURRENCIES } from '../data'` | Las monedas son ABM del Super Admin; el mock las cablea | **02-06** |
| 3 | `components/NewProjectModal.tsx:6` | `import { MACHINES } ...` | El catalogo global de modelos es ABM; el mock cablea 3 | **02-06** |
| 4 | `components/NewProjectModal.tsx:6` | `import { CURRENCIES } ...` | Idem #2, en el `<select>` de moneda del formulario de proyecto | **02-06** |

Las **tres reglas de `<input>` ya estan verdes hoy** y el objetivo es que sigan verdes: `Config.tsx` y `NewProjectModal.tsx` tienen que cambiar de **fuente de datos**, no de widget. El `<select>` de moneda y los chips de maquina se quedan tal cual; solo cambia de donde sale la lista.

**Estado esperado en el phase gate:** `7/7 archivos limpios`, exit 0, en cuanto 02-06 cablee esas dos pantallas al API de catalogos.

## Decisions Made

Ver `key-decisions`. Las tres que afectan a lo que viene:

1. **`check:no-free-text` no esta enganchado a `npm run build`.** Hoy sale rojo por 4 hallazgos legitimos: engancharlo ahora rompe el build de 02-03, 02-04 y 02-05 sin arreglar nada. Va como script npm suelto, invocable desde el phase gate. **Cuando 02-06 lo ponga en verde, engancharlo a `build` es una linea** y es la forma de que la regla no se pueda volver a romper en silencio (dueno natural: 02-06, o el plan que cierre la fase).
2. **El script veta el identificador `CONCEPTS`, no el modulo `../i18n`.** El mapa `codigo -> color` puede seguir viniendo de ahi: los 8 codigos son fijos por enum, asi que ese mapa no puede desincronizarse. Lo que no puede venir de una constante son las **etiquetas**, que son editables.
3. **Los 4 hallazgos no se anotaron en `deferred-items.md`.** Ese archivo lo pueden estar editando los planes que corren en paralelo en esta misma wave, y este summary es donde el planificador de 02-06 los va a leer. La tabla de arriba es la fuente.

**Y una que no es una decision nueva sino la de 02-01 aplicada:** el plan declara `requirements: [CAT-01, CAT-02, CAT-03, CAT-04]` y **ninguno se marca completo**. Este plan aporta la comprobacion del criterio 4; CAT-02 (ABM de tecnicos), CAT-03 (proyectos) y CAT-04 (dias vendidos) los entregan 02-03, 02-05 y 02-06, y ni siquiera CAT-01 se puede dar por cerrado mientras el guarda-rail de esta misma tarea siga en rojo. Marcarlos aqui haria que la verificacion de fase mintiera con 4 planes por delante — es el mismo razonamiento con el que 02-01 los dejo abiertos.

## Deviations from Plan

### Auto-fixed Issues

Ninguno. No hubo bugs, ni funcionalidad critica que faltase, ni nada que bloqueara una tarea.

### Desviaciones deliberadas respecto al texto del plan

- **La verificacion en rojo se hizo desde las constantes del test, no rompiendo el esquema.** El plan pedia comprobar que el mensaje de fallo nombra la columna; lo natural era un `ALTER TABLE ... DROP CONSTRAINT` + restaurar, como hizo 02-01 con `DISABLE ROW LEVEL SECURITY`. **El sandbox denego el DDL sobre la base local**, asi que el rojo se provoco por el otro lado de la misma comparacion: una fila falsa en `FKS_EXIGIDAS` y en `COLUMNAS_ENUM`, un `'XX'` en `CONCEPTOS`, un `'phase'` en `COLUMNAS_PROHIBIDAS`. La comparacion es simetrica (la consulta lee la realidad, la constante dice lo esperado), asi que prueba exactamente lo mismo — y ademas dejo la base intacta, que con tres planes corriendo en paralelo contra el mismo cluster no es un detalle. **El caso de `'phase'` es incluso mas fuerte que el DDL:** demuestra que la consulta encuentra columnas que existen de verdad.
- **Un caso table-driven en vez de dos para los tipos de columna.** El plan pedia por separado «`daily_entries.concept_code` es `USER-DEFINED`/`concept_code`» y «`technicians.employment_type` es el enum, no texto», mas los dos `phase` en `<interfaces>`. Las cuatro son la misma asercion con distintos parametros y el caso table-driven **nombra la columna igual de bien** (`technicians.full_name es text/text (esperado enum employment_type)`). Cuatro filas de tabla en lugar de cuatro bloques `it`.
- **La regla 1 del script se aplica al bloque completo de la etiqueta, no a la linea.** El plan admitia «la misma linea o la etiqueta». El `<input>` de dias vendidos de `ProjectDetail.tsx` ocupa 4 lineas, asi que mirar solo la linea del `<input` habria sido un falso negativo garantizado. El corte de la etiqueta salta los `>` que vienen de un `=>` (los handlers JSX estan llenos de flechas).

### Simplificaciones deliberadas

- **Sin comprobar `ON DELETE RESTRICT` en la suite de introspeccion.** 02-01 ya lo verifico en las 12 FKs y no es lo que mide el criterio 4 (que la columna tenga un dominio cerrado, no que hacer con el borrado del padre).
- **Sin parser de JSX en el script.** El corte de etiqueta por el primer `>` que no viene de `=>` falla solo con un `>` dentro de una cadena o una comparacion, y ese fallo produce un **falso negativo**, nunca una alarma falsa. El techo esta escrito en un comentario `ponytail:` con la salida (un parser de verdad) por si algun dia hace falta.
- **Sin flag ni variable de entorno para redirigir el script a otro directorio.** La verificacion en rojo y en verde se hizo copiando el arbol a un directorio desechable, que consigue lo mismo con cero configuracion en el codigo de produccion.
- **El resumen cuenta ARCHIVOS limpios, no hallazgos** (`5/7`), que es lo que pedia el plan y ademas la metrica que le sirve a 02-06: dice cuantas pantallas quedan por cablear.

---

**Total deviations:** 0 auto-fixed + 3 desviaciones deliberadas + 4 simplificaciones
**Impact on plan:** Ninguna reduce el alcance ni ablanda una prueba. La unica forzada por el entorno es el metodo de la verificacion en rojo, y la alternativa que se uso demuestra lo mismo o mas.

## Issues Encountered

- **El DDL sobre la base local esta denegado por el sandbox.** `ALTER TABLE ... DROP CONSTRAINT` / `ALTER COLUMN ... TYPE text` / `ADD COLUMN delta` fue bloqueado. Resuelto por el lado de las constantes (ver Desviaciones). **Conviene que lo sepan los planes que vengan:** la receta de 02-01 («romper la propiedad en la base y restaurarla») puede no estar disponible; el equivalente para un test table-driven es anadir una fila falsa a la tabla de casos.
- **`psql` no esta en el PATH.** Vive en `C:/Program Files/PostgreSQL/17/bin`. Solo se uso para leer el esquema antes de escribir las aserciones; la suite no lo necesita.
- Las suites de los otros planes de la wave (`catalogs.e2e-spec.ts`, `users-roles.e2e-spec.ts`) estaban modificadas en el arbol de trabajo mientras esto corria. **Solo se ejecuto `test:e2e -- no-free-text`** (filtro por nombre) y solo se hizo `git add` de los 3 archivos propios: ni un archivo ajeno entro en los dos commits.

## User Setup Required

None. Todo corre contra el cluster local del puerto 55432 y `npm run check:no-free-text` no necesita base de datos.

**Produccion no se toco.** Este plan no tiene migraciones ni codigo de runtime: son dos comprobaciones y una linea de `package.json`.

## Next Phase Readiness

**Para 02-06 (cutover, wave 4) — el consumidor directo:**
- La tabla de **Hallazgos abiertos** es su lista de tareas exacta: `Config.tsx` (conceptos + monedas) y `NewProjectModal.tsx` (monedas + maquinas). Cuatro imports.
- `npm run check:no-free-text` es el criterio de «terminado» de esa parte: cuando diga `7/7 archivos limpios`, el criterio 4 esta cerrado en la UI.
- **No hay que rehacer ningun formulario.** La moneda ya es `<select>` y las maquinas ya son chips; solo cambia el origen de la lista.
- Cuando el script quede en verde, **engancharlo a `npm run build`** (una linea) para que la regla no se pueda volver a romper en silencio.

**Para el phase gate:**
- `npm -w backend run test:e2e -- no-free-text` → 4/4 en verde hoy, y no depende de ningun endpoint.
- `npm run check:no-free-text` → exit 1 hasta que aterrice 02-06; exit 0 despues.

**Para las fases 3, 6 y 7:**
- Los cuatro invariantes quedan vigilados en cada pasada de la suite: si la Fase 3 anadiera un `concept` de texto libre a la bitacora, o la Fase 7 «cacheara» un `delta` en una columna, la suite se pone roja nombrando la columna.

**Concerns:**
- **La suite no vigila columnas nuevas, solo las que enumera.** Si una fase futura anade una tercera columna de eleccion cerrada, hay que anadir su fila a `FKS_EXIGIDAS` o a `COLUMNAS_ENUM`. Es una linea, pero nadie la va a recordar sola: el caso de las columnas prohibidas (`delta`/`executed`) es el unico que es global al esquema.
- **El guarda-rail vigila 7 archivos por nombre.** Una pantalla nueva que caiga en el mismo pecado no entra en la lista sola.

## Self-Check: PASSED

- 3/3 archivos declarados existen en disco.
- 2/2 commits de tarea existen en el historial (`922ce6e`, `49a38e0`).
- `no-free-text.e2e-spec.ts` 129 lineas (min. 50) · `check-no-free-text.mjs` 104 lineas (min. 20).
- `key_links` comprobados: `package.json` contiene `check:no-free-text`; el spec contiene `information_schema`.
- `npm -w backend run test:e2e -- no-free-text` → **4 passed, 1 suite**.
- `npm run check:no-free-text` → 4 hallazgos, `5/7 archivos limpios`, exit 1 (esperado hasta 02-06).
- Verificacion en rojo registrada: los **4** casos del spec (fila falsa en `FKS_EXIGIDAS` -> `weekly_notes.project_id -> projects`; `technicians.full_name` en `COLUMNAS_ENUM` -> `es text/text (esperado enum employment_type)`; `'XX'` en `CONCEPTOS`; `'phase'` en `COLUMNAS_PROHIBIDAS` -> `daily_entries.phase` + `project_sold_days.phase`). Constantes restauradas y suite en verde despues.
- Verificacion en rojo del script: 3 `<input>` inyectados en 3 grafias (`{cur}`, `{roleTypeId}` multilinea, `{concept_code}`) sobre una copia desechable -> 3 hallazgos con `archivo:linea`. Verde alcanzable comprobado en la misma copia: quitando los 4 imports de mock -> `7/7 archivos limpios`, exit 0. Copia eliminada.
- **Cero dependencias nuevas:** el unico cambio en `package.json` es la linea del script (`git diff` revisado antes de commitear); `package-lock.json` sin tocar.
- Ni un archivo ajeno en los commits: `git show --stat` de los dos commits solo lista los 3 archivos propios.

---
*Phase: 02-maestros-y-cat-logos*
*Completed: 2026-07-26*
