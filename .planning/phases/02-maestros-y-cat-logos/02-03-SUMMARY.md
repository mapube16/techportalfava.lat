---
phase: 02-maestros-y-cat-logos
plan: 03
subsystem: backend-api
tags: [nestjs, prisma, rbac, catalogos, tecnicos, e2e, jest, cat-01, cat-02]

# Dependency graph
requires:
  - phase: "02-01"
    provides: "las 8 tablas con RLS, los 8 conceptos sembrados por la migracion, test/helpers/fixtures.ts y el baseline de truncateAll()"
  - phase: "01-03"
    provides: "@Roles + RolesGuard, @CurrentUser, patron de modulo por dominio y validacion de body a mano"
  - phase: "01-02"
    provides: "RlsInterceptor (transaccion-por-peticion con las 3 GUCs) y PrismaService.client"
provides:
  - "GET /api/catalogs: los 4 catalogos en UNA peticion, abierto a T/A/S (contrato cerrado, lo consume la Fase 3)"
  - "PATCH /api/catalogs/concepts/:code: solo labelEs/labelIt, solo Super Admin"
  - "POST/PATCH de role-types, currencies y machine-models (Super Admin, con desactivacion)"
  - "GET/POST /api/technicians, PATCH /:id y PATCH /:id/active (Admin y Super Admin)"
  - "Contrato plano de tecnico con roleTypeName y userId resueltos"
  - "test/catalogs.e2e-spec.ts (33 casos) y test/technicians.e2e-spec.ts (20 casos)"
  - "CatalogsModule y TechniciansModule registrados en src/app.module.ts"
