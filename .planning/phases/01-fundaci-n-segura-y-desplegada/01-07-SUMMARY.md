---
phase: 01-fundaci-n-segura-y-desplegada
plan: 07
subsystem: auth
tags: [jose, jwt, rs256, nestjs, zod, throttler, react, vite, sessionstorage]

# Dependency graph
requires:
  - phase: 01-03
    provides: "EntraGuard, jwksProvider como token de DI, test/helpers/{tokens,app,db}.ts"
  - phase: 01-05
    provides: "apiFetch con Bearer, sessionStatus, Login.tsx, i18n es/it"
  - phase: 01-06
    provides: "app desplegada en Railway y contrato de variables del servicio"
provides:
  - "POST /api/dev-auth/login: JWT RS256 firmado con un par local, validado por el EntraGuard SIN tocar el guard"
  - "DEV_AUTH_ENABLED / DEV_AUTH_PASSWORD con validacion cruzada en zod: encendido sin contrasena de >=12 no arranca"
  - "jwksProvider conmuta el keyset (local en modo dev, Microsoft en el resto) — unico punto donde el modo existe"
  - "test/dev-auth.e2e-spec.ts: el APAGADO como sujeto de prueba (404 + token de dev rechazado)"
  - "Formulario de acceso temporal en Login.tsx y banda de aviso permanente en App.tsx"
  - "docs/ENV.md § Login de desarrollo temporal, con el cutover completo incluido el UPDATE de los oid dev:"
