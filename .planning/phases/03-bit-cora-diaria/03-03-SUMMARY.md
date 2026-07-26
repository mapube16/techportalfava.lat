---
phase: 03-bit-cora-diaria
plan: 03
subsystem: backend-api
tags: [nestjs, prisma, rbac, proyeccion-por-rol, e2e, jest, bit-01, seguridad]

# Dependency graph
requires:
  - phase: "02-05"
    provides: "GET /api/projects con @Roles('A','S') en la clase, las constantes LISTA/DETALLE como contrato y test/projects.e2e-spec.ts (45 casos)"
  - phase: "02-03"
    provides: "el precedente exacto: @Roles restrictivo en la CLASE y relajado en el METODO (el guard hace getAllAndOverride)"
  - phase: "02-04"
    provides: "users.technician_id, el vinculo del usuario tecnico con su ficha"
  - phase: "02-01"
    provides: "test/helpers/fixtures.ts (contrato cerrado) y la regla de que los catalogos NO se truncan"
provides:
  - "GET /api/projects responde 200 a un Tecnico con la proyeccion {id, name, machines}: cero dato comercial"
  - "ProjectsService.listarParaTecnico(): solo ACTIVOS, orden por nombre, maquinas por code"
  - "LISTA_TECNICO: un tercer `select` que ES el contrato del tecnico, independiente de LISTA"
  - "7 casos e2e nuevos: conjunto EXACTO de claves + sonda de secretos sobre el JSON serializado"
  - "Las 6 rutas restantes de /api/projects siguen en 403 para T, asertadas UNA A UNA por nombre"
