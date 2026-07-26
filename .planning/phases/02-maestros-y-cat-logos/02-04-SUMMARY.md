---
phase: 02-maestros-y-cat-logos
plan: 04
subsystem: auth
tags: [nestjs, prisma, rbac, rls, jest, e2e, users, technicians]

# Dependency graph
requires:
  - phase: "01-03"
    provides: "modulo users con la escalada de roles y los dos anti-lockout, EntraGuard con vinculacion email→OID, /api/me como union discriminada, helpers de test (app.ts, tokens.ts)"
  - phase: "02-01"
    provides: "users.technician_id con @unique + FK a technicians, truncateAll() con TEC_A/TEC_B como filas reales"
provides:
  - "POST /api/users: invitar (fila con entra_oid null que el primer login reclama por email)"
  - "PATCH /api/users/:id/technician: el vinculo usuario↔tecnico del que sale la GUC app.technician_id"
  - "GET /api/users devuelve technicianId (contrato de la pantalla Usuarios)"
  - "P2002/P2003 traducidos a 409 TECNICO_YA_VINCULADO / 409 EMAIL_YA_REGISTRADO / 400 TECNICO_INEXISTENTE: ni un 500 en los caminos de conflicto"
  - "test/users-invite.e2e-spec.ts: 25 casos, con la GUC app.technician_id probada en accion via una sonda solo-de-test"
affects: [02-06-cutover, fase-03-bitacora]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La regla de escalada extraida a un helper variadico (exigirSuperParaAdmins) que consumen asignarRoles y crear: una condicion, dos caminos"
    - "Conflictos traducidos desde el codigo de Prisma en vez de precomprobados con SELECT: menos idas a la BD y sin la carrera del check-then-act"
    - "Prisma 7 con driver adapter no rellena meta.target: el nombre de la restriccion se lee de meta.driverAdapterError.cause.originalMessage, buscando el IDENTIFICADOR (no traducible) dentro de un mensaje que si viene traducido"
    - "Sonda solo-de-test (controlador declarado en el propio .e2e-spec y registrado en el modulo de testing) para probar una cadena que aun no tiene endpoint publico: cero superficie en produccion"

key-files:
  created:
    - fava-control-tecnico/backend/test/users-invite.e2e-spec.ts
  modified:
    - fava-control-tecnico/backend/src/modules/users/users.service.ts
    - fava-control-tecnico/backend/src/modules/users/users.controller.ts
    - fava-control-tecnico/backend/test/users-roles.e2e-spec.ts

key-decisions:
  - "La escalada NO se duplica: se extrae a exigirSuperParaAdmins(actor, ...conjuntos) y la usan asignarRoles (roles nuevos + roles del objetivo) y crear (roles de la invitacion)"
  - "vincularTecnico NO recibe el actor: vincular un tecnico no concede ningun privilegio, asi que la unica puerta es el @Roles('A','S') de clase. Anadir una regla condicional aqui seria inventar una que nadie pidio"
  - "Los dos conflictos se traducen del error del motor (P2002/P2003) y no se precomprueban: dos SELECT previos abren una carrera y el @unique ya tiene la respuesta correcta"
  - "traducirConflicto recibe un `porDefecto`: si Prisma cambia donde esconde el nombre de la restriccion, cada llamador sabe cual de los dos @unique puede chocar en SU caso y la respuesta sigue siendo un 409 correcto"
  - "El ultimo comportamiento (la GUC en accion) se prueba con una sonda declarada en el propio spec, no tocando helpers/app.ts ni app.module.ts: la Fase 3 estrenara los endpoints de bitacora, pero la cadena se verifica hoy"
  - "La asercion de forma de users-roles.e2e-spec.ts pasa de 5 a 6 campos: es la expansion de CAMPOS que anunciaba su propio comentario, no una relajacion (los 9 casos de escalada y anti-lockout siguen intactos)"
  - "CAT-05 NO se marca completo: falta el cutover de Users.tsx / InviteUserModal.tsx (02-06). Mismo criterio que 02-01 y 02-02"

patterns-established:
  - "Un endpoint que escribe sobre una columna @unique tiene que traer su caso de 409 en la suite: el 500 del constraint es el fallo por defecto, no la excepcion"
  - "Cuando el camino a probar no tiene endpoint publico todavia, la sonda va en el spec (controlador local + modulo de testing), nunca en app.module.ts"

requirements-completed: []

# Metrics
duration: 21min
completed: 2026-07-26
---

# Phase 2 Plan 04: Invitación de usuarios y vínculo con técnico Summary