affects: [01-06-deploy, fase-02-dominio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El modo dev es una sustitucion de keyset, no una rama de validacion: entra.guard.ts tiene 0 lineas de diff"
    - "Modulo registrado condicionalmente en app.module: apagado la ruta no existe (404, no 401)"
    - "Contraseña comparada en tiempo constante sobre sha256 de ambos lados (timingSafeEqual exige misma longitud)"
    - "e2e con dos registros de modulos (jest.resetModules + imports dinamicos) para probar un flag que se lee al REGISTRAR"

key-files:
  created:
    - fava-control-tecnico/backend/src/common/auth/dev-auth.module.ts
    - fava-control-tecnico/backend/src/common/auth/dev-auth.controller.ts
    - fava-control-tecnico/backend/src/common/auth/dev-auth.service.ts
    - fava-control-tecnico/backend/test/dev-auth.e2e-spec.ts
    - fava-control-tecnico/frontend/src/lib/auth/dev.ts
  modified:
    - fava-control-tecnico/backend/src/config/env.ts
    - fava-control-tecnico/backend/src/common/auth/jwks.provider.ts
    - fava-control-tecnico/backend/src/app.module.ts
    - fava-control-tecnico/backend/.env.example
    - fava-control-tecnico/frontend/src/lib/api/client.ts
    - fava-control-tecnico/frontend/src/state.tsx
    - fava-control-tecnico/frontend/src/Login.tsx
    - fava-control-tecnico/frontend/src/App.tsx
    - fava-control-tecnico/frontend/src/i18n.ts
    - fava-control-tecnico/frontend/src/vite-env.d.ts
    - fava-control-tecnico/frontend/.env.example
    - fava-control-tecnico/docs/ENV.md

key-decisions:
  - "El issuer del token de dev es el mismo que el esperado: cambiarlo obligaba a pasar el issuer por cada stub de EnvService, y un stub que lo olvide desactiva la validacion de issuer en silencio"
  - "El oid ficticio lleva prefijo dev: para que el cutover sea un UPDATE ... LIKE 'dev:%' — sin el, el primer login real de cada persona falla en silencio"
  - "El keyset local SUSTITUYE al de Microsoft (no se suma): un solo modo activo a la vez, sin hibridos"
  - "Rate limit 30/hora y no 5 como access-requests: tras el proxy de Railway la ip es unica y el limite es global para todo el equipo"
  - "El aviso de la interfaz depende de VITE_DEV_AUTH, no del origen de la sesion: el modo activo se ve aunque el usuario aun no haya entrado"

patterns-established:
  - "Un flag de seguridad se prueba por su lado apagado: la suite levanta la app SIN sustituir el provider JWKS, o el test se probaria a si mismo"
  - "z.enum(['true','false']) en vez de coercion laxa: un typo mata el arranque en lugar de dejar el modo a merced del parser"
  - "Defensa en profundidad en el comparador: sin contrasena fuerte configurada no coincide nada, ni la cadena vacia"

requirements-completed: [AUTH-01]

# Metrics
duration: 50min
completed: 2026-07-25
---

# Phase 1 Plan 07: Login de desarrollo temporal Summary

**Acceso con email + contraseña compartida que emite un JWT RS256 firmado por un par de claves en memoria y lo hace pasar por el `EntraGuard` intacto — `entra.guard.ts` tiene 0 líneas de diff — con el modo apagado por defecto, arranque abortado si la contraseña es débil y una suite e2e cuyo sujeto principal es el estado APAGADO.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-07-25T23:05:00Z (aprox.)
- **Completed:** 2026-07-25T23:55:00Z
- **Tasks:** 3 de 3
- **Files modified:** 17 (5 creados, 12 modificados)

## Accomplishments

- **El guard no se tocó: 0 líneas de diff en `entra.guard.ts`** (`git diff 7ec773e..HEAD -- entra.guard.ts` → vacío). El token de desarrollo recorre firma, issuer, audiencia, expiración, `tid`, scope y el `SELECT` por `entra_oid` exactamente igual que uno de Microsoft. Lo único que el modo cambia es qué keyset resuelve la clave, en `jwks.provider.ts`.
- **Apagado no deja rastro, y hay dos tests que lo demuestran sin trampa:** la app de la suite se levanta **sin sustituir el provider JWKS** (con la sustitución, el test se probaría a sí mismo). `POST /api/dev-auth/login` responde **404** —no 401, no hay endpoint que sondear— y un token de desarrollo **auténtico**, emitido por la otra app y válido allí, es rechazado con 401.
- **El arranque muere antes que aceptar un modo dev mal configurado:** sin contraseña, con menos de 12 caracteres, o con un `DEV_AUTH_ENABLED` que no sea exactamente `true`/`false` (un `TRUE` o un `1` no lo encienden a medias: lo matan). Verificado con el `dist` real, no solo en test.
- **Un único 401 para los tres fallos.** Contraseña mala, email inexistente y usuario desactivado devuelven el mismo cuerpo, comparado con `toEqual` en el test, y sin ninguna palabra que insinúe qué falló. La comparación de contraseña es `timingSafeEqual` sobre los sha256 de ambos lados.
- **Probado de punta a punta contra el proceso real:** `node dist/main.js` con las variables → warn de arranque en los logs → login con la cuenta del seed → `GET /api/me` devuelve `status: ok` con los roles reales `["T","A","S"]` de la base de datos, y el header del token es `{"alg":"RS256","kid":"dev-auth"}`.
- **Suite completa en verde: 7 suites e2e / 53 tests** (antes 6/45) + 12 unit, y `npm run build` en la raíz.

## Task Commits

1. **Task 1: emisor de tokens de desarrollo** — `f0c4e92` (feat)
2. **Task 2: e2e del modo dev** — `e0f2b37` (test)
3. **Task 3: formulario y aviso en el frontend** — `5940633` (feat)
4. **Documentación de las variables y del cutover** — `0205deb` (docs)

## Files Created/Modified

- `backend/src/config/env.ts` — `DEV_AUTH_ENABLED` (`z.enum(['true','false'])` → boolean) y `DEV_AUTH_PASSWORD` opcional, con un `superRefine` que exige ≥12 caracteres cuando el flag está encendido. `DEV_AUTH_MIN_PASSWORD` se exporta para que el servicio use el mismo número.
- `backend/src/common/auth/jwks.provider.ts` — `devKeyPair()` (par RSA memoizado, en memoria) y el `useFactory` que devuelve el keyset local **o** el remoto de Microsoft. Es el único sitio del backend donde el modo dev existe para el camino de validación.
- `backend/src/common/auth/dev-auth.service.ts` — comparación en tiempo constante, lookup del usuario, un solo `UnauthorizedException`, y la firma con las claims exactas que el guard exige (ni una claim «de dev»).
- `backend/src/common/auth/dev-auth.controller.ts` — `@Public()` + `@UseGuards(ThrottlerGuard)` + `@Throttle(30/hora)`, `@HttpCode(200)`.
- `backend/src/common/auth/dev-auth.module.ts` — `onModuleInit` con el warn de arranque.
- `backend/src/app.module.ts` — `...(env.DEV_AUTH_ENABLED ? [DevAuthModule] : [])`: la decisión ocurre al **registrar**, que es lo que hace que la ruta no exista.
- `backend/test/dev-auth.e2e-spec.ts` — 8 tests en cuatro grupos (apagado, encendido, un único 401, arranque).
- `frontend/src/lib/auth/dev.ts` — `devAuthEnabled`, `getDevToken`, `devLogin`, `devLogout` sobre `sessionStorage`.
- `frontend/src/lib/api/client.ts` — `getDevToken() ?? (await getToken())`: una línea, y MSAL sigue siendo el camino por defecto.
- `frontend/src/state.tsx` — acción `devLogin`, arranque de sesión que salta MSAL si ya hay token de dev, `logout` que no redirige a Microsoft cuando la sesión vino por esta vía, y el handler de 401 que tira también el token de dev.
- `frontend/src/Login.tsx` — formulario bajo el botón de Microsoft, que sigue visible e intacto.
- `frontend/src/App.tsx` — banda superior `position: sticky` en todas las pantallas mientras el modo esté activo.
- `frontend/src/i18n.ts`, `vite-env.d.ts` — seis claves en es e it; `VITE_DEV_AUTH` tipada y documentada.
- `docs/ENV.md` — sección propia: qué no es (un bypass), cómo se enciende, los límites conocidos y el cutover paso a paso.

## Decisions Made

1. **El issuer del token de dev es el mismo que el que el guard espera.** El plan decía «cambia el JWKS y el issuer esperado». Cambiar el issuer obligaba a sacarlo de `EnvService` y a pasarlo por **cada** stub de `EnvService` de la suite (`test/helpers/app.ts` y el `envFalso` de `entra.guard.spec.ts`); un stub que lo olvide deja `issuer: undefined` y **jose deja de validar el issuer sin decir nada**. Se prefirió la opción con menos superficie: el guard no cambia en absoluto, y el token de dev es reconocible por su `kid: dev-auth`, por el prefijo `dev:` de su `oid` y por el warn de arranque. El aislamiento no depende del issuer: depende del keyset, que con el modo apagado ni se carga.
2. **El keyset local sustituye al de Microsoft, no se suma.** Un resolver encadenado (local, y si falla, remoto) dejaría la app en un estado híbrido donde no se sabe qué la asegura. Con la sustitución hay siempre exactamente un modo activo, y el botón de Microsoft deja de funcionar mientras el modo dev está encendido — lo cual es correcto, porque el modo existe precisamente porque todavía no hay tenant. Documentado en `ENV.md`.
3. **`oid` ficticio con prefijo `dev:`.** Sin tenant, el usuario del seed tiene `entra_oid = NULL`, así que el primer login de desarrollo dispara la vinculación del guard y escribe el `oid` en la fila. Es estable entre reinicios (`dev:<user.id>`) porque si cambiara, el segundo login ya no encontraría la fila. El prefijo hace que el cutover sea una línea de SQL.
4. **`z.enum(['true','false'])` en vez de un booleano permisivo.** `DEV_AUTH_ENABLED=TRUE` o `=1` **no arrancan**. Un parser laxo convierte un typo en un modo de seguridad distinto del que alguien creyó configurar; un parser estricto lo convierte en un fallo de arranque con el nombre de la variable.
5. **El aviso de la interfaz se cuelga de `VITE_DEV_AUTH`, no del origen de la sesión.** El plan pedía «mientras la sesión venga por esta vía». Mostrarlo siempre que el modo esté activo es más simple y más estricto: la pantalla de login también avisa, y no hay ningún estado en el que la app esté en modo dev sin decirlo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] El rate limit de 5/hora del plan dejaba fuera al equipo**
- **Found during:** Task 2 (la suite terminó con `x-ratelimit-remaining: 0`)
- **Issue:** El plan pedía «rate limit igual que en access-requests» (5/hora). Detrás del proxy de Railway **todas las peticiones llegan con la misma IP** (no hay `trust proxy`), así que el límite no es por usuario sino global: el cuarto miembro del equipo que intentara entrar en una hora se quedaría fuera de la app sin ninguna forma de saber por qué. La suite además rozaba el techo exacto y un test más la habría puesto roja con un 429 desconcertante.
- **Fix:** `@Throttle({ default: { limit: 30, ttl: 3_600_000 } })` con el porqué en el comentario del controlador. 30 intentos/hora siguen sin servirle de nada a una fuerza bruta contra ≥12 caracteres.
- **Files modified:** `backend/src/common/auth/dev-auth.controller.ts`
- **Verification:** suite `dev-auth` en verde con margen (10 logins de 30); el límite global queda documentado en `ENV.md § Límites conocidos`.
- **Committed in:** `e0f2b37`

