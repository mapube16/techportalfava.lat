---
phase: 02-maestros-y-cat-logos
plan: 05
subsystem: backend-api
tags: [nestjs, prisma, decimal, postgres, queryraw, matriz, upsert, e2e, jest, cat-03, cat-04]

# Dependency graph
requires:
  - phase: "02-01"
    provides: "projects, project_machines, project_sold_days con RLS, los enums Phase/ConceptCode, test/helpers/fixtures.ts y el baseline de truncateAll()"
  - phase: "02-03"
    provides: "patron de modulo por dominio, validacion de body a mano, traduccion Prisma->HTTP (P2002/P2003/P2025) y Promise.all dentro de la tx-por-peticion"
  - phase: "01-03"
    provides: "@Roles + RolesGuard, @CurrentUser, ParseUUIDPipe como precedente de validacion"
  - phase: "01-07"
    provides: "POST /api/dev-auth/login, que es lo que hace posible el check autenticado del smoke"
provides:
  - "GET /api/projects: listado con machineCodes para los chips y contractValue como number"
  - "GET /api/projects/:id: encabezado de la Nota + machines (con entryCount) + matrix (sold/executed/delta)"
  - "POST /api/projects y PATCH /api/projects/:id: encabezado + comercial, y NADA mas (400 RECURSO_APARTE)"
  - "PATCH /api/projects/:id/active: desactivar, nunca borrar"
  - "PUT /api/projects/:id/machines: reemplaza la seleccion completa, idempotente, con entryCount informado"
  - "PUT /api/projects/:id/sold-days: una celda, valor absoluto, sin escribir si no cambia"
  - "La convencion del delta fijada en UNA linea de codigo: delta = sold - executed"
  - "La agregacion de ejecutados en UNA expresion SQL reutilizable por la Fase 7 (COALESCE del rol, solo approved, bucket sin fase)"
  - "scripts/smoke.ts con los dos 401 nuevos y el check AUTENTICADO opcional que caza el Pitfall 7"
  - "test/projects.e2e-spec.ts (45 casos) y test/sold-days.e2e-spec.ts (28 casos)"
