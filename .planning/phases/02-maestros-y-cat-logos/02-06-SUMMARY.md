---
phase: 02-maestros-y-cat-logos
plan: 06
subsystem: frontend
tags: [react, typescript, vite, cutover, api-client, autoguardado, delta, criterio-4, cat-01, cat-02, cat-03, cat-04, cat-05]

# Dependency graph
requires:
  - phase: "02-03"
    provides: "GET /api/catalogs (4 catalogos en una peticion) y el maestro de tecnicos con baja no destructiva"
  - phase: "02-04"
    provides: "POST /api/users (invitar) y PATCH /api/users/:id/technician (el vinculo del que sale app.technician_id)"
  - phase: "02-05"
    provides: "los 8 endpoints de proyectos, la matriz rol x fase con delta = sold - executed y contractValue como number"
  - phase: "02-02"
    provides: "scripts/check-no-free-text.mjs con los 4 hallazgos que este plan tenia que cerrar"
  - phase: "01-05"
    provides: "apiFetch con Bearer y handler unico de 401, state.tsx como provider, primitivos de ui.tsx"
provides:
  - "lib/api/{catalogs,technicians,users,projects}.ts: los 4 clientes tipados sobre el contrato cerrado de la wave 2-3"
  - "lib/api/useApiData.ts: carga + error como codigo del servidor, el patron de la Fase 1 factorizado"
  - "Las 5 pantallas de administracion leyendo del API real (criterio 5 del roadmap)"
  - "El delta invertido del prototipo BORRADO: la resta no existe en el cliente"
  - "Matriz con filas del catalogo de roles y autoguardado por celda con reversion"
  - "check:no-free-text enganchado a npm run build: el criterio 4 ya no se puede romper en silencio"
  - "data.ts reducido a los mocks sin backend, con la fase que retira cada uno"