**`POST /api/users` y `PATCH /api/users/:id/technician` sobre el módulo `users` de la Fase 1, con la regla de escalada extraída a un único helper que ahora consumen los dos caminos, los tres conflictos del motor traducidos (ni un 500) y — lo que justifica el plan — la GUC `app.technician_id` probada **en acción**: sin vínculo el usuario ve 0 jornadas, tras vincularlo ve exactamente sus 5 y ninguna de las 3 del otro técnico.**

## La precondición de la Fase 3 queda cubierta (y así se prueba)

`app.technician_id` — la GUC que aísla la bitácora en `RlsInterceptor` — se lee de `req.user.technicianId`, es decir de `users.technician_id`. Esa columna existía desde 02-01 y **nadie la escribía**: la Fase 3 habría arrancado con todos los técnicos viendo cero registros propios y el fallo se habría diagnosticado como un bug de RLS.

Ahora se escribe, y la cadena completa está probada de punta a punta en `users-invite.e2e-spec.ts`:

| Eslabón | Cómo se prueba |
|---|---|
| endpoint → columna | `PATCH /api/users/:id/technician` → 200 y `ownerClient` confirma la columna |
| columna → contrato | `GET /api/users` devuelve `technicianId` (la pantalla Usuarios puede mostrar el vínculo) |
| columna → guard | `GET /api/me` **del propio usuario vinculado** devuelve `user.technicianId` |
| guard → interceptor → política | Una petición HTTP de ese usuario a una **sonda solo-de-test** que lee `daily_entries` por `prisma.client`: **antes** de vincular devuelve `[]` (GUC vacía, política `de_self` en default-deny), **después** devuelve sus 5 filas y ninguna de las 3 de `TEC_B`, con el `ownerClient` contando 8 para que la lista vacía no pueda pasar por éxito |

El «antes» es la mitad que importa: demuestra que las 5 filas aparecen **por el vínculo** y no porque la política estuviera abierta.

## Performance

- **Duration:** ~21 min
- **Started:** 2026-07-26T12:52:00Z (aprox.)
- **Completed:** 2026-07-26T13:13:00Z
- **Tasks:** 2 de 2 (las dos en TDD, con RED verificado)
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments

- **La escalada de roles sigue viviendo en una sola condición.** `crear` no la reimplementa: se extrajo `exigirSuperParaAdmins(actor, ...conjuntos)` y la llaman `asignarRoles` (con los roles nuevos **y** los del objetivo, que es la mitad que impide que un Admin degrade a su Super Admin) y `crear` (con los roles de la invitación). Los 9 casos de `users-roles.e2e-spec.ts` siguen verdes sin tocarlos.
- **Cero 500 en los caminos de conflicto.** Los tres errores que el motor puede devolver están traducidos y probados: `409 EMAIL_YA_REGISTRADO`, `409 TECNICO_YA_VINCULADO` y `400 TECNICO_INEXISTENTE`. Y el caso «reasignar un técnico ya vinculado» se prueba **completo**: 409, desvincular, y entonces sí 200 — que es exactamente el procedimiento que la pantalla tendrá que explicar.
- **El invitado vincula su login de verdad, no en teoría.** El test invita a `invitado@fava.local`, firma un token con un `oid` que la app no ha visto nunca y ese mismo email, y comprueba que `/api/me` responde `ok` y que la fila queda con `entra_oid = 'oid-recien-llegado'`. Es el patrón de 01-03 ejercitado desde el endpoint nuevo.
- **La normalización del email tiene su propio caso.** Invitar a `'  Nombre@Fava.Local '` guarda `nombre@fava.local`. Sin esto el invitado **nunca** vincula su login (el guard normaliza el claim antes de buscar) y el síntoma sería «tu cuenta no está habilitada» en el primer login real.
- **Siete bodies inválidos en una tabla** (`it.each`): email sin arroba, vacío, ausente; `displayName` vacío y ausente; roles inválidos y vacíos. Incluido el `technicianId` que no es UUID → 400, que sin validación sería un `22P02` convertido en 500.
- **Cero dependencias nuevas y `app.module.ts` intacto** (lo tocó 02-03 en esta misma wave, no este plan). `helpers/db.ts` y `fixtures.ts` tampoco se tocaron.

## Task Commits

1. **Task 1 (TDD): POST /api/users — invitar reutilizando la escalada existente**
   - RED — `0ca8151` (test) · 15/15 en rojo con 404
   - GREEN — `8d4bf8f` (feat)