affects: [02-06-cutover, fase-03-bitacora, fase-04-aprobacion, fase-05-nota-pdf, fase-06-migracion, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decimal SIEMPRE convertido con Number() en la capa de servicio: verificado que JSON.stringify de un Decimal de Prisma emite un STRING y ademas pierde el decimal fijo"
    - "La resta del delta existe en UNA sola linea del repo (const delta = (sold, executed) => sold - executed) y las dos rutas que lo devuelven la comparten"
    - "Los campos calculados no se ignoran en silencio: delta/executed/machines/soldDays en un body son un 400 con codigo propio"
    - "Validacion de existencia ANTES de escribir en las operaciones multi-fila: un P2003 deja la tx-por-peticion abortada (25P02) y ya no se puede consultar nada para dar un error decente"
    - "Las filas de una matriz se generan del catalogo (roles activos ∪ roles con dato) y el conjunto de columnas del enum: ninguna lista cableada"
    - "Un check de smoke puede OMITIRSE (simbolo OMITIDO) sin contar como fallo: asi el check que exige credenciales no obliga a tenerlas en todos los entornos"

key-files:
  created:
    - fava-control-tecnico/backend/src/modules/projects/projects.controller.ts
    - fava-control-tecnico/backend/src/modules/projects/projects.service.ts
    - fava-control-tecnico/backend/src/modules/projects/sold-days.service.ts
    - fava-control-tecnico/backend/src/modules/projects/projects.module.ts
    - fava-control-tecnico/backend/test/projects.e2e-spec.ts
    - fava-control-tecnico/backend/test/sold-days.e2e-spec.ts
  modified:
    - fava-control-tecnico/backend/src/app.module.ts
    - fava-control-tecnico/backend/scripts/smoke.ts

key-decisions:
  - "VERIFICADO contra el motor: Prisma 7 representa @db.Decimal con Decimal2 (decimal.js) y JSON.stringify emite {\"contractValue\":\"4150000.5\"} — string, y ademas pierde el decimal fijo (4150000.50 -> 4150000.5). La conversion explicita con Number() es obligatoria, no una precaucion"
  - "La agregacion de ejecutados y la composicion de la matriz viven las dos en sold-days.service.ts, no en projects.service.ts: son UN concepto (el delta y sus dos sumandos) y partirlas obligaria a un forwardRef circular o a duplicar la resta. projects.service.ts delega en una linea"
  - "El delta viaja tambien en la respuesta del PUT de la celda: sin el, la UI tendria que restar en el cliente para refrescar la fila — exactamente el anti-patron que el research prohibe"
  - "El bucket phase: null solo aparece si hay ejecutado sin fase: una fila «sin fase» vacia en todos los proyectos seria ruido permanente en la pantalla"
  - "machines/soldDays/delta/executed en el body de POST o PATCH de proyecto son 400 RECURSO_APARTE y no un descarte silencioso: ignorarlos dejaria creer al cliente que se guardaron (mismo criterio que CODIGO_NO_EDITABLE en 02-03)"
  - "PUT /machines comprueba proyecto y modelos ANTES de borrar en vez de confiar en deshacer la transaccion: un P2003 deja la tx abortada y el «todo o nada» quedaria colgando de un rollback que ya no puede informar de nada"
  - "El techo de contractValue es 1e12 porque @db.Decimal(14,2) son 12 digitos enteros: sin el, un valor mayor es un numeric field overflow (22003) convertido en 500"
  - "CAT-03 y CAT-04 NO se marcan completos: su enunciado se lee desde la pantalla y es 02-06 el que los hace verificables. Mismo criterio que 02-01, 02-02, 02-03 y 02-04"

patterns-established:
  - "Toda respuesta que lleve un @db.Decimal pasa por Number() en el servicio y tiene un test que afirma typeof === 'number'"
  - "Una convencion de calculo que el prototipo tiene mal se verifica EN ROJO invirtiendola: si tumba menos casos de los que deberia, el test no protege nada"
  - "Un test de idempotencia lleva su CONTROL en el mismo caso (un valor distinto SI mueve updated_at): sin el, la asercion puede pasar por resolucion del reloj"
  - "Las suites que crean filas de catalogo las nombran con un prefijo propio y las borran en afterAll: los catalogos no se truncan (02-01)"

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-07-26
---

# Phase 2 Plan 05: Proyectos, máquinas y matriz vendido/ejecutado/delta Summary

**Los 8 endpoints del corazón de la fase: el encabezado literal de la Nota Semanal ida y vuelta campo por campo, `contractValue` convertido a `number` porque se comprobó que Prisma lo serializa como string (y de paso le come el decimal), la selección de máquinas que se puede vaciar sin tocar una sola jornada, y la matriz cuyas filas salen del catálogo de roles con `delta = sold − executed` escrito en UNA línea del repo — verificada en rojo invirtiendo la convención del prototipo, que tumba 7 casos.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-26T13:21:00Z (aprox.)
- **Completed:** 2026-07-26T13:56:00Z
- **Tasks:** 3 de 3 (las tres en TDD, con RED commiteado antes del GREEN)
- **Files modified:** 8 (6 creados, 2 modificados)

## El hallazgo sobre `Decimal` (Pitfall 5), cerrado con evidencia

El research lo daba con confianza **MEDIA** y pedía verificarlo, no suponerlo. Verificado contra el motor antes de escribir el mapeo:

```
typeof en el cliente: object   Decimal2
JSON.stringify (lo que hace res.json de Express):
{"contractValue":"4150000.5"}
Number(): 4150000.5  number
```

Dos cosas, no una:

1. **Sale como string.** `Decimal.prototype.toJSON` gana, así que sin conversión explícita el frontend recibiría `"4150000.5"` y `money()` (`data.ts:85`, hace `v.toLocaleString()`) reventaría o imprimiría basura. El compilador **no** lo detectaría: el tipo del cliente está escrito a mano.
2. **Pierde el decimal fijo.** Se guardó `4150000.50` y el string es `"4150000.5"`. Incluso un frontend que hiciera `Number(...)` sobre el string llegaría al mismo sitio, pero cualquiera que imprimiera el string a pelo mostraría un valor con un decimal.

Y el `curl` de verdad contra el build local, ya con la conversión puesta:

```
{"id":"d267b13d-…","name":"CURL Decimal",…,"contractValue":4150000.5,"currencyCode":"USD",…}
```

`4150000.5` **sin comillas**: número JSON. La conversión va en el servicio con el razonamiento al lado (los valores reales, ~4,15 M con 2 decimales, están muy por debajo de 2^53, así que `Number` es exacto) y dos tests afirman `typeof === 'number'`, uno en el detalle y otro en el listado.

## Accomplishments

- **El encabezado de la Nota se prueba campo por campo, no con un `toEqual` del objeto entero.** Si un `select` incompleto se come `supply`, el mensaje del test **nombra el campo**. `locality` y `country` tienen su propio caso (KPI-04 agrupa por país; la Nota los imprime unidos, pero eso es de la Fase 5) y hay un `it.each` de los 6 campos obligatorios: sin ellos el PDF sale mutilado, así que faltan aquí y no en la Fase 5.
- **La convención del delta está verificada EN ROJO.** No basta con que los tests pasen: se invirtió la única línea que resta (`executed - sold`, que es lo que hace el prototipo) y **caen 7 casos**, incluidos los tres que importan (`delta: 9`, `delta: -1`, `delta: -2`). Un test que solo probara el caso positivo habría seguido verde con el signo mal, que es exactamente la trampa del Pitfall 4.
- **La resta existe en UN sitio.** `const delta = (sold, executed) => sold - executed` en `sold-days.service.ts`, y la comparten la composición de la matriz y la respuesta del PUT. El research prohíbe «cualquier resta de estas dos cantidades fuera del servicio»; aquí no hay ni dos dentro.
- **Las filas de la matriz se demuestran generadas, no cableadas.** El caso crea un rol en el catálogo **a mitad del test** y comprueba que la matriz pasa de N a N+2 filas y que las dos nuevas son las del rol nuevo. Y otro caso afirma `matrix.length === (roles activos) × 2` leyendo el conteo de la base, no una constante.
- **El rol desactivado no desaparece si tiene datos, y se prueba por las dos mitades.** Sin vendido ni ejecutado no aparece; con `sold: 30` aparece con `roleTypeActive: false`; y con **solo ejecutado** (un rol dado de baja que ya tiene bitácora) también. Si desapareciera, el total del proyecto cambiaría solo y el KPI se descuadraría en silencio.
- **La idempotencia lleva su control.** El segundo `PUT` con el mismo valor no mueve `updated_at` — y el mismo caso comprueba después que un valor **distinto sí lo mueve**. Sin ese control, la aserción podría estar pasando por la resolución del reloj en vez de porque no se escribe, y el `audit_log` append-only de la Fase 4 se llenaría de blurs sin edición igual.
- **Quitar una máquina con jornadas se prueba releyendo la jornada.** `PUT { machineModelIds: [] }` → 200, y la `daily_entry` sembrada sigue con su `machine_model_id` y su `project_id`, y el modelo sigue en el catálogo global. Es la decisión bloqueada «se avisa y se permite»: el servidor permite, el aviso lo da la UI con el `entryCount` que devuelve el detalle.
- **El smoke ya puede cazar el Pitfall 7 antes que un usuario.** Dos checks nuevos sin credenciales (`/api/catalogs` y `/api/projects` → 401, que prueban que la ruta existe y que ServeStatic no se la come) y **el check autenticado**: con `SMOKE_DEV_*` hace login de dev y pide las dos rutas esperando 200. Probado en las dos direcciones: con credenciales `7/7 en verde`, sin ellas `6/6 en verde (1 omitido)` y exit code 0.
- **Cero dependencias nuevas.** `git diff` de `package.json` / `package-lock.json` en los 7 commits está vacío.
- **Suite completa: 14 suites, 269 tests, todo verde** (las 12 anteriores intactas + `projects` 45 + `sold-days` 28). `npm run build` en la raíz compila los dos workspaces.

## Task Commits

1. **Task 1 (TDD): CRUD del proyecto + Decimal como number + smoke ampliado**
   - RED — `6c4967b` (test) · 31 de 33 en rojo (los 2 verdes son el `DELETE` → 404, que ya se cumplía trivialmente)
   - GREEN — `08337e1` (feat) · 31/33; los 2 rojos restantes son los RBAC de los dos `PUT` que llegan en las tareas 2 y 3
2. **Task 2 (TDD): `PUT /api/projects/:id/machines`**
   - RED — `07ee3ef` (test) · 13 en rojo de 45
   - GREEN — `edca57d` (feat) · 44/45
3. **Task 3 (TDD): matriz vendido/ejecutado/delta**
   - RED — `7b30053` (test) · **28/28 en rojo**
   - GREEN — `a75c7f2` (feat) · 28/28, y `projects` cierra en 45/45
4. **Documentación de `SMOKE_DEV_*`** — `2d4d520` (docs)

Sin fase REFACTOR en ninguna de las tres: el GREEN quedó en su forma final y un commit de limpieza vacío no aporta nada.

## Contrato definitivo del API (lo consumen 02-06 y 02-07)

### `GET /api/projects` — roles `A · S`

```ts
// ProjectListItem[] — ORDER BY name, incluye INACTIVOS (filtra el selector, no el endpoint)
{
  id: string;
  name: string;
  clientName: string;
  country: string;
  oaNumber: string | null;
  contractNumber: string;
  contractValue: number | null;      // number, NO string (ver § hallazgo Decimal)
  currencyCode: string | null;
  normalHours: number | null;
  isActive: boolean;
  machineCodes: string[];            // codigos ordenados, para los chips
}
```

### `GET /api/projects/:id` — roles `A · S`

```ts
{
  id: string;
  name: string;

  // ── Encabezado literal de la Nota Semanal ──
  clientName: string;
  clientNit: string | null;          // OJO Fase 5: NO es el «NIT:» del PDF (ver abajo)
  locality: string;                  // «Localidad:» SIN pais
  country: string;                   // KPI-04; la Nota lo imprime tras la localidad, unido por «, »
  supply: string;
  contractNumber: string;            // «Contrato:» y la columna NOTA de los 7 dias

  // ── Comercial ──
  oaNumber: string | null;
  contractValue: number | null;
  currencyCode: string | null;
  normalHours: number | null;
  isActive: boolean;

  machines: {
    machineModelId: string;
    code: string;
    description: string | null;
    entryCount: number;              // jornadas de ESTE proyecto con ese modelo (>0 → avisar antes de quitar)
  }[];                               // ORDER BY code

  matrix: {
    roleTypeId: string;
    roleTypeName: string;
    roleTypeActive: boolean;         // false = rol de baja que sigue apareciendo porque tiene datos
    phase: 'MONTAJE' | 'COLLAUDO' | null;   // null = bucket «sin fase» (historico del Excel)
    sold: number;
    executed: number;
    delta: number;                   // sold − executed. NEGATIVO = sobreejecucion. El cliente NO resta
  }[];                               // agrupada por rol (nombre asc), y dentro MONTAJE · COLLAUDO · null
}
```

`matrix` tiene una fila por **(rol activo ∪ rol con `sold > 0` o `executed > 0`) × (MONTAJE, COLLAUDO)**, más las filas `phase: null` que existan. Un rol nuevo en el catálogo añade sus dos filas sin tocar código.

### Escrituras

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `POST` | `/api/projects` | `{ name, clientName, locality, country, supply, contractNumber }` obligatorios; `clientNit?, oaNumber?, contractValue?, currencyCode?, normalHours?` | 201 `ProjectDetail` (sin `machines`/`matrix`: van en el GET) |
| `PATCH` | `/api/projects/:id` | cualquiera de los de arriba; al menos uno | 200 `ProjectDetail` |
| `PATCH` | `/api/projects/:id/active` | `{ isActive }` booleano obligatorio | 200 `ProjectDetail` |
| `PUT` | `/api/projects/:id/machines` | `{ machineModelIds: string[] }` — reemplaza TODO; `[]` es válido; ids repetidos se deduplican | 200 `machines[]` |
| `PUT` | `/api/projects/:id/sold-days` | `{ roleTypeId, phase, soldDays }` — **una celda** | 200 `{ roleTypeId, phase, sold, executed, delta }` |

**El `POST` y el `PATCH` devuelven el proyecto SIN `machines` ni `matrix`.** El detalle completo es del `GET`: quien acaba de crear un proyecto no tiene ni máquinas ni días vendidos que leer.

### Códigos de error (todos en `res.body.message`)

| Código | HTTP | Cuándo |
|---|:--:|---|
| `NOMBRE_INVALIDO` · `CLIENTE_INVALIDO` · `LOCALIDAD_INVALIDO` · `PAIS_INVALIDO` · `SUMINISTRO_INVALIDO` · `CONTRATO_INVALIDO` | 400 | obligatorio ausente o vacío tras `trim` |
| `NIT_INVALIDO` · `OA_INVALIDO` | 400 | presente pero no es string |
| `VALOR_CONTRATO_INVALIDO` | 400 | no es número, es negativo o pasa de 1e12 (`Decimal(14,2)` son 12 dígitos enteros) |
| `HORAS_NORMALES_INVALIDAS` | 400 | no es entero >= 0 |
| `CODIGO_MONEDA_INVALIDO` | 400 | no son exactamente 3 letras (se normaliza a mayúsculas: `usd` → `USD`) |
| `MONEDA_INEXISTENTE` | 400 | la moneda tiene forma válida pero no está en el catálogo (P2003) |
| `RECURSO_APARTE` | 400 | el body trae `machines`, `machineModelIds`, `soldDays`, `delta` o `executed` |
| `NADA_QUE_EDITAR` | 400 | PATCH sin ningún campo reconocido |
| `IS_ACTIVE_INVALIDO` | 400 | no es booleano |
| `MAQUINAS_INVALIDAS` · `MAQUINA_INVALIDA` | 400 | `machineModelIds` no es array · un elemento no tiene forma de UUID |
| `MAQUINA_INEXISTENTE` | 400 | algún `machineModelId` no existe — **y la selección previa NO se toca** |
| `CAMPO_CALCULADO_NO_ADMITIDO` | 400 | `delta` o `executed` en el body de sold-days |
| `ROL_TECNICO_INVALIDO` · `FASE_INVALIDA` · `DIAS_VENDIDOS_INVALIDOS` | 400 | `roleTypeId` sin forma de UUID · `phase` fuera del enum · `soldDays` no entero, negativo o > 9999 |
| `ROL_O_PROYECTO_INEXISTENTE` | 400 | el `roleTypeId` (o el proyecto) del sold-days no existe (P2003) |
| `PROYECTO_NO_ENCONTRADO` | 404 | el `:id` no existe (GET, PATCH y PUT de máquinas) |

**No existe ninguna ruta `DELETE`** en `/api/projects`: responde 404 y hay un test que lo afirma y comprueba que el proyecto sigue ahí.

## ⚠ Para la Fase 5 (Nota Semanal en PDF) — se repite porque es el error más caro de la fase

**El `NIT:` que imprime el encabezado de la Nota es el de FAVA (`901137532-4`), constante del membrete, NO `clientNit`.** En el PDF real está en la columna del membrete (x≈103), pegado a «FAVA LATINO AMERICA S.A.S.» y a la dirección de Bogotá; el bloque del cliente empieza en x≈257. `clientNit` se guarda y se expone porque **CAT-03 lo pide** (los clientes colombianos tienen NIT y el criterio 1 exige capturarlo y verlo), pero enchufarlo en esa casilla entregaría a un cliente un documento firmado con el identificador fiscal equivocado. El aviso está en `schema.prisma` junto a la columna, en el `select` del servicio, en el contrato de arriba y en el 02-01-SUMMARY.

Lo demás del encabezado ya está en su forma final: `clientName`, `locality` + `country` (dos campos, la Nota los une con `, `), `supply`, `contractNumber` (que es también el valor de la columna NOTA de los 7 días, no un campo aparte) y los modelos de máquina del proyecto (`description ?? code`, unidos por `, `). El «Cargo durante esta semana» sigue siendo de la Fase 4 (NOTA-09).

## Files Created/Modified

- `backend/src/modules/projects/projects.service.ts` (220 líneas) — los dos `select` que **son** el contrato, la conversión de `Decimal` con la evidencia al lado, `maquinas()` con el `groupBy` del `entryCount`, `fijarMaquinas()` con la comprobación previa, y el traductor Prisma→HTTP
- `backend/src/modules/projects/sold-days.service.ts` (183 líneas) — `const delta` (el único sitio donde se resta), `fijar()` (upsert que no escribe si no cambia), `matriz()` (composición desde el catálogo) y `ejecutados()` (la expresión SQL con sus tres comentarios)
- `backend/src/modules/projects/projects.controller.ts` (195 líneas) — 7 rutas, `@Roles('A','S')` en la clase, validación de body a mano, `sinRecursosAparte()` y el rechazo de `delta`/`executed` **antes** de cualquier otra validación
- `backend/src/modules/projects/projects.module.ts` — controlador + los dos servicios
- `backend/src/app.module.ts` — `ProjectsModule` junto a `CatalogsModule` y `TechniciansModule` (02-03 no se pisó: dos líneas añadidas)
- `backend/scripts/smoke.ts` — `exige401()` (que de paso desduplica el check de `/api/me`), los dos checks nuevos, el check autenticado y el estado **OMITIDO** que no cuenta como fallo
- `backend/test/projects.e2e-spec.ts` (474 líneas, 45 casos) — encabezado, `Decimal`, contrato del listado, obligatorios, `RECURSO_APARTE`, desactivar, y el bloque de 12 casos de máquinas
- `backend/test/sold-days.e2e-spec.ts` (466 líneas, 28 casos) — matriz desde el catálogo, delta con negativos, idempotencia con control, bucket sin fase, `COALESCE`, campos calculados

## Decisions Made

Ver `key-decisions` en el frontmatter. Las cuatro que más afectan a lo que viene:

1. **La agregación y la matriz viven en `sold-days.service.ts`, no en `projects.service.ts`.** El plan pedía la composición en `projects.service.ts` y la agregación «en una sola expresión SQL» ahí también; el `<action>` de la tarea 3 y el `key_links` del frontmatter se contradicen entre sí sobre dónde. Se eligió el único reparto que no duplica la resta ni obliga a un `forwardRef` circular: el delta y sus dos sumandos son **un** concepto y se leen seguidos en un archivo; `projects.service.ts` delega en una línea (`this.soldDays.matriz(id)`).
2. **El PUT de la celda devuelve `delta`.** Sin él, la UI del autoguardado tendría que restar en el cliente para refrescar la fila que acaba de guardar — el anti-patrón declarado. Cuesta una consulta de agregación en el camino de escritura y elimina la aritmética del cliente.
3. **`RECURSO_APARTE` es un 400, no un descarte silencioso.** El plan admitía las dos («esos campos se ignoran (o 400)»). Ignorar un `PATCH { machines: [...] }` dejaría al cliente creyendo que guardó una selección de máquinas que nunca se escribió. Mismo criterio que `CODIGO_NO_EDITABLE` en 02-03.
4. **CAT-03 y CAT-04 siguen abiertos.** El backend está entero y probado, pero los criterios se leen desde la pantalla (`Projects.tsx`, `ProjectDetail.tsx`, `NewProjectModal.tsx`), que es 02-06. Marcarlos aquí haría que la verificación de fase mintiera con el cutover por delante. Mismo criterio que los cuatro planes anteriores.

## Deviations from Plan

### Auto-fixed Issues

Ninguna. Las tres tareas se ejecutaron como estaban escritas y no apareció ni un bug, ni una funcionalidad crítica ausente, ni un bloqueo: el esquema de 02-01 y las convenciones de 02-03 dejaron el camino hecho. El único hallazgo técnico del plan (la serialización de `Decimal`) **estaba previsto en el propio plan**, que pedía verificarlo antes de escribir el mapeo — y se verificó, con el resultado arriba.

### Desviaciones deliberadas respecto al texto del plan

- **La agregación de ejecutados está en `sold-days.service.ts`, no en `projects.service.ts`.** El `key_links` del frontmatter esperaba el `COALESCE` en `projects.service.ts`; está en `sold-days.service.ts`, a un `import` de distancia. Razón en Decisión 1. Es la única desviación estructural del plan.
- **El `POST` y el `PATCH` de proyecto no devuelven `machines` ni `matrix`.** El plan no lo especifica. Devolverlos obligaría a correr la agregación y el `groupBy` en cada creación, para un proyecto que por definición no tiene ni máquinas ni días vendidos.
- **`PUT /sold-days` de un proyecto inexistente es 400 `ROL_O_PROYECTO_INEXISTENTE`, no 404.** Distinguir cuál de los dos FKs falló exigiría una consulta extra **en cada escritura de celda** (el camino del autoguardado), y el `projectId` viene de la URL que la UI acaba de cargar: el error que un cliente puede cometer de verdad es el del rol. El código de error nombra las dos posibilidades en vez de mentir sobre una. Las otras dos rutas (`GET /:id`, `PUT /machines`) **sí** dan 404 porque ahí la comprobación ya era necesaria.
- **`exige401()` se extrajo en el smoke y el check de `/api/me` pasa a usarlo.** El plan pedía «una línea por check, manteniendo el estilo»; tres copias del mismo cuerpo de 8 líneas eran peor estilo que un helper. El check de `/api/me` conserva su mensaje exacto, incluida la pista de «el estático está capturando /api».
- **El techo de `soldDays` es 9999 (el del research) y el de `contractValue` 1e12.** El segundo no lo pedía el plan: sin él, un valor mayor es un `numeric field overflow` del motor convertido en 500.
- **`normalHours` solo se valida como entero >= 0.** El schema lo documenta como «horas normales pactadas por jornada», pero poner un techo de 24 sería inventar una regla de negocio que nadie pidió y que rechazaría un dato semanal legítimo.

### Simplificaciones deliberadas

- **Los helpers de validación viven en el controlador**, no en un `src/common/validate.ts` compartido. Mismo razonamiento que 02-03: son 3 líneas cada uno.
- **`project_machines` se reescribe siempre** (`deleteMany` + `createMany`), sin comparar antes si el conjunto cambió. Idempotente significa «mismo estado resultante», y esa tabla no tiene `updated_at` que envenenar; comparar conjuntos para ahorrar dos sentencias en una operación de edición de proyecto sería código sin comprador.
- **Sin paginación ni búsqueda de servidor** en `GET /api/projects`: 4 proyectos reales, y `filterBy()` ya existe en el cliente. El techo del research es ~500 filas.
- **La matriz no se cachea ni se materializa.** Son 3 consultas por detalle de proyecto; una vista materializada o una columna `executed` denormalizada es exactamente lo que el criterio 3 prohíbe.
- **Sin `technicianId` en `project_sold_days`** (Open Question 2 del research): el modelo es rol×fase por decisión bloqueada. Anotado ahí como riesgo de conciliación de la Fase 6, no resuelto aquí por especulación.

---

**Total deviations:** 0 auto-fixed + 6 desviaciones deliberadas + 5 simplificaciones
**Impact on plan:** Ninguna reduce el alcance ni ablanda una prueba. La única estructural (dónde vive la agregación) resuelve una contradicción interna del propio plan eligiendo la opción que mantiene la resta en un solo sitio, que es lo que el plan más insiste en garantizar.

## Issues Encountered

- **Ni una interferencia entre suites.** Este plan corrió solo en la wave 3 y las dos pasadas completas del e2e dieron 269/269 a la primera. Confirma el diagnóstico de 02-03 y 02-04: el problema era la concurrencia entre procesos sobre la misma base, no los tests.
- **`truncateAll()` sigue borrando al Super Admin del seed** (herencia conocida de 02-01). Repuesto con `npm -w backend run db:seed` antes del smoke final y de dejar el repo.
- **El check autenticado del smoke exige `DEV_AUTH_ENABLED=true`** para que exista `POST /api/dev-auth/login`. En local se levantó el build con `DEV_AUTH_ENABLED=true DEV_AUTH_PASSWORD=…` solo para la comprobación; **el `.env` del repo no se tocó**. Anotado en `deferred-items.md`: sin `SMOKE_DEV_*` en el entorno del job, el check se omite y el smoke sale verde sin haber probado los privilegios.
- **El proyecto que creó el `curl` de verificación se borró de la base local** al terminar.

## User Setup Required

Ninguno para desarrollo. Todo corre contra el cluster local del puerto 55432 y **producción no se tocó**: este plan no añade ninguna migración.

**Para que el smoke post-deploy sirva de algo en Railway** hay que poner `SMOKE_DEV_EMAIL` y `SMOKE_DEV_PASSWORD` en el entorno donde corra `npm -w backend run smoke` (mientras `DEV_AUTH_ENABLED` siga encendido). Sin ellas el check **se omite** y no falla: el Pitfall 7 seguiría descubriéndose en el primer `GET /api/projects` de un usuario real.

## Next Phase Readiness

**Para 02-06 (cutover de frontend), ahora mismo:**
- El contrato de la sección «Contrato definitivo» es el definitivo. `lib/api/projects.ts` se escribe copiando los dos bloques `ts`.
- **`ProjectDetail.tsx:35` hay que BORRARLO, no corregirlo.** El `delta` llega calculado en cada fila de `matrix`; la resta del cliente (`dn - s`, invertida) se elimina. Negativo = sobreejecución = color de alerta. Anotado en `deferred-items.md`.
- **El botón «Guardar» de la matriz (`ProjectDetail.tsx:83`) desaparece:** el autoguardado es una celda por petición (`PUT /:id/sold-days`) y no hay endpoint que reciba la matriz entera.
- Las filas de la matriz **vienen del servidor**: la pantalla las pinta en el orden en que llegan (rol asc, y dentro MONTAJE · COLLAUDO · sin fase). Nada de `Record<Phase, Record<RoleType, number>>`.
- La UI muestra el diálogo de confirmación al quitar una máquina **solo si `entryCount > 0`**; el servidor no bloquea nunca.
- `machineCodes` del listado es lo que necesitan los chips de `Projects.tsx`.
- Códigos de error que la pantalla debe traducir: la tabla completa está arriba. Los dos que el usuario verá de verdad son `MONEDA_INEXISTENTE` y `MAQUINA_INEXISTENTE` (catálogo desincronizado tras una desactivación) y `DIAS_VENDIDOS_INVALIDOS` (el revert de la celda).

**Para la Fase 3 (bitácora):**
- `GET /api/projects` está cerrado a `A · S`. Cuando la captura necesite la lista de proyectos con token de **técnico**, hará falta relajar el `@Roles` del `GET` (como hizo 02-03 con `/api/catalogs`), no un endpoint nuevo. RLS ya permite la lectura a cualquier rol (`proj_read USING (TRUE)`), así que es un decorador.
- `daily_entries.role_type_id` y `phase` alimentan la agregación **desde la primera jornada capturada**: el `executed` de la matriz empieza a moverse solo, sin tocar este módulo.

**Para la Fase 7 (tableros):**
- La expresión SQL de `ejecutados()` es la que hay que reutilizar para KPI-01/KPI-04 (basta cambiar el `WHERE`). Las tres decisiones abiertas con FAVA (`MD` como día completo, el rol de la jornada por encima del maestro, el bucket sin fase) están comentadas **dentro** de la consulta: se cambian ahí y en ningún otro sitio.

**Concerns:**
- **El `entryCount` cuenta jornadas de CUALQUIER estado**, no solo aprobadas — a propósito: el aviso «esta máquina ya tiene bitácora» debe dispararse también con borradores. El `executed` de la matriz, en cambio, solo cuenta `approved`. Son dos preguntas distintas y por eso son dos consultas distintas.
- **Dos admins editando la misma celda a la vez: gana el último.** Techo declarado en un comentario `ponytail:` junto al upsert, con la salida (bloqueo optimista por `updated_at`) escrita. Con dos administradores es el comportamiento correcto.
- **`ROL_O_PROYECTO_INEXISTENTE` nombra dos causas.** Si alguna vez el autoguardado empieza a devolver ese 400 en producción con proyectos que existen, es el rol; si es el proyecto, el usuario está en una pantalla de un proyecto borrado (que no se puede borrar por API).

## Self-Check: PASSED

- 8/8 archivos declarados existen en disco (6 creados + 2 modificados).
- 7/7 commits en el historial: `6c4967b`, `08337e1`, `07ee3ef`, `edca57d`, `7b30053`, `a75c7f2`, `2d4d520`.
- `projects.controller.ts` contiene `api/projects`; `sold-days.service.ts` contiene `upsert` y `sold - executed`; `projects.service.ts` contiene `roleType`/`soldDays.matriz`; `sold-days.service.ts` contiene `COALESCE`; `smoke.ts` contiene `api/projects`; `app.module.ts` contiene `ProjectsModule`.
- `projects.e2e-spec.ts` 474 líneas (mín. 70) · `sold-days.e2e-spec.ts` 466 líneas (mín. 80).
- `npm -w backend run test` → **12 passed**. `npm -w backend run test:e2e` → **14 suites, 269 passed** (las 12 anteriores sin tocar + `projects` 45 + `sold-days` 28).
- `npm run build` en la raíz compila los dos workspaces (frontend `tsc && vite build` incluido).
- `npm -w backend run smoke` contra el build local: **7/7 en verde** con `SMOKE_DEV_*`, **6/6 (1 omitido)** sin ellas y exit code 0.
- **Verificación en rojo registrada:** invertir `delta` a `executed - sold` tumba **7 casos** de `sold-days` (incluidos `delta: 9`, `delta: -1` y `delta: -2`); restaurado y 28/28. Los tres RED de las tareas también quedaron registrados (31/33, 13/45, 28/28).
- **Cero dependencias nuevas:** `git diff HEAD~7 -- package.json package-lock.json backend/package.json` está vacío.
- **Cero `@Delete` en `src/modules/projects/`**, y un caso e2e que afirma el 404 y que el proyecto sigue existiendo.
- **Producción no se tocó:** ninguna migración nueva, ningún `.env` modificado.

---
*Phase: 02-maestros-y-cat-logos*
*Completed: 2026-07-26*