affects: [fase-03-bitacora, fase-04-aprobacion, fase-05-nota-pdf, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Los tipos del dominio viven junto a su cliente tipado (lib/api/*.ts), que es donde esta el contrato; types.ts se queda con los tipos de interfaz"
    - "apiFetch desenvuelve el `message` del error del backend: la UI ramifica por codigo, no por un JSON entero"
    - "useApiData(cargar, deps) con setData expuesto: la pantalla refleja su propia escritura sin volver a pedir la lista"
    - "state.dataVersion + refresh(): un modal que crea algo invalida la lista de detras sin una libreria de estado"
    - "Ninguna lista de dominio se carga en el arranque de la sesion: GET /api/projects esta cerrado a A·S y un tecnico veria un 403 al entrar"
    - "El delta NO se calcula en el cliente: llega en cada fila de la matriz y en la respuesta del PUT de la celda"

key-files:
  created:
    - fava-control-tecnico/frontend/src/lib/api/catalogs.ts
    - fava-control-tecnico/frontend/src/lib/api/technicians.ts
    - fava-control-tecnico/frontend/src/lib/api/users.ts
    - fava-control-tecnico/frontend/src/lib/api/projects.ts
    - fava-control-tecnico/frontend/src/lib/api/useApiData.ts
  modified:
    - fava-control-tecnico/frontend/src/screens/Projects.tsx
    - fava-control-tecnico/frontend/src/screens/ProjectDetail.tsx
    - fava-control-tecnico/frontend/src/screens/Techs.tsx
    - fava-control-tecnico/frontend/src/screens/Users.tsx
    - fava-control-tecnico/frontend/src/screens/Config.tsx
    - fava-control-tecnico/frontend/src/screens/Kpis.tsx
    - fava-control-tecnico/frontend/src/components/NewProjectModal.tsx
    - fava-control-tecnico/frontend/src/components/InviteUserModal.tsx
    - fava-control-tecnico/frontend/src/components/LogDayDrawer.tsx
    - fava-control-tecnico/frontend/src/lib/api/client.ts
    - fava-control-tecnico/frontend/src/state.tsx
    - fava-control-tecnico/frontend/src/types.ts
    - fava-control-tecnico/frontend/src/data.ts
    - fava-control-tecnico/frontend/src/i18n.ts
    - fava-control-tecnico/frontend/src/ui.tsx
    - fava-control-tecnico/frontend/src/Layout.tsx
    - fava-control-tecnico/frontend/src/screens/NoAccess.tsx
    - fava-control-tecnico/package.json

key-decisions:
  - "El delta invertido se BORRA, no se corrige de signo: el servidor manda `delta` en cada fila y en la respuesta del PUT, asi que la unica resta del repo sigue estando en sold-days.service.ts"
  - "Ninguna lista se carga en el provider: `GET /api/projects` es A·S y `state.projects` en el arranque habria dado 403 a cualquier tecnico. Cada pantalla carga lo suyo, y LogDayDrawer (pantalla de tecnico) se queda con mock hasta que la Fase 3 relaje ese @Roles"
  - "El mock de Kpis se muda DENTRO de Kpis.tsx con la forma nueva (filas rol x fase): data.ts guarda lo de bitacora/notas/gastos/auditoria, y el mock de una pantalla de la Fase 7 no es eso"
  - "El delta agregado de Kpis tambien estaba invertido (`mD + cD - (mS + cS)`) y se corrigio: dos convenciones distintas en la misma app es como vuelve el bug"
  - "money/nf/initials salen de data.ts a ui.tsx: no son mocks, son presentacion, y asi «ninguna de las cinco pantallas importa de data.ts» es literal y comprobable con grep"
  - "El ABM de modelos de maquina entra en Config aunque el plan solo pedia roles y monedas: sin el, el catalogo global que alimenta el selector de maquinas de los proyectos no tiene ninguna interfaz"
  - "La UI muestra el codigo de error del servidor tal cual tras un «No se pudo guardar»: traducir ~30 codigos que el backend puede ampliar es tabla muerta hasta que FAVA diga cuales ve"
  - "CAT-01..CAT-05 SI se marcan completos aqui: los cinco planes anteriores los dejaron abiertos a proposito porque su enunciado se lee desde la pantalla, y la pantalla es este plan"

patterns-established:
  - "Una pantalla cableada al API tiene tres estados y dos lineas de codigo para ellos: `if (error) return <ApiState .../>` y `if (!data) return <ApiState .../>`"
  - "Un guarda-rail que llega a verde se engancha al build en el mismo commit que lo pone verde: si se deja para «luego», vuelve a rojo sin que nadie se entere"
  - "Cualquier escritura del cliente que dependa de un @unique o de un FK muestra el codigo del servidor, nunca un mensaje inventado: el codigo nombra el campo que hay que mirar"

requirements-completed: [CAT-01, CAT-02, CAT-03, CAT-04, CAT-05]

# Metrics
duration: 62min
completed: 2026-07-26
---

# Phase 2 Plan 06: Cutover de las cinco pantallas de administración Summary

**Proyectos, Detalle, Técnicos, Usuarios y Config dejan de leer `data.ts` y leen los 20 endpoints de la wave 2-3 a través de cuatro clientes tipados; el delta invertido del prototipo no se corrige de signo sino que **desaparece** (el servidor lo manda calculado y la única resta del repo sigue viviendo en `sold-days.service.ts`); las filas de la matriz salen del catálogo de roles y cada celda se guarda sola al salir del campo, revirtiendo y avisando si falla — y el guarda-rail del criterio 4 pasa de `5/7 · exit 1` a `7/7 · exit 0` y queda **enganchado a `npm run build`**, así que ya no puede volver a romperse en silencio. Cero dependencias nuevas.**

## Performance

- **Duration:** ~62 min
- **Tasks:** 3 de 3, más un cuarto commit que cierra CAT-05 (ver Desviación 3)
- **Files:** 23 (5 creados, 18 modificados)
- **Dependencias nuevas:** 0 (`git diff` de `package.json` / `package-lock.json` en los 4 commits: vacío)

## Los cuatro hallazgos del guarda-rail, cerrados

02-02 dejó el script en rojo con 4 hallazgos legítimos y la instrucción de que los cerrara este plan. Están cerrados **cambiando la fuente de datos, no el widget** — que es exactamente lo que su análisis anticipaba:

| # | Archivo | Antes | Ahora |
|---|---|---|---|
| 1 | `Config.tsx` | `import { CONCEPTS } from '../i18n'` | etiquetas de `GET /api/catalogs`; de `i18n` solo viene `CONCEPT_COLOR` (decoración) |
| 2 | `Config.tsx` | `import { CURRENCIES } from '../data'` | monedas del catálogo, con su ABM |
| 3 | `NewProjectModal.tsx` | `import { MACHINES }` | modelos de máquina del catálogo (los chips no cambian) |
| 4 | `NewProjectModal.tsx` | `import { CURRENCIES }` | monedas del catálogo (el `<select>` no cambia) |

```
$ node scripts/check-no-free-text.mjs
7/7 archivos limpios     → exit 0
```

Y la línea que 02-02 dejó pendiente a propósito:

```json
"build": "npm run check:no-free-text && npm -w frontend run build && npm -w backend run build"
```

Railway construye con `npm run build` (raíz, `railway.toml`), así que **un `<input>` de concepto, rol o moneda tumba el deploy** en vez de llegar a producción.

## Accomplishments

- **La resta del cliente no existe.** `ProjectDetail.tsx:35` (`const dl = dn - s`) se borró; cada fila de `matrix` trae su `delta` y el `PUT` de la celda lo devuelve recalculado. Verificado contra el motor: `PUT /sold-days {soldDays: 20}` → `{"sold":20,"executed":0,"delta":20}`. Negativo = sobreejecución = `var(--warn)`, y ningún campo de delta es editable.
- **Las filas de la matriz se demuestran generadas.** Con los 5 roles activos que hay hoy en la base local, `GET /api/projects/:id` devuelve **10 filas** (5 × 2 fases) y la pantalla pinta lo que llega, en el orden que llega. Añadir un rol en Config añade su fila sin tocar código — que es la consecuencia de diseño que el CONTEXT pedía.
- **Autoguardado por celda con las tres garantías del CONTEXT.** Se guarda al salir del campo (nada de debounce por tecla); **si el valor no cambió no se escribe** (ni petición ni ruido en el `audit_log` append-only de la Fase 4); si falla, la celda vuelve al valor cargado y sale un aviso. Indicador por celda: punto azul mientras guarda, borde y punto de alerta si falló.
- **El bucket «sin fase» se pinta y no se edita.** Las filas `phase: null` (histórico del Excel) aparecen en una tabla aparte solo si existen, y son de solo lectura: el `PUT` exige una fase del enum, así que un input ahí sería un 400 garantizado.
- **Los 7 campos del encabezado de la Nota se capturan y se releen.** `NewProjectModal` gana cliente, NIT, localidad, país, suministro y n° de contrato; el detalle los muestra. Probado de ida y vuelta contra el backend local: los 6 campos vuelven idénticos y `contractValue` llega como **número** (`1240000`, sin comillas), que es el hallazgo de 02-05 que habría reventado `money()`.
- **Quitar una máquina con jornadas avisa y deja seguir.** El detalle usa el `entryCount` de cada máquina: si es > 0 pide confirmación; el servidor nunca bloquea, y las jornadas históricas conservan su máquina.
- **Técnicos: alta, edición y baja reales.** El rol sale del catálogo (no del enum `mechanic|mecatronic|electric` que estaba cableado en la pantalla), la baja es `PATCH /:id/active` y el técnico inactivo **sigue en la lista, atenuado**.
- **Config con los 4 catálogos.** Los 8 conceptos con sus etiquetas del API (solo el Super Admin ve el lápiz y edita ES/IT), y ABM de roles, monedas y modelos de máquina resuelto con **un** componente parametrizado en vez de tres copias. Un Admin no ve ningún control de edición.
- **El vínculo usuario↔técnico tiene interfaz.** `Users.tsx` muestra y cambia el técnico vinculado (`PATCH /api/users/:id/technician`) y `InviteUserModal` permite vincular al invitar. Es la columna de la que sale la GUC `app.technician_id`: sin ella, la Fase 3 arrancaría con todos los técnicos viendo cero registros propios.
- **`npm run build` verde en la raíz** (guarda-rail + frontend `tsc && vite build` + backend `prisma generate && nest build`), y `tsc --noEmit` limpio en cada tarea.

## Task Commits

1. **Task 1** — `6e79e7b` (feat) · catálogos, técnicos y usuarios contra el API real (18 archivos)
2. **Task 2** — `ffd2510` (feat) · proyectos y detalle, delta corregido y matriz del catálogo (4 archivos)
3. **Task 3** — `d3b5891` (chore) · `data.ts` reducido, `Kpis.tsx` compilando y el guarda-rail enganchado al build (6 archivos)
4. **Cierre de CAT-05** — `3c52c29` (feat) · asignar roles y activar/desactivar usuario, que el requisito exige y los botones no hacían (2 archivos)

## Verificación contra el backend real (no solo `tsc`)

El frontend no tiene runner de tests (decisión de la Fase 1), así que los tipos escritos a mano son una promesa hasta que alguien los contrasta. Se levantó el build del backend contra el Postgres local (`DEV_AUTH_ENABLED=true`, puerto 3199) y se ejecutaron **los payloads exactos que mandan las pantallas**:

| Lo que hace la pantalla | Resultado |
|---|---|
| `GET /api/catalogs` (Config, modales, matriz) | 8 conceptos + 5 roles + 6 monedas + 5 modelos, nombres de campo idénticos a los tipos |
| `POST /api/projects` con los 7 campos (NewProjectModal) | 201 · `contractValue` → `number` |
| `PUT /:id/machines` | 200 · `[{machineModelId, code, description, entryCount}]` |
| `PUT /:id/sold-days` (autoguardado) | 200 · `{roleTypeId, phase, sold: 20, executed: 0, delta: 20}` |
| `GET /api/projects/:id` (detalle) | encabezado completo + `machines` + **10 filas** de matriz |
| `GET /api/projects` (listado) | `machineCodes: ["CTA1000"]`, `oaNumber`, `contractValue` numérico |
| `GET /api/technicians` · `GET /api/users` | 200 · `users` con exactamente `id, displayName, email, roles, isActive, technicianId` |

El proyecto de la sonda se **borró** de la base local al terminar y el backend se detuvo. Producción no se tocó: este plan no tiene migraciones ni cambios de backend.

## Files Created/Modified

**Clientes tipados (nuevos).** Copiados de los bloques «Contrato definitivo del API» de 02-03 y 02-05, con el porqué de cada rareza al lado (`contractValue` es `number` y no `string`; `delta` lo calcula el servidor; `aliases` no se expone hasta la Fase 6):
- `lib/api/catalogs.ts` — los 4 catálogos + el ABM del Super Admin + `activos()`, el filtro que hace el **selector** (el endpoint no filtra por diseño)
- `lib/api/technicians.ts` · `lib/api/users.ts` · `lib/api/projects.ts`
- `lib/api/useApiData.ts` — el `useEffect` con bandera `alive` que la Fase 1 escribió dos veces a mano, factorizado porque el cutover lo repetía siete veces

**Pantallas.** `Projects` (listado, chips de `machineCodes`), `ProjectDetail` (encabezado de la Nota, chips de máquina con aviso, matriz con autoguardado), `Techs` (ABM completo), `Users` (lista + vínculo), `Config` (4 catálogos), `NewProjectModal` (7 campos + catálogos), `InviteUserModal` (invitación real + vínculo opcional).

**Infraestructura.** `client.ts` (desenvuelve el `message` del error; `apiSend` para los 15 POST/PATCH/PUT), `state.tsx` (`dataVersion`/`refresh()` sustituyen a `users`/`projects`/`addUser`/`addProject`), `ui.tsx` (`ApiState` + los 3 formateadores), `types.ts` (se queda con lo de interfaz), `i18n.ts` (`CONCEPT_COLOR` + ~30 claves nuevas en es **e** it), `data.ts` (mocks reducidos, con tabla de qué fase retira cada uno), `package.json` (la línea del guarda-rail).

## Decisions Made

Ver `key-decisions`. Las cuatro que más afectan a lo que viene:

1. **Ninguna lista de dominio se carga al abrir sesión.** Era tentador dejar `state.projects` en el provider y ahorrarse el `useEffect` de cada pantalla. Habría sido un bug de entrada: `GET /api/projects` está cerrado a `A · S` (02-05) y **cualquier técnico** habría recibido un 403 nada más entrar. Cada pantalla administrativa carga lo suyo, y `LogDayDrawer` —que es del técnico— se queda con mock hasta que la Fase 3 relaje ese `@Roles`.
2. **El delta se borra, no se arregla.** Cambiar `dn - s` por `s - dn` habría dejado la resta en el cliente y con ella la posibilidad de que vuelva a invertirse. Ahora el cliente **pinta un número que le dan**. De paso apareció la misma inversión en `Kpis.tsx` (`mD + cD - (mS + cS)`) y se corrigió: dos convenciones distintas conviviendo es precisamente cómo vuelve este bug.
3. **El mock de Kpis se muda a Kpis.tsx, con la forma nueva.** `data.ts` guarda lo de bitácora, notas, gastos y auditoría; el mock de una pantalla de la Fase 7 no es eso. Y se reescribió como **filas rol × fase**, la forma que devuelve el API, así que el cutover de la Fase 7 será cambiar el origen, no reescribir las cinco agregaciones.
4. **CAT-01..CAT-05 se marcan completos aquí.** Los cinco planes anteriores los dejaron abiertos con el mismo argumento («su enunciado se lee desde la pantalla»). La pantalla es este plan, el guarda-rail que faltaba está verde y los cinco criterios son ahora verificables desde la interfaz.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El delta agregado de `Kpis.tsx` también estaba invertido**
- **Found during:** Task 3
- **Issue:** El research solo señaló `ProjectDetail.tsx:35`. `Kpis.tsx:182` tenía el mismo error en la tabla «Por fase»: `dl: mD + cD - (mS + cS)` es ejecutado − vendido, así que un proyecto pasado de lo vendido salía **positivo y verde** en la pantalla que justifica el proyecto.
- **Fix:** `dl: mS + cS - (mD + cD)`, con el comentario que nombra la convención. Es aritmética sobre un mock local, no sobre datos del API, así que no reintroduce una resta prohibida sobre datos reales.
- **Files modified:** `frontend/src/screens/Kpis.tsx`
- **Verification:** build verde; el signo coincide con el de la matriz del detalle y con el Excel `Resoconto`.
- **Committed in:** `d3b5891`

**2. [Rule 2 - Missing Critical] El error del API llegaba a la UI como el JSON entero**
- **Found during:** Task 1
- **Issue:** `apiFetch` hacía `throw new ApiError(status, await res.text())`, o sea que el «mensaje» era `{"message":"TECNICO_YA_VINCULADO","error":"Conflict","statusCode":409}`. Toda la traducción de errores que 02-03/02-04/02-05 dejaron preparada (códigos propios en `res.body.message`) era inservible sin parsear en cada llamante.
- **Fix:** `codigoDeError(res)` desenvuelve `message` (o une el array de `class-validator`) y cae al texto crudo si no era JSON. Un sitio, todos los llamantes — mismo criterio que el handler de 401 de la Fase 1.
- **Files modified:** `frontend/src/lib/api/client.ts`
- **Verification:** los mensajes de error de las 7 pantallas muestran el código y no el objeto.
- **Committed in:** `6e79e7b`

**3. [Rule 2 - Missing Critical] CAT-05 pedía «asignar roles, activar/desactivar» y los botones estaban muertos**
- **Found during:** cierre del plan, al marcar los requisitos
- **Issue:** Los botones de rol de `Users.tsx` venían del prototipo **sin `onClick`**, y no había forma de activar o desactivar un usuario. Los tres endpoints existen desde 01-03. El `<behavior>` de la Task 1 solo pedía «lista real, invitar y vínculo», así que iba a quedar como deuda — pero **CAT-05 dice literalmente «invitar, asignar roles, activar/desactivar»**, y marcarlo completo con dos tercios del enunciado sin interfaz es el falso verde que los cinco planes anteriores se negaron a firmar.
- **Fix:** `setUserRoles` / `setUserActive` en el cliente tipado, `onClick` en los botones que ya estaban y un botón de activar/desactivar por fila. **Ni la escalada ni los anti-lockout se reimplementan en el cliente**: son del servidor y la pantalla muestra su código.
- **Files modified:** `frontend/src/lib/api/users.ts`, `frontend/src/screens/Users.tsx`
- **Verification:** contra el backend local, desde los mismos payloads de la pantalla: quitarse el rol S → `400 NO_PUEDES_QUITARTE_SUPER_ADMIN`; desactivarse a sí mismo → `400 DEBE_QUEDAR_UN_SUPER_ADMIN`. Los dos anti-lockout de 01-03 disparan y la fila no se toca.
- **Committed in:** `3c52c29`

**4. [Rule 2 - Missing Critical] El catálogo de modelos de máquina no tenía ninguna interfaz**
- **Found during:** Task 1
- **Issue:** El `<behavior>` de la Task 1 pedía ABM de «roles técnicos y monedas». Pero el selector de máquinas de proyectos y modales se alimenta del **catálogo global de modelos**, que el CONTEXT declara mantenido por el Super Admin: sin ABM, ese catálogo solo se podía tocar con `curl`, y una base sin sembrar dejaba el formulario de proyecto sin ninguna máquina que elegir (y el proyecto sin poder crearse, porque la validación exige al menos una).
- **Fix:** una tercera instancia del mismo `CatalogCard` ya escrito. Cero código nuevo aparte de las tres props.
- **Files modified:** `frontend/src/screens/Config.tsx`, `frontend/src/i18n.ts`
- **Verification:** `POST/PATCH /api/catalogs/machine-models` responden desde la pantalla; los inactivos se ven atenuados.
- **Committed in:** `6e79e7b`

### Desviaciones deliberadas respecto al texto del plan

- **`MACHINES` no sale de `data.ts`, y se le añade `LOG_PROJECTS`.** La Task 3 pedía quitar `MACHINES`; hacerlo rompía `LogDayDrawer.tsx`, que es pantalla de **bitácora** (Fase 3) y no una de las cinco del cutover. Y como `state.projects` desaparecía, ese mismo drawer se quedaba sin lista de proyectos: se le dio un mock propio de 4 líneas **en vez de llamar al API**, porque `GET /api/projects` es `A · S` y el drawer lo usa un Técnico. Los dos mocks quedan en la tabla de `data.ts` con la fase que los retira.
- **`money`/`nf`/`initials` se mudan de `data.ts` a `ui.tsx`.** No lo pedía el plan. Son presentación, no mocks, y con ellas fuera la afirmación «ninguna de las cinco pantallas importa de `data.ts`» pasa a ser comprobable con un grep en vez de discutible. Coste: siete líneas de `import`.
- **Los tipos del API viven en `lib/api/*.ts`, no en `types.ts`.** El plan decía «mover a `types.ts` los tipos duplicados, importándolos de los clientes de API donde ya existan». Se aplicó la segunda mitad: cada tipo está una sola vez, junto al `fetch` que lo produce, que es donde está el contrato. `types.ts` se queda con lo de interfaz (`Route`, `Lang`, `NoteStatus`, `Note`…).
- **La columna «Utilización» de Técnicos muestra `—`.** No hay dato hasta la Fase 7 y una barra al 0 % sería una cifra falsa. La columna se conserva porque el diseño está aprobado.
- **El aviso de «esta máquina tiene jornadas» es un `window.confirm`.** Nativo, cero código, y es exactamente la semántica que pide la decisión bloqueada («se avisa y se permite»). Un diálogo con el estilo de la app se puede montar el día que alguien lo pida.

### Simplificaciones deliberadas

- **Un `CatalogCard` parametrizado** para roles, monedas y modelos de máquina en vez de tres tarjetas casi idénticas.
- **Sin traducción de los códigos de error.** Se muestran tal cual tras «No se pudo guardar». Están en español y el backend puede añadir más en cualquier fase; la tabla se escribe cuando FAVA diga cuáles ve de verdad.
- **`refresh()` es un contador, no un invalidador de caché.** Tres líneas en `state.tsx` frente a React Query, que la fase prohíbe.
- **Sin paginación ni búsqueda de servidor:** `filterBy()` en cliente, como el resto de la app. El techo del research está en ~500 filas.

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing critical) + 5 desviaciones deliberadas + 4 simplificaciones
**Impact on plan:** Ninguna reduce el alcance. La única que cambia el texto del plan (`MACHINES` se queda) evita romper una pantalla de otra fase, y el mock que la acompaña está ahí por una restricción de permisos real, no por comodidad.

## Issues Encountered

- **`truncateAll()` había vuelto a borrar al Super Admin del seed**: el login de desarrollo respondía `CREDENCIALES_INVALIDAS` hasta ejecutar `npm -w backend run db:seed`. Es el problema conocido desde 02-01, y la base local conserva además los restos de catálogo de las suites e2e (`Rol de prueba`, `Software`, `TST`, `TEST-MAQ`, `TEST-MAQ-2`). No afecta a nada del repo.
- **El backend no arranca fuera de su directorio**: `node backend/dist/main.js` desde la raíz no encuentra `.env` y muere con las 6 variables obligatorias sin valor. Hay que lanzarlo con `cwd` en `backend/`.
- **`state.projects` era una trampa de permisos, no una comodidad.** Se detectó al plantear dónde cargar la lista: mantenerla en el provider habría dado 403 a los técnicos en el arranque. Está anotado como decisión porque el próximo que quiera «cachear algo globalmente» se va a encontrar con lo mismo.

## User Setup Required

Ninguno. Este plan no añade migraciones, ni variables de entorno, ni dependencias. El único cambio con efecto en el deploy es que **`npm run build` ahora ejecuta `check:no-free-text` primero**: si alguien vuelve a alimentar concepto, rol o moneda desde un `<input>` o desde los mocks, el build de Railway falla en el primer paso con `archivo:línea` en el log.

## Next Phase Readiness

**Para la Fase 3 (bitácora) — lo que este plan le deja hecho y lo que le deja pendiente:**
- `PATCH /api/users/:id/technician` ya tiene interfaz: la GUC `app.technician_id` se puede poblar desde la pantalla de Usuarios, que era la precondición de todo el aislamiento por RLS.
- **`LogDayDrawer` es lo primero que hay que cablear**, y su bloqueo está identificado: `GET /api/projects` tiene `@Roles('A','S')`. Hay que **relajarlo a `T`** (como hizo 02-03 con `/api/catalogs`), no crear un endpoint nuevo — RLS ya permite la lectura a cualquier rol (`proj_read USING (TRUE)`). Con eso, el selector sale del API y las máquinas del drawer salen de las **del proyecto elegido** (`GET /api/projects/:id` ya las devuelve).
- `GET /api/catalogs` responde con token de técnico y los 8 conceptos traen `labelEs`/`labelIt`: el selector de concepto de la captura sale de ahí, y `CONCEPT_COLOR` (i18n) sigue dando el color.
- Cuando haya jornadas aprobadas, la columna `Ejecutado` de la matriz **empieza a moverse sola**: la pantalla no necesita ningún cambio.

**Para la Fase 5 (Nota PDF):**
- Los 7 campos del encabezado ya se capturan y se releen. **El `NIT:` del PDF sigue siendo el de FAVA**, no `clientNit` — el aviso está ahora también en el docstring de `NewProjectModal.tsx`.

**Para la Fase 7 (tableros):**
- `Kpis.tsx` ya consume **filas rol × fase**. Cablearlo es sustituir el array `PROJECTS` local por las llamadas al API y borrar el bloque de mock; las cinco agregaciones (`totalP`, `porFase`, el pie por rol, el chart de horas, la tabla por fase) valen tal cual.
- La utilización por técnico y la columna `—` de la pantalla Técnicos esperan ahí su dato.

**Concerns:**
- **Dos administradores editando la misma celda: gana el último** (techo declarado por 02-05). La UI no bloquea ni avisa; con dos administradores es el comportamiento correcto.
- **Sin runner de tests de frontend, la garantía de estas siete pantallas es `tsc` + el guarda-rail + la sonda manual contra el backend.** Un cambio de contrato en el backend rompe la pantalla en tiempo de ejecución, no de compilación: los tipos están escritos a mano. El codegen desde OpenAPI sigue sin dueño.

## Self-Check: PASSED

- 5/5 archivos creados existen en disco; 18/18 modificados existen.
- 4/4 commits en el historial: `6e79e7b`, `ffd2510`, `d3b5891`, `3c52c29`.
- `ProjectDetail.tsx` contiene `sold` (6 apariciones) y `setSoldDays`; `Projects.tsx` importa de `lib/api/projects`.
- **`npm run build` en la raíz del monorepo: exit 0** — `7/7 archivos limpios` + `vite build ✓` + `prisma generate` + `nest build`.
- **`node scripts/check-no-free-text.mjs`: exit 0**, `7/7 archivos limpios` (venía de `5/7`, exit 1 con 4 hallazgos). Rojo→verde registrado dentro de esta misma ejecución: tras la Task 1 el script seguía en `6/7` con los 2 hallazgos de `NewProjectModal`, y la Task 2 los cerró.
- **Ninguna de las 7 pantallas del cutover importa de `../data`**: `grep "from '../data'"` sobre las siete → sin resultados.
- `data.ts` ya no exporta `PROJECTS`, `TECHS`, `USERS` ni `CURRENCIES`; los 7 exports que quedan (`CURRENT_TECH`, `MACHINES`, `LOG_PROJECTS`, `NOTES`, `WEEK`, `EXPENSES`, `AUDIT`) están en la tabla con la fase que los retira.
- `tsc --noEmit` limpio al final de cada una de las 3 tareas.
- **Cero dependencias nuevas:** `git diff 6e79e7b~1 HEAD -- package.json package-lock.json frontend/package.json` está vacío.
- **CAT-05 completo de verdad:** invitar, asignar roles y activar/desactivar están los tres cableados, y los dos anti-lockout del servidor se comprobaron disparando desde la pantalla.
- **Backend no modificado:** los 3 commits solo tocan `frontend/src/**` y la línea de `build` del `package.json` raíz. La suite de 14 suites / 269 tests e2e no se ejecutó porque este plan no toca su código; el `nest build` del paso 3 del build sí compila.
- Contrato verificado **en ejecución** contra el backend local (tabla § «Verificación contra el backend real»), incluidos `contractValue` como `number` y `delta: 20` para `sold: 20 / executed: 0`.
- Base local dejada como estaba: proyecto de la sonda borrado, proceso del backend detenido, `.env` sin tocar.

---
*Phase: 02-maestros-y-cat-logos*
*Completed: 2026-07-26*