2. **Task 2 (TDD): PATCH /api/users/:id/technician — el vínculo de la Fase 3** — `5f2d839` (feat) · RED real sobre el discriminador de la restricción (ver Desviación 1)

## Files Created/Modified

- `src/modules/users/users.service.ts` — `crear()`, `vincularTecnico()`, el helper `exigirSuperParaAdmins()` (que `asignarRoles` ahora llama en vez de repetir la condición), `traducirConflicto()` y `CAMPOS` con `technicianId`. `entraOid: null` va con el comentario que explica por qué es deliberado.
- `src/modules/users/users.controller.ts` — `POST /` y `PATCH /:id/technician`, más `leerEmail` / `leerNombre` / `leerTecnicoId` (validación a mano, precedente 01-03: los bodies son de 4 campos escalares).
- `test/users-invite.e2e-spec.ts` — 25 casos + la sonda `api/_sonda-bitacora` y el constructor de app local que la registra.
- `test/users-roles.e2e-spec.ts` — **una línea**: la aserción de forma de `GET /api/users` gana `technicianId` (Desviación 2).

## Decisions Made

Ver `key-decisions` en el frontmatter. Las tres que afectan a lo que viene:

1. **`vincularTecnico` no recibe el actor.** Vincular un técnico no concede privilegios (al contrario: acota lo que ese usuario ve en la bitácora), así que la única puerta es el `@Roles('A','S')` de clase. Si alguna vez hace falta «solo un Super Admin vincula», la regla va al servicio como las otras, no a un decorador.
2. **La sonda vive en el spec, no en `app.module.ts`.** Un endpoint de diagnóstico en producción sería una superficie nueva que nadie pidió y que habría que retirar. Cuando la Fase 3 estrene `GET /api/daily-entries`, ese test puede sustituir a la sonda; hasta entonces la cadena está cubierta.
3. **`CAT-05` no se marca completo.** El backend está entero, pero el requisito se lee desde la pantalla (`Users.tsx` + `InviteUserModal.tsx`, plan 02-06). Mismo criterio que 02-01 y 02-02: marcarlo aquí haría que la verificación de fase mintiera.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 con driver adapter no rellena `meta.target`**
- **Found during:** Task 2 (fue el RED real de la tarea: 2 de 25 casos en rojo)
- **Issue:** El plan asume que se puede distinguir **qué** `@unique` se violó para responder `TECNICO_YA_VINCULADO` o `EMAIL_YA_REGISTRADO`. La vía habitual (`e.meta.target`) **no existe** con `@prisma/adapter-pg`: verificado contra el motor, el error trae `code: 'P2002'` y `meta: { modelName: 'User', driverAdapterError: { cause: { originalCode: '23505', originalMessage: 'llave duplicada viola restricción de unicidad «users_technician_id_key»' } } }`. Sin discriminar, reasignar un técnico ya vinculado respondía `409 EMAIL_YA_REGISTRADO` — un 409 que manda a mirar el campo equivocado.
- **Fix:** el nombre de la restricción se lee de `meta.driverAdapterError.cause.originalMessage` buscando el **identificador** (`technician_id` / `email`), que es lo único que el cluster no traduce (el mensaje que lo envuelve sí viene en español). Y `traducirConflicto` recibe un `porDefecto`: si Prisma vuelve a mover el dato, `PATCH` sigue respondiendo `TECNICO_YA_VINCULADO` y `POST` `EMAIL_YA_REGISTRADO`, que son los únicos conflictos posibles en cada caso.
- **Files modified:** `backend/src/modules/users/users.service.ts`
- **Verification:** los dos casos rojos (`PATCH` sobre un técnico ya vinculado y `POST` con ese técnico) pasan a verde; 25/25 en la suite.
- **Committed in:** `5f2d839`

**2. [Rule 3 - Blocking] La aserción de forma de `users-roles.e2e-spec.ts` (Fase 1) fijaba 5 campos**
- **Found during:** Task 1
- **Issue:** El plan exige que `GET /api/users` devuelva `technicianId` (contrato de la pantalla Usuarios) y el comentario de `CAMPOS` anunciaba esa expansión desde 01-03. Pero `users-roles.e2e-spec.ts:144` compara `Object.keys(...).sort()` con la lista **exacta** de 5 campos: añadir el sexto la pone roja. Es un choque directo entre dos exigencias del propio brief (expandir `CAMPOS` vs. mantener verde la suite de la Fase 1).
- **Fix:** `'technicianId'` añadido a esa lista, con el comentario que dice de dónde viene. **Una línea, y ninguna de las 9 aserciones de escalada y anti-lockout se toca**: el caso que cambia prueba la *forma* del contrato, no la regla.
- **Files modified:** `backend/test/users-roles.e2e-spec.ts`
- **Verification:** `users-roles` 10/10; los 3 casos de escalada (`Admin→Admin 403`, `Super Admin→Admin 200`, `Admin→otro Admin 403`) y los 3 anti-lockout, verdes sin editarlos.
- **Committed in:** `8d4bf8f`