affects: [02-05-projects, 02-06-cutover, fase-03-bitacora, fase-04-aprobacion, fase-06-migracion, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@Roles restrictivo a nivel de CLASE y relajado en el metodo que lo necesita: el guard hace getAllAndOverride, asi que el olvido de un decorador en un endpoint futuro cae del lado seguro"
    - "Pre-chequeo de duplicado ANTES de escribir: un error del motor deja abortada la transaccion-por-peticion y el SELECT que averigua si la fila choca esta inactiva ya no se podria ejecutar"
    - "Traduccion Prisma -> HTTP en un helper privado por servicio (P2002/P2003/P2025): sin ella un id inventado o un FK inexistente salen como 500"
    - "Un solo servicio para los 4 catalogos: CRUD trivial sobre tablas de 3 columnas, sin regla de negocio que separar"
    - "El listado de maestros NO filtra por isActive: filtran los selectores del cliente (si no, el tecnico de baja con bitacora historica desaparece de la pantalla)"
    - "Los @Delete no existen: la baja es PATCH /:id/active y la ausencia de la ruta se afirma en los tests (404)"

key-files:
  created:
    - fava-control-tecnico/backend/src/modules/catalogs/catalogs.controller.ts
    - fava-control-tecnico/backend/src/modules/catalogs/catalogs.service.ts
    - fava-control-tecnico/backend/src/modules/catalogs/catalogs.module.ts
    - fava-control-tecnico/backend/src/modules/technicians/technicians.controller.ts
    - fava-control-tecnico/backend/src/modules/technicians/technicians.service.ts
    - fava-control-tecnico/backend/src/modules/technicians/technicians.module.ts
    - fava-control-tecnico/backend/test/catalogs.e2e-spec.ts
    - fava-control-tecnico/backend/test/technicians.e2e-spec.ts
  modified:
    - fava-control-tecnico/backend/src/app.module.ts

key-decisions:
  - "@Roles('S') a nivel de clase en CatalogsController y el GET lo relaja a T/A/S (contra la letra del plan, que pedia clase sin @Roles): la clase abierta convierte el olvido de un decorador en un endpoint publico para cualquier autenticado; asi lo convierte en un 403 para todos menos el Super Admin"
  - "El duplicado se detecta con un findUnique previo, no capturando P2002 y consultando despues: un error de Postgres aborta la transaccion de la peticion, asi que el SELECT que decide entre YA_EXISTE y YA_EXISTE_INACTIVO no se podria ejecutar. El catch de P2002 se conserva como red de seguridad para la carrera entre dos admins"
  - "P2025 -> 404 y P2003 -> 400 en los dos modulos: el plan solo pedia el P2003 de technicians, pero un PATCH con un UUID valido inexistente es una peticion bien formada y devolver 500 es un bug, no una decision"
  - "`aliases` no se selecciona ni se expone: la columna es de la Fase 6 (MIG-01) y exponerla ahora crearia un contrato que nadie escribe"
  - "PATCH /:id y PATCH /:id/active comparten el mismo metodo de servicio (`editar`): la baja es un campo, no una operacion distinta; lo que las separa es la ruta, no la logica"
  - "CAT-01 y CAT-02 NO se marcan completos: los 6 planes de la fase declaran los mismos IDs y su enunciado es de interfaz («Admin puede crear/editar...»). Es 02-06 el que los hace verificables. Mismo criterio que 02-01"
  - "Cualquier clave desconocida en el PATCH de concepto se ignora en silencio, pero `code` en el body es un 400 explicito: ignorar un intento de renombrar el codigo dejaria creer al cliente que lo consiguio"

patterns-established:
  - "Las suites que tocan catalogos limpian lo que ellas mismas crean y restauran lo que editan: los catalogos NO se truncan (02-01), asi que sin eso la segunda pasada choca con los @unique de la primera"
  - "El orden de una lista se afirma con localeCompare, no con Array.sort(): el ORDER BY de Postgres usa la collation de la base («Mecánico» antes de «Meccatronico») y .sort() compara unidades UTF-16"
  - "La ausencia de una ruta se prueba: it.each sobre los 5 DELETE de /api/catalogs afirmando 404 es lo unico que impide que un plan futuro la anada sin darse cuenta"

requirements-completed: []

# Metrics
duration: 42min
completed: 2026-07-26
---

# Phase 2 Plan 03: Catálogos y maestro de técnicos Summary

**Los dos módulos que alimentan todo lo demás: `GET /api/catalogs` devuelve los 4 catálogos en una sola petición abierta a los tres roles (la Fase 3 la consume con token de técnico), los 8 conceptos solo admiten edición de etiqueta ES/IT por Super Admin y ni la API ni el motor permiten añadir o quitar uno, y el maestro de técnicos da de alta gente sin cuenta Entra y la da de baja sin tocar su bitácora — 53 casos e2e nuevos, cero dependencias, y ni un `DELETE` en las 12 rutas.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-07-26T13:05:00Z (aprox.)
- **Completed:** 2026-07-26T13:47:00Z
- **Tasks:** 2 de 2 (las dos en TDD: RED commiteado antes del GREEN)
- **Files modified:** 9 (8 creados, 1 modificado)

## Accomplishments

- **`GET /api/catalogs` se escribe una vez y no se vuelve a tocar.** Cuatro `findMany` con `select` explícito en paralelo dentro de la transacción del `RlsInterceptor`, abierto a `T·A·S` porque la captura de la Fase 3 lo pide con token de técnico. El contrato (nombres de las 4 listas **y de sus campos**) se afirma campo a campo en el test: cambiar uno más adelante rompe el test antes de dejar en blanco la pantalla de captura.
- **CAT-01 está cerrado en las tres capas, y las tres se prueban.** El enum de Postgres (02-01) impide nombrar un noveno concepto; RLS sin política de INSERT/DELETE impide insertarlo incluso desde SQL (02-01); y aquí se cierra la tercera: **el endpoint no existe**. `POST /api/catalogs/concepts` y `DELETE /api/catalogs/concepts/DC` responden 404, y el test comprueba además que siguen siendo 8 después del DELETE.
- **Los 8 conceptos solo cambian de etiqueta, y solo por Super Admin.** Admin y Técnico reciben 403; un código que no es del enum da 400 (validado contra `Object.values(ConceptCode)`, no contra una lista copiada a mano); mandar `code` en el body da 400; y cualquier otra clave (`sortOrder`, `isActive`) se ignora en silencio — verificado con un caso que manda `sortOrder: 99` y comprueba que sigue siendo 1.
- **El duplicado contra una fila desactivada tiene su propio código.** `POST /api/catalogs/role-types` con el nombre de un rol inactivo devuelve `409 YA_EXISTE_INACTIVO` **con el `id` de la fila** para que la UI ofrezca reactivar; si la fila está activa, `409 YA_EXISTE`. Es la mitad de arriba del `@unique` normal que 02-01 eligió a propósito (desactivar no libera el nombre) — sin este código de error, la UI solo podría decir «ya existe» sobre algo que el usuario no ve en ningún selector.
- **CAT-02 probado por su parte difícil, no por el CRUD.** El caso que importa no es que el POST devuelva 201: es que después del POST **`users` tiene cero filas** apuntando al técnico nuevo (`user.count({ where: { technicianId } })`), porque los 14 técnicos del Excel no tienen cuenta Entra y un CRUD escrito por inercia crearía una.
- **La baja no destructiva se prueba releyendo la jornada.** El test siembra una jornada aprobada con `crearJornadaAprobada`, desactiva al técnico, comprueba que **sigue en el listado con `isActive: false`** y relee la jornada: sigue entera y sigue apuntando a su técnico. No hay `DELETE /api/technicians/:id` (404) y el test comprueba que el técnico sigue ahí tras intentarlo.
- **Ni un 500 en toda la superficie.** `roleTypeId` inexistente → `400 ROL_TECNICO_INEXISTENTE` (P2003), `id` inexistente en cualquier PATCH → 404 (P2025), `employmentType: 'FREELANCE'` → `400 TIPO_CONTRATACION_INVALIDO`, `roleTypeId` que no es un UUID → 400 antes de llegar a Postgres. Los cuatro son casos del test.
- **Cero dependencias nuevas.** `package.json` no se tocó: validación de body a mano (`texto`/`booleano`/`codigoIso`/`rol`/`tipo`, 3 líneas cada una) + `ParseUUIDPipe`, precedente 01-03.
- **Suite completa verde con los módulos nuevos dentro:** `npm -w backend run test` → 12 passed · `npm -w backend run test:e2e` → **12 suites, 196 passed** (las 10 anteriores + `catalogs` + `technicians`).

## Task Commits

1. **Task 1 (TDD) — RED:** `9bf8fc0` (test) · 33 casos de `catalogs.e2e-spec.ts` en rojo: 25 fallando, 8 pasando (los 404 de rutas que aún no existían — pasan trivialmente, y es correcto: la garantía «no hay endpoint» ya se cumplía)
2. **Task 1 (TDD) — GREEN:** `e0b62c3` (feat) · módulo `catalogs` + registro en `app.module.ts` → 33/33
3. **Task 2 (TDD) — RED:** `56006f7` (test) · 20 casos de `technicians.e2e-spec.ts`, 18 fallando
4. **Task 2 (TDD) — GREEN:** `d5add25` (feat) · módulo `technicians` + registro en `app.module.ts` → 20/20

Sin fase REFACTOR en ninguna de las dos: el código quedó en su forma final en el GREEN y un commit de limpieza vacío no aporta nada.

## Contrato definitivo del API (lo consume 02-06 al escribir los tipos del cliente)

### `GET /api/catalogs` — roles `T · A · S`

```ts
{
  concepts:      { code: string; labelEs: string; labelIt: string; sortOrder: number }[];  // ORDER BY sortOrder
  roleTypes:     { id: string; name: string; isActive: boolean }[];                        // ORDER BY name (collation de la BD)
  currencies:    { code: string; symbol: string; isActive: boolean }[];                    // ORDER BY code
  machineModels: { id: string; code: string; description: string | null; isActive: boolean }[];  // ORDER BY code
}
```

`concepts` tiene **siempre** 8 elementos en el orden `DC · MD · DFD · DVSF · DVRC · LR · NR · IL`. Las 4 listas incluyen los inactivos: **filtra el selector, no el endpoint**.

### Resto de `/api/catalogs` — rol `S`

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `PATCH` | `/concepts/:code` | `{ labelEs?, labelIt? }` — al menos uno; `code` en el body → 400 `CODIGO_NO_EDITABLE`; otras claves se ignoran | 200 `{ code, labelEs, labelIt, sortOrder }` |
| `POST` | `/role-types` | `{ name }` | 201 `{ id, name, isActive }` |
| `PATCH` | `/role-types/:id` | `{ name?, isActive? }` | 200 `{ id, name, isActive }` |
| `POST` | `/currencies` | `{ code, symbol }` — `code` = 3 letras, se normaliza a mayúsculas | 201 `{ code, symbol, isActive }` |
| `PATCH` | `/currencies/:code` | `{ symbol?, isActive? }` | 200 `{ code, symbol, isActive }` |
| `POST` | `/machine-models` | `{ code, description? }` — ausente o `null` → `null` | 201 `{ id, code, description, isActive }` |
| `PATCH` | `/machine-models/:id` | `{ code?, description?, isActive? }` | 200 `{ id, code, description, isActive }` |

### `/api/technicians` — roles `A · S`

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `GET` | `/api/technicians` | — | 200 `Tecnico[]`, ORDER BY `fullName`, activos **e** inactivos |
| `POST` | `/api/technicians` | `{ fullName, roleTypeId, employmentType }` — los tres obligatorios | 201 `Tecnico` |
| `PATCH` | `/api/technicians/:id` | `{ fullName?, roleTypeId?, employmentType? }` | 200 `Tecnico` |
| `PATCH` | `/api/technicians/:id/active` | `{ isActive }` (booleano obligatorio) | 200 `Tecnico` |

```ts
interface Tecnico {
  id: string;
  fullName: string;
  roleTypeId: string;
  roleTypeName: string;                      // resuelto del catalogo, plano
  employmentType: 'INTERNO' | 'EXTERNO';
  isActive: boolean;
  userId: string | null;                     // la cuenta Entra vinculada, si la hay
}
```

`aliases` **no** se expone: es de la Fase 6 (MIG-01).

### Códigos de error (todos son `res.body.message`)

| Código | HTTP | Cuándo |
|---|:--:|---|
| `CONCEPTO_INEXISTENTE` | 400 | `:code` no es uno de los 8 del enum |
| `CODIGO_NO_EDITABLE` | 400 | `code` viene en el body de un concepto |
| `NADA_QUE_EDITAR` | 400 | PATCH sin ningún campo reconocido |
| `NOMBRE_INVALIDO` · `SIMBOLO_INVALIDO` · `CODIGO_INVALIDO` · `LABEL_ES_INVALIDO` · `LABEL_IT_INVALIDO` | 400 | vacío tras `trim` o no es string |
| `CODIGO_MONEDA_INVALIDO` | 400 | no son exactamente 3 letras |
| `IS_ACTIVE_INVALIDO` | 400 | no es booleano |
| `ROL_TECNICO_INVALIDO` | 400 | `roleTypeId` no tiene forma de UUID |
| `ROL_TECNICO_INEXISTENTE` | 400 | `roleTypeId` es un UUID que no existe (P2003) |
| `TIPO_CONTRATACION_INVALIDO` | 400 | `employmentType` fuera del enum |
| `NO_ENCONTRADO` · `TECNICO_NO_ENCONTRADO` | 404 | el `id` del PATCH no existe (P2025) |
| `YA_EXISTE` | 409 | choca con una fila **activa** |
| `YA_EXISTE_INACTIVO` | 409 | choca con una fila **inactiva**; el body trae `existente` con su `id`/`code` para ofrecer reactivar |

**No existe ninguna ruta `DELETE`** en `/api/catalogs` ni en `/api/technicians`: responden 404 y hay tests que lo afirman.

## Files Created/Modified

- `backend/src/modules/catalogs/catalogs.service.ts` (151 líneas) — los 4 `select` que **son** el contrato, `todos()` con `Promise.all`, el `noDuplicar` con el razonamiento del pre-chequeo, y el traductor Prisma→HTTP
- `backend/src/modules/catalogs/catalogs.controller.ts` (127 líneas) — 8 rutas, `@Roles('S')` en la clase y `@Roles('T','A','S')` en el GET, validación de body a mano
- `backend/src/modules/technicians/technicians.service.ts` (97 líneas) — `TECNICO` con `roleType`/`user` anidados y `plano()` que los aplana; `crear` y `editar` (la baja reutiliza `editar`)
- `backend/src/modules/technicians/technicians.controller.ts` (81 líneas) — 4 rutas, `@Roles('A','S')` en la clase
- `backend/src/app.module.ts` — `CatalogsModule` y `TechniciansModule` junto a `UsersModule` (el de `projects` lo registra 02-05)
- `backend/test/catalogs.e2e-spec.ts` (383 líneas, 33 casos) — contrato, RBAC por endpoint, catálogo cerrado, duplicados activo/inactivo, normalización de moneda, los 5 DELETE
- `backend/test/technicians.e2e-spec.ts` (267 líneas, 20 casos) — alta sin Entra, contrato plano, FK/enum sin 500, baja con relectura de la jornada, RBAC table-driven

## Decisions Made

Ver `key-decisions` en el frontmatter. Las tres que más afectan a lo que viene:

1. **`@Roles('S')` en la clase y el GET lo relaja.** El plan pedía lo contrario (clase sin `@Roles`, decorador en cada endpoint). El guard usa `getAllAndOverride([handler, class])`, así que el método pisa a la clase y las dos formas dan el mismo resultado hoy. La diferencia está en el olvido: con la clase abierta, un endpoint nuevo sin decorador queda accesible a **cualquier autenticado** (incluido un técnico) y no falla ningún test existente; con la clase en `S`, ese mismo olvido se convierte en un 403 que el primer test detecta. Menos código y el fallo cae del lado seguro.
2. **El pre-chequeo de duplicado no es una preferencia de estilo, es una restricción del motor.** Dentro de la transacción-por-petición, un `P2002` deja la transacción de Postgres abortada: el `SELECT` que decidiría entre `YA_EXISTE` y `YA_EXISTE_INACTIVO` fallaría con `25P02`. El `catch` de `P2002` se conserva, pero solo puede responder `YA_EXISTE` — es la red de seguridad para la carrera entre dos Super Admins, no el camino normal.
3. **CAT-01 y CAT-02 siguen abiertos.** Su enunciado es de interfaz («Admin **puede** crear/editar técnicos») y los 6 planes de la fase declaran los mismos IDs. Marcarlos aquí haría que la verificación de fase mintiera con 02-05 y 02-06 por delante. Mismo criterio que 02-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `@Roles` restrictivo por defecto en `CatalogsController`**
- **Found during:** Task 1
- **Issue:** El plan pedía «`@Controller('api/catalogs')` **sin** `@Roles` a nivel de clase». Con la clase sin metadata, `RolesGuard` devuelve `true` para cualquier ruta cuyo método olvide el decorador: un endpoint nuevo mal decorado quedaría abierto a cualquier autenticado y ningún test lo detectaría.
- **Fix:** `@Roles('S')` en la clase y `@Roles('T','A','S')` en el `GET`, que lo relaja vía `getAllAndOverride`. Mismo comportamiento externo, un decorador menos, y el olvido cae del lado seguro.
- **Files modified:** `backend/src/modules/catalogs/catalogs.controller.ts`
- **Verification:** Los 3 casos de RBAC del GET (T, A, S → 200) y los 4 de mutación (A → 403) pasan.
- **Committed in:** `e0b62c3`

**2. [Rule 1 - Bug] `P2025` sin traducir sale como 500 en los dos módulos**
- **Found during:** Task 1
- **Issue:** El plan solo pedía traducir `P2003` (FK) en `technicians`. Un `PATCH /api/catalogs/role-types/<uuid-inexistente>` o `PATCH /api/technicians/<uuid-inexistente>` es una petición **bien formada** que Prisma resuelve con `P2025`; sin traducción el cliente recibe un 500 y el log un error no manejado.
- **Fix:** Un `intentar()` privado por servicio que mapea `P2025 → 404`, `P2002 → 409` y `P2003 → 400`. Una línea por punto de llamada.
- **Files modified:** `backend/src/modules/catalogs/catalogs.service.ts`, `backend/src/modules/technicians/technicians.service.ts`
- **Verification:** Casos «PATCH de un rol que no existe → 404» y «PATCH de un técnico que no existe → 404».
- **Committed in:** `e0b62c3`, `d5add25`

**3. [Rule 1 - Bug] Un `roleTypeId` que no es UUID llegaba a Postgres**
- **Found during:** Task 2
- **Issue:** `ParseUUIDPipe` solo cubre el path. `roleTypeId` viaja en el **body**, y una cadena que no es UUID contra una columna `@db.Uuid` es un `22P02` del motor → 500.
- **Fix:** Comprobación explícita de la forma del UUID en el controlador (`ROL_TECNICO_INVALIDO`, 400), como pedía el propio plan («comprobación explícita en el body»).
- **Files modified:** `backend/src/modules/technicians/technicians.controller.ts`
- **Verification:** Caso «un `roleTypeId` que no es un UUID → 400».
- **Committed in:** `d5add25`

**4. [Rule 1 - Bug] La aserción de orden del test estaba mal, no el `ORDER BY`**
- **Found during:** Task 1 (GREEN, 32/33)
- **Issue:** `expect(nombres).toEqual([...nombres].sort())` fallaba con `Mecánico` / `Meccatronico`. El `ORDER BY name` de Postgres usa la collation de la base y pone `Mecánico` primero (la `á` colaciona como `a`); `Array.sort()` compara unidades UTF-16 y la pone después de la `z`. El orden **correcto para un humano** es el del motor.
- **Fix:** La aserción compara con `localeCompare(…, 'es')`, con el porqué escrito al lado.
- **Files modified:** `backend/test/catalogs.e2e-spec.ts`
- **Verification:** 33/33.
- **Committed in:** `e0b62c3`

### Desviaciones deliberadas respecto al texto del plan

- **`descripcion` ausente y `null` son lo mismo.** El plan no lo decía; `POST /api/catalogs/machine-models { code }` sin descripción devuelve `description: null` en vez de un 400. Es lo que hace el seed (los 3 modelos de arranque no tienen descripción) y lo que necesita la pantalla Config.
- **`PATCH /:id` y `PATCH /:id/active` de técnicos comparten `editar()` en el servicio.** La baja es un campo, no una operación distinta; lo único que las separa es la ruta (y la ruta separada existe porque replica la forma que ya tiene `users`).
- **Los duplicados de rol se comprueban también en el PATCH**, no solo en el POST: renombrar un rol al nombre de otro es el mismo choque de `@unique` y merece el mismo 409 con su `existente`.
- **`NADA_QUE_EDITAR` (400) en los PATCH sin campos reconocidos.** Sin él, un body `{ foo: 1 }` movería `updated_at` sin cambiar nada — exactamente el ruido de auditoría que el research pide evitar (AUD-01 es append-only y llega en la Fase 4).

### Simplificaciones deliberadas

- **Un servicio para los 4 catálogos**, no cuatro. Son tablas de 3 columnas sin ninguna regla de negocio que separar; cuatro clases serían ceremonia.
- **Sin fase REFACTOR** en ninguna de las dos tareas: el GREEN quedó en su forma final.
- **Los helpers de validación viven en cada controlador**, no en un `src/common/validate.ts` compartido. Son 3 líneas cada uno y `src/common/` no es propiedad de este plan en la wave 2: un archivo nuevo ahí sería una colisión con 02-04 o 02-05 a cambio de ahorrar cuatro líneas.
- **Sin paginación ni búsqueda de servidor.** 14 técnicos y ~30 filas de catálogo; `filterBy()` en cliente ya existe (`ui.tsx`). El techo está en el research: paginación cuando una lista pase de ~500 filas.

## Issues Encountered

- **Interferencia entre suites e2e de planes paralelos, confirmada dos veces.** Una pasada de `catalogs` dio 7 fallos (incluidos casos que ya estaban verdes) y la siguiente, idéntica, dio 33/33. Y la pasada completa dio 2 fallos en `users-invite.e2e-spec.ts` (**archivo de 02-04**, no de este plan); ejecutada sola, esa suite da 25/25, y la siguiente pasada completa dio **196/196**. Es el escenario que anticipaba la restricción del prompt: `truncateAll()` de una suite vacía `users` mientras otra está a mitad. **No se editó ningún archivo por esto.**
- **`npm -w backend run build` falló una vez sin emitir ningún error de TypeScript** (`tsc --noEmit` limpio, `npx nest build` a secas exitoso, y la repetición del mismo comando exitosa). Colisión con un plan paralelo escribiendo `src/generated/prisma` / `dist` a la vez. No hay nada que arreglar en el código.
- **`truncateAll()` sigue borrando al Super Admin del seed** (documentado por 02-01). Repuesto con `npm -w backend run db:seed` al terminar: `dev@fava.local` con `T+A+S` y los catálogos de arranque están en su sitio.
- **La base local conserva lo que los tests dejaron en los catálogos** — pero **no** lo de esta suite: `catalogs.e2e-spec.ts` borra sus propios `Rol e2e nuevo` / `Rol e2e inactivo` / `ZZZ` / `E2E-MAQ` y **restaura la etiqueta de `DC`** en `afterAll`. Sin eso la segunda pasada choca con los `@unique` de la primera.

## User Setup Required

None. Todo corre contra el cluster local del puerto 55432. **Producción no se tocó** y este plan no añade ninguna migración.

## Next Phase Readiness

**Para 02-06 (cutover de frontend), ahora mismo:**
- El contrato de arriba es el definitivo. `lib/api/catalogs.ts` y `lib/api/technicians.ts` se pueden escribir copiando los dos bloques `ts` de la sección «Contrato definitivo».
- Los **selectores** filtran por `isActive`, no el endpoint. La pantalla Técnicos y la Config muestran los inactivos atenuados (`Techs.tsx` ya lo hace con `opacity`).
- El `409 YA_EXISTE_INACTIVO` trae `existente.id`: es lo que la UI necesita para ofrecer «reactivar» en vez de «ya existe».
- Los colores de concepto se quedan en el frontend (`i18n.ts` → mapa `código → color`); las **etiquetas** vienen del API.

**Para 02-05 (projects):**
- `src/app.module.ts` ya tiene `CatalogsModule` y `TechniciansModule`; registrar `ProjectsModule` es una línea en la misma lista.
- El patrón de traducción Prisma→HTTP (`P2002`/`P2003`/`P2025`) está en los dos servicios de este plan; copiarlo evita los 500 de FK que `project_machines` y `project_sold_days` van a generar.
- **`Promise.all` sobre `this.prisma.client` dentro de la transacción-por-petición funciona** (4 `findMany` en `GET /api/catalogs`, verificado en 33 casos). La matriz de días vendidos puede paralelizar sus lecturas.

**Para la Fase 3 (bitácora):**
- `GET /api/catalogs` responde con token de técnico y no hay que volver a tocarlo: los 8 conceptos con etiquetas ES/IT, los roles activos e inactivos, las monedas y los modelos de máquina salen de una sola petición.

**Concerns:**
- **Las suites e2e de esta fase no se pueden correr en paralelo contra el mismo Postgres.** `truncateAll()` es global y no hay aislamiento por suite. Con `--runInBand` dentro de un proceso está resuelto; entre procesos (dos agentes, o CI con `--maxWorkers>1` sobre la misma base) no. Dueño natural: el plan que monte el CI de la fase. Mitigación de hoy: re-ejecutar.
- **El smoke post-deploy sigue sin cubrir el Pitfall 7 para estas tablas.** `GET /api/catalogs` es ahora el candidato perfecto (una petición, cuatro tablas nuevas, cualquier rol) — dueño: el plan que amplíe `scripts/smoke.ts`.

## Self-Check: PASSED

- 9/9 archivos declarados existen en disco (8 creados + `app.module.ts` modificado).
- 4/4 commits de tarea existen en el historial: `9bf8fc0`, `e0b62c3`, `56006f7`, `d5add25`.
- `catalogs.controller.ts` contiene `api/catalogs`; `technicians.controller.ts` contiene `api/technicians`; `app.module.ts` contiene `CatalogsModule` y `TechniciansModule`; `technicians.service.ts` contiene `roleTypeId`.
- `catalogs.e2e-spec.ts` 383 líneas (mín. 60) · `technicians.e2e-spec.ts` 267 líneas (mín. 50).
- `npm -w backend run test` → **12 passed**. `npm -w backend run test:e2e` → **12 suites, 196 passed** (10 anteriores + las 2 nuevas).
- `npm -w backend run build` compila.
- **Cero `@Delete` en `src/modules/`**: verificado por grep, y por los 6 casos e2e que afirman 404.
- **Cero dependencias nuevas:** `git diff` de `package.json` / `package-lock.json` en los 4 commits está vacío.
- Verificación en rojo registrada en los dos TDD: 25/33 fallando en `catalogs` (los 8 verdes son los 404 de rutas inexistentes) y 18/20 en `technicians`.
- Los 8 conceptos siguen siendo 8 tras la suite; la etiqueta de `DC` volvió a su valor original.

---
*Phase: 02-maestros-y-cat-logos*
*Completed: 2026-07-26*