**2. [Rule 2 - Missing Critical] Defensa en profundidad en el comparador de contraseña**
- **Found during:** Task 1
- **Issue:** `timingSafeEqual(sha256(candidata), sha256(this.env.DEV_AUTH_PASSWORD ?? ''))` devuelve **true** si la contraseña configurada llegara vacía y el atacante manda `password: ""`. El esquema zod lo impide hoy, pero el comparador estaría a una refactorización de env de convertirse en una puerta abierta.
- **Fix:** el comparador devuelve `false` sin más si la contraseña configurada mide menos de `DEV_AUTH_MIN_PASSWORD`, con el número importado del mismo sitio que usa la validación de arranque.
- **Files modified:** `backend/src/common/auth/dev-auth.service.ts`, `backend/src/config/env.ts`
- **Verification:** test «cuerpo vacío o sin contraseña → 401, nunca un 500» (incluye `password: ''`).
- **Committed in:** `f0c4e92`

**3. [Rule 2 - Missing Critical] Los `entra_oid` de desarrollo rompen el primer login real en silencio**
- **Found during:** Verificación manual de Task 3 (inspección de la tabla `users` tras un login de dev)
- **Issue:** El login de desarrollo vincula un `oid` ficticio a la fila del usuario. Cuando llegue el tenant real, el guard buscará por el `oid` de Microsoft, no lo encontrará, e intentará vincular por email — pero la vinculación exige `entra_oid IS NULL`. Resultado: **cada persona ve «tu cuenta no está habilitada» y los logs no muestran ningún error**. Es exactamente el fallo silencioso que el Plan 01-03 documentó para el claim `email`, por otra puerta.
- **Fix:** prefijo `dev:` en el `oid` emitido + el `UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%'` como **paso 2 no opcional** del cutover en `docs/ENV.md`, repetido en `backend/.env.example`. No se automatizó a propósito: hacerlo en el arranque metería una escritura relacionada con el modo dev en el camino de arranque de producción, que es justo lo que «apagado no deja rastro» prohíbe.
- **Files modified:** `backend/src/common/auth/dev-auth.service.ts`, `docs/ENV.md`, `backend/.env.example`
- **Verification:** comprobado contra la BD local (`entra_oid = 'dev:46f60678-…'` tras el login, y la fila restaurada con el UPDATE documentado).
- **Committed in:** `f0c4e92` (prefijo) y `0205deb` (documentación)