### Desviaciones deliberadas respecto al texto del plan

- **`vincularTecnico` se implementó en el commit de la Task 1, no en el de la Task 2.** El propio plan lo pide («`technicianId` opcional en el POST: si viene, se aplica la misma validación de la Task 2 — mismo helper, no una copia»), y el traductor de `P2002`/`P2003` es ese helper compartido: separarlo habría significado escribir la lógica dos veces o dejar el `POST` con `technicianId` respondiendo 500 durante un commit. Consecuencia: **el RED de la Task 2 no fue un 404, fue el discriminador de la restricción** (Desviación 1) — dos casos rojos de 25, y son precisamente los dos que el plan marca como «409, no un 500».
- **La sonda no está en el plan.** El plan pide que el último comportamiento se compruebe «de forma observable», y hoy **ningún endpoint público lee `daily_entries`** (eso es la Fase 3): sin sonda, la única alternativa era repetir a mano el `set_config` del interceptor, que prueba la política pero **no** que el interceptor lea la columna. La sonda son 8 líneas en el spec y un constructor de app local (12 líneas) que no toca `helpers/app.ts` (Fase 1) ni `app.module.ts` (02-03 en esta misma wave).
- **`400 TECNICO_INEXISTENTE` y no 404.** El plan admitía «400/404 con código propio». Es 400 porque el recurso pedido (el usuario) **sí** existe; lo inválido es el cuerpo. Un 404 aquí diría que el usuario no está.

### Simplificaciones deliberadas

- **Sin `class-validator`:** tres funciones `leer*` de 3 líneas, precedente 01-03. La de `technicianId` valida el formato UUID a mano porque `ParseUUIDPipe` no acepta `null` y un string cualquiera sería un `22P02` (500).
- **Sin comprobar `instanceof PrismaClientKnownRequestError`:** se lee `e.code` por duck-typing. Con driver adapters la clase puede venir de una copia distinta del runtime y el `instanceof` fallaría en silencio, mandando el error al `throw e` genérico (500).
- **Invitar sin `roles` en el body es invitar a un Técnico.** Es el 90 % de los casos y el plan lo pide; un `roles` obligatorio solo añadiría un campo que la pantalla rellenaría siempre igual.
- **La invitación no manda correo.** Resend es V1X-01 y está diferido: la fila creada es lo que el primer login reclama. Escrito en el docstring de `crear` para que nadie lo lea como un olvido.

---

**Total deviations:** 2 auto-fixed (las 2 blocking) + 3 desviaciones deliberadas + 4 simplificaciones
**Impact on plan:** Ninguna reduce el alcance. La Desviación 1 es una realidad de Prisma 7 que conviene que sepan los planes que vienen (**todo endpoint que traduzca un `@unique` en esta base tiene que leer `meta.driverAdapterError.cause.originalMessage`, no `meta.target`**); la 2 es el choque previsto entre expandir `CAMPOS` y una aserción de forma escrita en la Fase 1.

## Issues Encountered

- **Las suites de dos planes en paralelo no pueden correr a la vez** (ya documentado por 01-03 y confirmado otra vez). A mitad de la Task 1, un `test:e2e` completo dio 13 fallos en `catalogs` y `rls-maestros` — suites de 02-02 y 02-01 — mientras 02-03 tenía trabajo sin commitear. Ni un solo fallo en las dos suites de este plan. **No se editó ningún archivo ajeno**: se re-ejecutó al final y el resultado fue **12 suites, 196 tests, todo verde**.
- **`truncateAll()` sigue borrando al Super Admin del seed** (herencia conocida): tras correr las suites, `npm -w backend run db:seed` lo repone.
- **Dos comandos de `gsd-tools` no encajan con el formato de estos archivos y devuelven `updated: true` sin escribir nada.** `state advance-plan` busca los campos `Current Plan` / `Total Plans in Phase` y este STATE.md escribe `Plan: 3 of 6` (error: *«Cannot parse Current Plan»*); `roadmap update-plan-progress` reporta `summary_count` correcto pero no toca la línea `**Plans**: 6 (n/6 complete)`. Corregido a mano: `Progress:` y el contador del ROADMAP. **El `Plan: N of 6` de STATE.md se deja como está a propósito**: tres planes de esta wave lo comparten y el contador lo debe mover quien cierre la wave, no un plan que corre en paralelo. Además, `state record-metric` pega su fila **fuera** de la tabla de métricas (le pasa igual a la fila de 02-03): es cosmético y del regex de la herramienta.
- **STATE.md lo estaban escribiendo tres ejecutores a la vez.** La línea `Progress:` se revirtió dos veces entre mi escritura y la lectura siguiente (read-modify-write concurrente). Quedó en su valor correcto al final; no hay nada que arreglar en el repo, pero conviene saber que **el contador de progreso no es fiable a mitad de una wave paralela**.