affects: [03-05-cutover-drawer, 03-04-daily-entries, fase-04-aprobacion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Una proyeccion por rol se escribe como `select` PROPIO, nunca como subconjunto calculado del `select` amplio: asi una columna nueva no puede aparecer sin que alguien la escriba a mano"
    - "Cero `delete p.campo` y cero `omit`: lo que no se pide al motor no se puede filtrar por error"
    - "Un aislamiento de datos se prueba con DOS aserciones distintas: el conjunto EXACTO de claves (caza la fuga de primer nivel) y una sonda sobre JSON.stringify (caza la ANIDADA). Verificado que cada una cae sin la otra"
    - "Los 403 de las rutas que NO se relajan se afirman con it.each sobre [metodo, ruta]: el mensaje del fallo nombra la ruta que quedo abierta"

key-files:
  created: []
  modified:
    - fava-control-tecnico/backend/src/modules/projects/projects.service.ts
    - fava-control-tecnico/backend/src/modules/projects/projects.controller.ts
    - fava-control-tecnico/backend/test/projects.e2e-spec.ts

key-decisions:
  - "El `if` por rol vive en el CONTROLADOR y es por roles, no por RLS: `proj_read` es USING (TRUE), o sea que el motor le dejaria al tecnico leer todas las columnas de todos los proyectos. El aislamiento comercial es de capa de servicio"
  - "`listarParaTecnico` desestructura {id, name, machines} en vez de hacer `...p`: dos puertas (el select y el map) en vez de una. Coste: cero. Efecto medido: anadir `clientName` SOLO al select ya no filtra nada"
  - "El caso previo `['get','/api/projects'] -> 403` SALE del it.each de RBAC: es exactamente la conducta que este plan invierte. Es el unico caso existente que se toco, y se sustituye por 7 casos nuevos"
  - "Un usuario con roles ['T','A'] es admin (mismo criterio que ROLE_RANK del frontend y que app.is_admin del interceptor): ve la forma completa"
  - "Sin endpoint nuevo (`/api/projects/for-technician` esta prohibido por el CONTEXT y por 02-06): es la MISMA ruta con dos proyecciones"

patterns-established:
  - "Toda relajacion de @Roles trae en el mismo commit el it.each de las rutas que NO se relajaron, y se verifica en rojo moviendo el decorador a la clase"
  - "Los modelos de catalogo que crea una suite llevan prefijo propio y se borran en afterAll (los catalogos no se truncan): aqui ademas se siembran en orden INVERSO al esperado para que el orden de la respuesta sea demostrable"

requirements-completed: []

# Metrics
duration: 13min
completed: 2026-07-26
---

# Phase 3 Plan 03: `GET /api/projects` para el Técnico — solo nombre y máquinas Summary

**El bloqueo que 02-06 dejó firmado se cierra con un decorador, un `select` nuevo y un `if` de una línea: un Técnico ya lista los proyectos activos y recibe **exactamente** `{id, name, machines}` — ni valor de contrato, ni OA, ni cliente, ni horas normales —, y las otras seis rutas del controlador le siguen respondiendo 403, cada una asertada por nombre. Las dos aserciones que lo protegen se verificaron en rojo por separado y **cada una caza lo que la otra no ve**: el conjunto exacto de claves no detecta una fuga anidada dentro de `machines`; la sonda sobre `JSON.stringify` sí.**

## Performance

- **Duration:** ~13 min (2026-07-26T20:08Z → 20:21Z)
- **Tasks:** 2 de 2, las dos en TDD
- **Files modified:** 3 (0 creados, 3 modificados) + `deferred-items.md`
- **Dependencias nuevas:** 0 · **Migraciones:** 0 · **Ficheros de otro plan tocados:** 0

## El contrato que copia 03-05

```ts
// GET /api/projects — token de Tecnico (rol T sin A ni S)
// ProjectForTechnician[] — ORDER BY name asc, SOLO isActive = true
interface ProjectForTechnician {
  id: string;
  name: string;
  machines: {
    machineModelId: string;   // lo que la bitacora escribe en daily_entries.machine_model_id
    code: string;
    description: string | null;
  }[];                        // ORDER BY code asc; [] si el proyecto no tiene maquinas
}
```

Tres claves y ni una más. Un Admin o un Super Admin (incluido quien tenga `['T','A']`) sigue recibiendo el `ProjectListItem` de 02-05 sin un byte de diferencia: `clientName`, `contractValue` como `number`, `machineCodes`, `isActive`, e **incluyendo los inactivos** («filtra el selector, no el endpoint»).

La máquina del drawer sale de aquí, no del catálogo global: cada proyecto viaja con las suyas, así que el selector de máquina no necesita una segunda petición ni un `GET /api/projects/:id` (que sigue siendo `A·S`).

## Las cuatro verificaciones en rojo

| # | Qué se rompió a propósito | Casos caídos | Lo que demuestra |
|---|---|:--:|---|
| 1 | `clientName` añadido al `select` **y** al objeto devuelto | **2** — «claves EXACTAS» y «ningún dato comercial…» | Las dos aserciones cazan la fuga de primer nivel |
| 2 | `oaNumber: clientName` metido **dentro de cada `machines[]`** | **2** — «ningún dato comercial…» y «cada máquina llega con…» | La sonda caza la fuga ANIDADA; **el conjunto de claves de primer nivel se quedó VERDE**. Sin la sonda, `CLIENTE-SECRETO` viaja y nadie se entera |
| 3 | `where: { isActive: true }` fuera de `listarParaTecnico` | **1** — «un proyecto DESACTIVADO no le llega al técnico, y sí al admin» | El filtro no está de adorno |
| 4 | `@Roles('T','A','S')` movido del método a la **clase** | **6** — los seis casos del `it.each` de RBAC, cada uno nombrando su ruta | Se relajó UN método, no el controlador |

La #2 es la que justifica que el plan pidiera **dos** aserciones y no una: con la fuga anidada, `Object.keys(res.body[0]).sort()` sigue devolviendo `['id','machines','name']` y el test pasaría con el nombre del cliente viajando dentro de cada máquina.

Nota sobre la #1: el plan la describía como «añadir `clientName: true` a `LISTA_TECNICO`». Con la implementación tal y como quedó eso **no filtra nada** —`listarParaTecnico` desestructura `{ id, name, machines }` explícitamente, así que el `select` y el `map` son dos puertas—, y por eso la verificación se hizo del modo que sí reproduce el error real: añadiendo el campo **en los dos sitios**. Que la primera puerta sola no baste es una propiedad del diseño, no un hueco del test.

## Accomplishments

- **`LISTA_TECNICO` es un `select` propio, no un subconjunto de `LISTA`.** Una columna comercial nueva en el esquema (o en `LISTA`) no puede llegar a la respuesta del técnico sin que alguien la escriba a mano en esta constante. No hay `delete`, no hay `omit`, no hay borrado posterior: **lo que no se le pide al motor no se puede filtrar por error**.
- **Un `if` de una línea en el controlador, y va por roles.** RLS no ayuda: `proj_read` es `USING (TRUE)` y le dejaría al técnico leer todas las columnas de todos los proyectos. Se dice explícitamente en el comentario para que nadie intente «bajarlo al motor» más adelante.
- **`@Roles('A','S')` sigue en la clase.** El precedente de 02-03: restrictivo arriba, relajado en el método que lo necesita. Un endpoint futuro al que se le olvide el decorador cae del lado seguro.
- **Los seis 403 se afirman uno a uno.** `it.each` sobre `[método, ruta]`, así que la verificación #4 no dijo «falló el RBAC» sino que nombró `post /api/projects`, `patch /api/projects/:id/active`, `put /api/projects/:id/sold-days`… Un booleano no habría servido de nada.
- **El orden se demuestra, no se afirma.** Los dos modelos de máquina del caso de ordenación se siembran **al revés** (`ZZZ-0303-Z` antes que `MMM-0303-M`) y los tres proyectos del caso de orden por nombre también. Un `ORDER BY` que desapareciera dejaría el orden de inserción, que es justo el que el test rechaza.
- **El proyecto desactivado se prueba por las dos mitades y contra el conteo del owner.** El técnico ve solo el activo; el admin ve `await ownerClient.project.count()` filas, no «al menos una»: un filtro que se llevara los dos por delante pasaría un `length >= 1`.
- **Cero dependencias, cero migraciones, cero archivos de otro plan.** Los tres commits tocan exactamente `projects.service.ts`, `projects.controller.ts` y `projects.e2e-spec.ts`. `schema.prisma`, `prisma/migrations/`, `app.module.ts`, `frontend/**` y los `package.json` no aparecen en ningún diff.

## Task Commits

1. **Task 1 (TDD): `LISTA_TECNICO`, el reparto por rol y la prueba de fuga**
   - RED — `a341687` (test) · 3 casos en rojo (403 donde se espera 200), 45 previos verdes
   - GREEN — `0aeb92d` (feat) · **48/48**
2. **Task 2 (TDD): activos, orden y el resto de rutas cerradas**
   - `5f6eb2f` (test) · **52/52**

Sin fase REFACTOR: el GREEN quedó en su forma final.

**Honestidad sobre el RED de la Task 2:** sus cuatro casos nacieron **verdes**. La implementación de la Task 1 ya incluía `where: { isActive: true }` y los dos `sort`, tal y como el propio plan lo escribía en el `<action>` de la Task 1; escribir el filtro en la Task 2 solo para verlo caer habría sido teatro. La prueba de que esos cuatro casos protegen algo son las verificaciones en rojo **#3 y #4**, que es exactamente lo que el plan exigía registrar para esta tarea.

## Files Modified

- `backend/src/modules/projects/projects.service.ts` (+44) — `LISTA_TECNICO` con el porqué de que sea un `select` independiente, y `listarParaTecnico()` con el filtro de activos comentado contra la decisión bloqueada y el aplanado a `machineModelId`
- `backend/src/modules/projects/projects.controller.ts` (+17, −2) — `@Roles('T','A','S')` **solo** en el `@Get()`, el `@CurrentUser()` y el reparto por rol, con el razonamiento de por qué no es RLS
- `backend/test/projects.e2e-spec.ts` (+190, −1) — el `describe` de BIT-01 con 7 casos, y la línea que sale del `it.each` de RBAC (ver abajo)

## Único caso previo que hubo que tocar

El plan decía «no debería hacer falta ninguno». Hizo falta **uno**, y era inevitable:

```
it.each([
-  ['get', '/api/projects'],      // <- afirmaba 403 para un Tecnico
   ['post', '/api/projects'],
   ...
])('un Tecnico raso en %s %s → 403', ...)
```

Esa fila afirmaba **exactamente la conducta que este plan invierte**. No se relajó ni se reescribió: se quitó, con un comentario en su lugar que apunta al `describe` nuevo y explica que las seis que quedan son la prueba de que se relajó un método y no la clase. Los otros 44 casos de la suite están intactos, y la cuenta pasa de 45 a 52 (−1 +8: los 7 del técnico más… en realidad +8 casos nuevos menos 1 retirado; el `it.each` de RBAC pasa de 7 a 6 filas).

## Deviations from Plan

### Auto-fixed Issues

Ninguna. No apareció ni un bug, ni una funcionalidad crítica ausente, ni un bloqueo: 02-05 dejó el módulo con los `select` ya tratados como contrato y 02-03 dejó escrito el patrón del decorador.

### Desviaciones deliberadas respecto al texto del plan

- **`listarParaTecnico` desestructura en vez de propagar con `...p`.** El plan sugería un `map` sobre la fila; se escribió `({ id, name, machines }) => ({...})`, que cuesta lo mismo y convierte el `select` y el `map` en dos puertas independientes. Consecuencia registrada arriba: la verificación en rojo #1 tuvo que tocar los dos sitios para reproducir la fuga.
- **Las máquinas se ordenan en JS (`localeCompare`), no con un `orderBy` anidado.** Es lo que ya hacen `maquinas()` y el `machineCodes` de `listar()` en este mismo archivo; usar aquí el `ORDER BY` del motor habría metido una tercera convención de collation en el mismo servicio para el mismo dato.
- **La sonda de secretos afirma la LISTA de lo filtrado** (`expect(SECRETOS.filter(s => crudo.includes(s))).toEqual([])`) en vez de un `not.toContain` por cadena. Es la doctrina de 02-02 («los fallos se afirman como lista de strings, nunca como booleano»): el mensaje del fallo nombra el campo que se escapó. Se añadieron `oaNumber`, `normalHours` y `clientName` a las seis cadenas que pedía el plan.
- **Los seis 403 se quedan en el `it.each` que ya existía**, en vez de duplicarlos dentro del `describe` nuevo. Ya asertaban ruta por ruta con el mismo token de técnico; copiarlos habría sido mantener dos listas que pueden divergir. La verificación en rojo #4 confirma que cumplen su función desde donde están.
- **El técnico del `describe` nuevo se vincula a `TEC_A`** con un `update` de una línea sobre el usuario que ya crea el `beforeEach`, en vez de crear un segundo usuario con su propio token. Para este endpoint el vínculo es irrelevante (`proj_read` es `USING (TRUE)`), pero es el estado real del técnico de la captura y de él sale la GUC `app.technician_id` del resto de la fase.

### Simplificaciones deliberadas

- **Sin paginación ni búsqueda:** 4 proyectos reales y el techo del research está en ~500 filas. `ponytail:` anotado por el propio plan.
- **Sin DTO ni clase de respuesta:** el `select` es el contrato, como en todo el módulo desde 02-05.
- **Sin `entryCount` en las máquinas del técnico:** es el dato que necesita el admin para avisar antes de quitar una máquina. El técnico solo elige.

---

**Total deviations:** 0 auto-fixed + 5 desviaciones deliberadas + 3 simplificaciones
**Impact on plan:** Ninguna reduce el alcance ni ablanda una prueba. La única con consecuencia visible (desestructurar en vez de propagar) hace el aislamiento **más** difícil de romper y está registrada en la verificación en rojo que la delata.

## Issues Encountered

**Dos suites de la Fase 2 caen contra el CHECK que acaba de crear 03-01, y NO se han tocado.**

`npm -w backend run test:e2e` → **14 suites, 278 tests, 276 verdes**. Las dos rojas son:

| Suite | Caso | Error |
|---|---|---|
| `technicians.e2e-spec.ts` | `desactivar a un tecnico lo deja en la lista y sus jornadas siguen legibles` | 23514 `de_proyecto_por_concepto` |
| `sold-days.e2e-spec.ts` | `la matriz no cuenta las jornadas de otro proyecto ni las de ninguno` | 23514 `de_proyecto_por_concepto` |

Las dos llaman a `crearJornadaAprobada()` **sin `projectId`**, y ese helper tiene `conceptCode: 'DC'` fijo. Desde `20260726150806_bitacora` (03-01, commit `8d1e766`) eso es estado imposible en la base. **No es la interferencia entre procesos de 02-03:** se reprodujo idéntico en dos pasadas completas y en dos ejecuciones aisladas por suite, y el error es del motor, no del reloj.

No se arregla desde aquí por dos razones que el plan y las restricciones de la wave dejan explícitas: `test/helpers/fixtures.ts` es **contrato cerrado** de 02-01, y las dos suites son de planes que no son este. Queda escrito en `deferred-items.md` (ítem 5) con el dueño (**03-01**) y con la pista de que el arreglo del caso de `sold-days` **no** es meterle un `projectId` —su enunciado es literalmente «ni las de ninguno»— sino usar un concepto sin proyecto (`LR`/`NR`/`IL`), que es lo que el CHECK permite.

`projects.e2e-spec.ts` no se ve afectada: sus jornadas siempre llevan proyecto.

**`npm run build` de la raíz no se ejecutó**, y a propósito: encadena `prisma generate` (sobre el `schema.prisma` que 03-01 está editando en esta misma wave) y `vite build` del frontend (03-02). Un fallo ahí no sería atribuible a este plan y un éxito no probaría nada. En su lugar, **`npx tsc --noEmit -p backend/tsconfig.json` → exit 0**, que es lo que compila `nest build` de mis dos archivos.

## User Setup Required

Ninguno. Sin migraciones, sin variables de entorno, sin dependencias. Producción no se tocó.

Recordatorio heredado: `truncateAll()` se lleva al Super Admin del seed; tras correr la suite, `npm -w backend run db:seed` lo repone.

## Next Phase Readiness

**Para 03-05 (cutover de `LogDayDrawer`), ahora mismo:**
- El bloque `ts` de arriba es el tipo que va en `lib/api/projects.ts` (junto al `ProjectListItem` que ya existe). **La misma función `listProjects()` sirve**: la ruta es la misma y el servidor decide la forma por el token. Si el cliente tipado necesita distinguir, que lo haga por el rol de la sesión, no por otra URL.
- `LOG_PROJECTS` de `data.ts` **ya se puede retirar**: el selector de proyecto sale de este endpoint y el de máquina sale del `machines[]` del proyecto elegido, sin una segunda petición.
- Cuidado en el drawer: un técnico con roles `['T','A']` recibe la forma **de admin** (con `machineCodes: string[]` y sin `machines`). Es raro pero existe; si el drawer asume `machines`, ese usuario vería el selector de máquina vacío. Lo barato es que la pantalla trate `machines ?? []`.

**Para 03-04 (`/api/daily-entries`):**
- Este endpoint **no valida** que el proyecto que manda el técnico esté activo: lista activos, pero un `POST` con el id de un proyecto cerrado no pasa por aquí. Si esa regla hace falta, es del servicio de bitácora.
- Los días ya registrados contra un proyecto cerrado siguen siendo legibles: este filtro es del **selector**, y el `projectName` denormalizado de 03-04 es lo que los mantiene visibles.

**Concerns:**
- **El aislamiento comercial depende por completo de estas dos aserciones.** RLS no protege ni una columna aquí (`proj_read USING (TRUE)`), así que si alguien borra el caso del conjunto exacto de claves «porque falla al añadir un campo», la fuga sale a producción sin más síntoma. El comentario del `describe` lo dice; conviene que siga ahí.
- **`GET /api/projects/:id` sigue siendo `A·S`,** y con él la matriz y el encabezado de la Nota. Ningún plan de la Fase 3 lo necesita: el drawer tiene las máquinas en el listado.

## Self-Check: PASSED

- 3/3 archivos declarados existen en disco y están modificados: `projects.service.ts` (264 líneas), `projects.controller.ts`, `projects.e2e-spec.ts` (663 líneas).
- 3/3 commits en el historial: `a341687`, `0aeb92d`, `5f6eb2f`. Los tres tocan **solo** esos tres archivos (`git show --stat` de cada uno).
- `projects.service.ts` contiene `LISTA_TECNICO` y `listarParaTecnico`; `projects.controller.ts` contiene `listarParaTecnico` y `@Roles('T', 'A', 'S')`; `projects.e2e-spec.ts` contiene `JSON.stringify`.
- `@Roles('A', 'S')` sigue en la clase del controlador (verificado tras restaurar la verificación en rojo #4).
- **Cero `delete`, cero `omit`** en `src/modules/projects/`: la garantía está en el `select`.
- **No existe `/api/projects/for-technician`** ni ninguna ruta nueva: el diff del controlador son 17 líneas dentro del `@Get()` que ya existía.
- `npm -w backend run test:e2e -- projects` → **52/52** (45 previos − 1 retirado + 8 nuevos).
- `npm -w backend run test:e2e` → **14 suites, 276/278**; los 2 rojos son de otros planes y están documentados arriba y en `deferred-items.md`.
- `npx tsc --noEmit -p backend/tsconfig.json` → **exit 0**.
- **Cero dependencias nuevas:** `git diff` de `package.json`, `package-lock.json` y `backend/package.json` en los tres commits está vacío.
- **Cero migraciones y cero ficheros de otros planes:** `schema.prisma`, `prisma/migrations/`, `app.module.ts`, `test/helpers/fixtures.ts` y `frontend/**` no aparecen en ningún commit de este plan.
- **Cuatro verificaciones en rojo ejecutadas y revertidas**, con los casos caídos en la tabla de arriba (2, 2, 1 y 6). Tras cada reversión, la suite volvió a 48/48 o 52/52 según el punto.
- Los dos modelos de catálogo que crea la suite (`MMM-0303-M`, `ZZZ-0303-Z`) se borran en `afterAll`: dos pasadas seguidas de la suite dan el mismo resultado (comprobado, la suite se corrió 8 veces).

---
*Phase: 03-bit-cora-diaria*
*Completed: 2026-07-26*