### Ajustes de alcance

- **`frontend/src/lib/auth/dev.ts` es un archivo nuevo** (el plan listaba `msal.ts` entre los modificados). `msal.ts` quedó intacto: mezclar el almacén del token temporal con el cliente de MSAL habría dejado código que borrar en dos sitios el día del cutover. `client.ts` elige entre los dos en una línea.
- **`App.tsx` no estaba en `files_modified`** pero el propio plan admitía «en `Layout.tsx` o `App.tsx`». Se eligió `App.tsx` porque envuelve también la pantalla de login.
- **`.env.example` de backend y frontend** se actualizaron aunque no estaban listados: `ENV.md` promete que son plantillas completas, y una plantilla que no menciona la variable es la forma habitual de que alguien la ponga solo en el dashboard de Railway.

---

**Total deviations:** 3 auto-fixed (3 missing critical) + 3 ajustes de alcance
**Impact on plan:** Ninguno amplía el alcance. Las tres «missing critical» cierran un bloqueo operativo (rate limit global), una puerta latente en el comparador y un fallo silencioso de cutover.

## Issues Encountered

- **El flag se lee al REGISTRAR el módulo, no al atender la petición**, que es justamente lo que hace que la ruta no exista. Eso implica que una sola suite no puede levantar las dos variantes con `overrideProvider`: la app encendida se construye con `jest.resetModules()` + imports dinámicos de `@nestjs/testing`, `app.module` y `config/env` **todos del registro nuevo** (mezclar dos copias de `@nestjs/core` rompe la resolución de `Reflector`). Documentado en la cabecera del spec.
- **La app apagada de la suite usa el provider JWKS real** (el remoto de Microsoft, apuntando al tenant ficticio `TENANT_A`). Es la única forma de que el 401 signifique algo; con `overrideProvider(JWKS)` el test se probaría a sí mismo. Sin red, el `timeoutDuration: 5000` de `createRemoteJWKSet` hace que también termine en 401 — el test no depende de tener internet.
- **`truncateAll()` volvió a llevarse al Super Admin del seed.** Repuesto con `npm -w backend run db:seed` al terminar, y los `entra_oid` de las pruebas manuales limpiados con el UPDATE documentado: la BD local queda como estaba.
- **Ruido de logs en la suite e2e:** `createNestApplication({ logger: false })` no silencia el logger HTTP de `nestjs-pino`, así que la suite escupe una línea JSON por petición. Es preexistente (Plan 01-03), no afecta a los resultados y queda fuera del alcance.