## User Setup Required

Ninguno. Todo corre contra el cluster local del puerto 55432 y **producción no se tocó** (este plan no añade ninguna migración).

## Next Phase Readiness

**Para 02-06 (cutover de pantallas):**
- `POST /api/users` con `{ email, displayName, roles?, technicianId? }` y `PATCH /api/users/:id/technician` con `{ technicianId: string | null }` son los dos endpoints que `InviteUserModal.tsx` y `Users.tsx` necesitan. `GET /api/users` ya trae `technicianId`.
- Códigos de error que la UI debe saber traducir: `EMAIL_INVALIDO`, `DISPLAY_NAME_INVALIDO`, `ROLES_INVALIDOS`, `TECHNICIAN_ID_INVALIDO` (400), `SOLO_SUPER_ADMIN_ASIGNA_ADMIN` (403), `EMAIL_YA_REGISTRADO`, `TECNICO_YA_VINCULADO` (409), `TECNICO_INEXISTENTE` (400).
- **La UI tiene que ofrecer «desvincular primero»** cuando reciba `TECNICO_YA_VINCULADO`: el vínculo es 1-a-1 por motor y no hay reasignación en un paso (probado en la suite).
- La lista de técnicos para el selector la sirve 02-03 (`GET /api/technicians`).

**Para la Fase 3 (bitácora):**
- `app.technician_id` **ya se puede poblar** y está probado end-to-end (ver la tabla del principio). Un técnico sin vínculo ve **cero** registros: eso es correcto y deliberado, pero conviene que la pantalla de bitácora lo diga («tu usuario no está vinculado a un técnico») en vez de mostrar una lista vacía.
- Cuando exista `GET /api/daily-entries`, ese test puede **sustituir** a la sonda de este spec (`api/_sonda-bitacora`), que existe solo porque hoy no hay endpoint público que lea la tabla.

**Concerns:**
- El vínculo se puede cambiar en caliente: si un usuario ya tenía jornadas y se le reasigna otro técnico, deja de ver las anteriores (siguen ahí, las ve el Admin). Es el comportamiento correcto para RLS, pero es un cambio con consecuencias visibles y **no hay confirmación ni aviso** en el endpoint — si FAVA lo pide, el diálogo va en la UI (02-06).
- `users` sigue **sin políticas RLS** (decisión de 01-02): el aislamiento de estos dos endpoints es de capa de servicio (`@Roles('A','S')` + la regla de escalada). No hay red debajo si una fase futura añade un endpoint que escriba `users` sin decorar.

## Self-Check: PASSED

- 1/1 archivo creado y 3/3 modificados existen en disco.
- 3/3 commits de tarea en el historial: `0ca8151`, `8d4bf8f`, `5f2d839`.
- `users-invite.e2e-spec.ts` 323 líneas (mín. 60) y contiene `technician`; `users.controller.ts` lo contiene 7 veces.
- `npm -w backend run test` → **12 passed**.
- `npm -w backend run test:e2e` → **12 suites, 196 passed** (incluye las 7 de la Fase 1 y las de 02-01/02-02/02-03).
- `npm -w backend run build` verde; `tsc --noEmit` sin errores.
- RED registrado en las dos tareas: Task 1 → 15/15 en 404; Task 2 → 2/25 por el discriminador de la restricción.
- **`git show --name-only` de los 3 commits: exactamente 4 archivos, los 4 de este plan.** Ni `package.json`, ni `package-lock.json`, ni `app.module.ts`, ni `helpers/**`, ni `src/modules/catalogs/**`, ni `src/modules/technicians/**`, ni `scripts/**` (los commits de 02-02 y 02-03 están intercalados en el historial, así que un diff por rango los incluiría: la comprobación se hace commit a commit).

---
*Phase: 02-maestros-y-cat-logos*
*Completed: 2026-07-26*