## User Setup Required

Para usar el login de desarrollo en la app desplegada hay que cargar **tres variables** en el servicio `app` de Railway y **redesplegar** (las `VITE_*` se hornean en el build):

| Variable | Valor |
|---|---|
| `DEV_AUTH_ENABLED` | `true` |
| `DEV_AUTH_PASSWORD` | Contraseña generada al azar, **12 caracteres o más** (si mide menos, el proceso no arranca) |
| `VITE_DEV_AUTH` | `true` |

Y comprobar que el email con el que se entra existe en `users` y está activo (el del seed, `SEED_SUPERADMIN_EMAIL`, ya lo está).

**Al llegar el tenant real de FAVA, el cutover completo está en `docs/ENV.md § Login de desarrollo temporal → Apagarlo`.** Los dos pasos obligatorios: quitar las tres variables **y** ejecutar `UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%';`.

## Next Phase Readiness

- **La app desplegada es usable de verdad sin tenant:** el usuario entra, ve sus roles reales y todas las pantallas cableadas del Plan 01-05 funcionan contra el backend real. Esto desbloquea la validación funcional de la Fase 2 sin esperar a FAVA.
- **AUTH-01 sigue sin cerrarse contra Microsoft real.** Este plan cubre el flujo de sesión end-to-end (token → guard → RBAC → UI); la verificación contra el emisor real de Entra sigue pendiente del tenant, con el checkpoint del Plan 01-06.
- **Concern:** mientras el modo esté encendido, **quien conozca la contraseña compartida puede entrar como cualquier email dado de alta**, incluido el Super Admin. No es una limitación que se pueda cerrar sin Entra: es la razón por la que el modo es temporal y por la que la app no debe llevar datos reales hasta el cutover. Está escrito en `ENV.md` y en la banda de la interfaz.
- **Concern:** un redespliegue cierra todas las sesiones de desarrollo (las claves viven en memoria). Es intencional; conviene saberlo antes de la primera demo.

## Self-Check: PASSED

- 5/5 archivos creados existen en disco; 12/12 modificados presentes.
- 5/5 commits verificados en el historial: `f0c4e92`, `e0f2b37`, `5940633`, `0205deb`, `5029c9e`.
- **`git diff 7ec773e..HEAD -- backend/src/common/auth/entra.guard.ts` → 0 líneas.** El guard no se tocó (restricción de seguridad 4).
- `npm -w backend run test` → 12 passed. `npm -w backend run test:e2e` → **7 suites, 53 tests passed** (6/45 antes de esta plan).
- `npm run build` en la raíz del workspace: verde (frontend + backend).
- Arranque real comprobado con `node dist/main.js`: warn de modo dev en los logs, login 200, `/api/me` → `status: ok` con `["T","A","S"]`, contraseña mala → 401, header del token `{"alg":"RS256","kid":"dev-auth"}`.
- Arranque abortado comprobado sobre el `dist`: sin contraseña, con contraseña corta y con `DEV_AUTH_ENABLED=SI`; sin variables arranca con `DEV_AUTH_ENABLED = false`.
- Rojo verificado: sustituir la comprobación de contraseña por `true` tumba 2 tests del grupo «un único 401».
- BD local restaurada: usuarios de prueba borrados, `entra_oid` `dev:%` limpiados y `db:seed` re-ejecutado.

---
*Phase: 01-fundaci-n-segura-y-desplegada*
*Completed: 2026-07-25*
