---
phase: 01-fundaci-n-segura-y-desplegada
plan: 03
subsystem: auth
tags: [nestjs, jose, entra-id, rbac, guards, jest, supertest, prisma]

# Dependency graph
requires:
  - phase: 01-01
    provides: "PrismaService.base/.client, EnvService (zod), test/helpers/db.ts, esquema con users.entra_oid @unique"
provides:
  - "EntraGuard global: jwtVerify (firma+iss+aud+exp) + tid + scp, todo desde env"
  - "Lookup del usuario por entra_oid en CADA peticion, sin cache (AUTH-04)"
  - "Vinculacion atomica email→OID en el primer login (updateMany count===1)"
  - "RolesGuard global + @Roles/@AllowUnprovisioned/@Public/@CurrentUser"
  - "JWKS como token de DI sustituible: los tests firman sus propios tokens sin red ni tenant"
  - "GET /api/me como union discriminada ok | not_invited | deactivated"
  - "POST/GET/PATCH /api/access-requests (POST con rate limit 5/hora)"
  - "GET /api/users, PATCH /api/users/:id/roles y /:id/active con la escalada en el servicio"
  - "test/helpers/tokens.ts y test/helpers/app.ts para las fases siguientes"
affects: [01-06-deploy, fase-02-dominio, fase-07-tableros]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Todo protegido por defecto: dos APP_GUARD y opt-out explicito por decorador"
    - "El guard deja tres cosas en la peticion: req.entra (token), req.dbUser (fila aunque este inactiva) y req.user (solo activo)"
    - "La regla de autorizacion condicional vive en el servicio; el decorador solo dice quien entra"
    - "jose 6 es ESM-only: Node ≥22.12 lo carga con require(esm) y Jest lo transpila con ts-jest"

key-files:
  created:
    - fava-control-tecnico/backend/src/common/auth/jwks.provider.ts
    - fava-control-tecnico/backend/src/common/auth/entra.guard.ts
    - fava-control-tecnico/backend/src/common/auth/entra.guard.spec.ts
    - fava-control-tecnico/backend/src/common/auth/roles.guard.ts
    - fava-control-tecnico/backend/src/common/auth/roles.decorator.ts
    - fava-control-tecnico/backend/src/common/auth/allow-unprovisioned.decorator.ts
    - fava-control-tecnico/backend/src/common/auth/public.decorator.ts
    - fava-control-tecnico/backend/src/common/auth/current-user.decorator.ts
    - fava-control-tecnico/backend/src/modules/me/me.module.ts
    - fava-control-tecnico/backend/src/modules/me/me.controller.ts
    - fava-control-tecnico/backend/src/modules/access-requests/access-requests.module.ts
    - fava-control-tecnico/backend/src/modules/access-requests/access-requests.controller.ts
    - fava-control-tecnico/backend/src/modules/access-requests/access-requests.service.ts
    - fava-control-tecnico/backend/src/modules/users/users.module.ts
    - fava-control-tecnico/backend/src/modules/users/users.controller.ts
    - fava-control-tecnico/backend/src/modules/users/users.service.ts
    - fava-control-tecnico/backend/test/helpers/tokens.ts
    - fava-control-tecnico/backend/test/helpers/app.ts
    - fava-control-tecnico/backend/test/auth.e2e-spec.ts
    - fava-control-tecnico/backend/test/tenant-swap.e2e-spec.ts
    - fava-control-tecnico/backend/test/users-roles.e2e-spec.ts
  modified:
    - fava-control-tecnico/backend/src/app.module.ts
    - fava-control-tecnico/backend/src/common/health/health.controller.ts
    - fava-control-tecnico/backend/tsconfig.json
    - fava-control-tecnico/backend/package.json
    - fava-control-tecnico/backend/test/jest-e2e.json
    - fava-control-tecnico/package.json
    - fava-control-tecnico/docs/ENTRA-SETUP.md

key-decisions:
  - "El guard deja req.dbUser (la fila por oid, activa o no) ademas de req.user: /api/me distingue deactivated sin una segunda consulta y sin duplicar la regla"
  - "Los dos anti-lockout se evaluan ANTES del permiso: quitar el rol S al ultimo Super Admin responde DEBE_QUEDAR_UN_SUPER_ADMIN y no un 403 que manda a arreglar lo que no esta roto"
  - "La regla de escalada cubre tambien al objetivo: un actor sin S no toca a quien ya es A o S (si no, un Admin degrada a su Super Admin y se queda mandando)"
  - "jose 6 es ESM-only: engines.node pasa a >=22.12 (require(esm)) y Jest transpila jose con allowJs + transformIgnorePatterns"
  - "El claim email es obligatorio en el Registro A de Entra: sin el no hay vinculacion en el primer login (documentado en ENTRA-SETUP.md)"

patterns-established:
  - "El JWKS es un provider inyectable, no un modulo importado: sustituirlo es toda la diferencia entre un test con red y uno sin ella"
  - "Los tests de identidad firman sus propios tokens con una clave local: los casos que Entra nunca emite (expirado, aud ajeno, tid ajeno, sin scp) son datos, no mocks del verificador"
  - "El swap de tenant se prueba levantando dos apps del mismo codigo con distinto ENTRA_TENANT_ID"

requirements-completed: [AUTH-01, AUTH-02, AUTH-04]

# Metrics
duration: 45min
completed: 2026-07-25
---

# Phase 1 Plan 03: Cadena de identidad del backend (Entra + RBAC) Summary

**Guard global de Entra con `jose`, lookup del usuario en cada petición sin cache, vinculación atómica email→OID en el primer login, `/api/me` como unión discriminada y la regla «solo un Super Admin asigna Admin» en un único sitio — con 22 tests que firman sus propios tokens, sin red y sin tenant real.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-25T21:50:00Z (aprox.)
- **Completed:** 2026-07-25T22:40:00Z
- **Tasks:** 3 de 3 (los 3 en TDD: RED y GREEN por separado)
- **Files modified:** 28 (21 creados, 7 modificados)

## Accomplishments

- **AUTH-01 probado por los dos lados.** El token se valida con `jwtVerify` (firma contra JWKS, `iss`, `aud`, `exp`, `nbf`) y además se comprueban `tid` y `scp` a mano, porque un endpoint `/common` emite un issuer genérico y sin el chequeo de `tid` cualquier tenant de Microsoft entraría. Los cuatro rechazos son tests unitarios con tokens construidos a propósito, no mocks del verificador.
- **El swap dev→FAVA es una variable, y hay un test que lo demuestra:** `tenant-swap.e2e-spec.ts` levanta **dos apps del mismo código** con `ENTRA_TENANT_ID` distinto y cruza los tokens. Si alguien hardcodea un tenant, la suite se pone roja por los dos lados.
- **AUTH-04 (criterio 3 del roadmap) con el mismo token en la mano:** un Admin activo lee `/api/access-requests` → se le desactiva por fuera de la app → la petición **inmediatamente siguiente**, con el mismo `Authorization`, responde 403 y `/api/me` responde `deactivated`. No hay cache que invalidar: el `SELECT` por `entra_oid` (índice único) ocurre en cada petición, y frente a la verificación criptográfica que ya sucede es ruido.
- **AUTH-02 (criterio 4) con los tres casos y los dos anti-lockout:** Admin→Técnico 200, Admin→Admin 403, Super Admin→Admin 200, quitarse el propio S 400, y dejar la app sin Super Admin 400 (por roles y por desactivación).
- **Las tres pantallas del CONTEXT tienen su estado en el servidor,** con los nombres de campo exactos que consume `frontend/src/lib/api/client.ts`. La solicitud de acceso es idempotente (upsert por `entra_oid`) y es el único endpoint escribible por cualquier miembro del tenant: 5 por hora, con test del 429.
- **Suite completa de la fase en verde tras el merge con el Plan 01-02** (que aterrizó a mitad de ejecución): 12 unit + 45 e2e en 6 suites, con el `RlsInterceptor` real abriendo la transacción por petición sobre el `req.user` que deja este guard.

## Task Commits

1. **Task 1 (TDD): guard de Entra, decoradores y JWKS inyectable**
   - RED — `1aeb5a2` (test)
   - GREEN — `a76cb0d` (feat)
2. **Task 2 (TDD): /api/me y solicitudes de acceso**
   - RED — `046e3e6` (test)
   - GREEN — `9499d11` (feat)
3. **Task 3 (TDD): módulo users con escalada y anti-lockout**
   - RED — `f8140fd` (test)
   - GREEN — `75e2caf` (feat)
4. **Claim `email` obligatorio en el Registro A** — `78d6553` (docs)

## Files Created/Modified

- `common/auth/jwks.provider.ts` — `createRemoteJWKSet` con `cacheMaxAge`/`cooldownDuration`/`timeoutDuration`, tras el token de DI `JWKS`.
- `common/auth/entra.guard.ts` — verificación, `tid`, `scp`, lookup por `entra_oid`, vinculación por email y las tres propiedades que deja en la petición (`entra`, `dbUser`, `user`).
- `common/auth/roles.guard.ts` — compara con los roles **de la BD**; el switcher T·A·S del header es estado de UI y no autoriza nada.
- `common/auth/{roles,allow-unprovisioned,public,current-user}.decorator.ts` — 4 decoradores de 5 líneas cada uno.
- `modules/me/me.controller.ts` — la unión discriminada; el tipo `MeResponse` vive aquí porque es el contrato.
- `modules/access-requests/*` — identidad siempre del token, upsert por `entra_oid`, 409 si ya hay acceso, `@UseGuards(ThrottlerGuard)` + `@Throttle(5/hora)` solo en el POST.
- `modules/users/users.service.ts` — `SOLO_SUPER_ADMIN_ASIGNA_ADMIN`, `NO_PUEDES_QUITARTE_SUPER_ADMIN`, `DEBE_QUEDAR_UN_SUPER_ADMIN` y `SOLO_SUPER_ADMIN_DESACTIVA_ADMINS`, todas en un archivo.
- `src/app.module.ts` — `jwksProvider` + dos `APP_GUARD` (Entra, luego Roles) + los tres módulos.
- `common/health/health.controller.ts` — `@Public()`: el healthcheck de Railway no tiene credenciales.
- `test/helpers/tokens.ts` — `generateKeyPair('RS256')` + `createLocalJWKSet` + `signTestToken`.
- `test/helpers/app.ts` — app de test con las **dos** sustituciones (JWKS y EnvService) y un sembrador de usuarios.
- `test/{auth,tenant-swap,users-roles}.e2e-spec.ts` — 22 tests e2e contra Postgres real.
- `docs/ENTRA-SETUP.md` — el claim `email` como paso obligatorio del portal.

## Decisions Made

1. **`req.dbUser` además de `req.user`.** El guard ya tiene la fila del usuario en la mano; guardarla aunque esté inactiva le ahorra a `/api/me` una segunda consulta y evita que la regla «qué significa desactivado» viva en dos sitios.
2. **Los anti-lockout se evalúan antes que el permiso.** Un Admin que intenta quitarle el rol S al último Super Admin recibe `DEBE_QUEDAR_UN_SUPER_ADMIN` (400), no un 403. El 403 le diría que el problema es su rol, y el problema es que la operación deja la app sin nadie que administre.
3. **La escalada mira también al objetivo.** El plan pedía `next.some(r => r === 'A' || r === 'S')`. Eso deja abierto que un Admin ponga `roles: ['T']` a un Super Admin y lo degrade. La condición pasa a `escala(next) || esAdmin(target.roles)`, mismo mensaje, una línea.
4. **`@Public` como decorador separado de `@AllowUnprovisioned`.** Son cosas distintas: `/health` va **sin token**; `/api/me` exige un token válido del tenant y solo tolera que el `oid` no esté aprovisionado. Mezclarlos en un decorador habría dejado `/health` como precedente para «esto tampoco necesita token».
5. **El tipo `MeResponse` se escribe en el controlador**, no en un archivo de tipos compartido. Es el contrato del frontend: si cambia, cambia donde se sirve.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `jose@6` es ESM-only y el runtime CJS de Jest no lo carga**
- **Found during:** Task 1
- **Issue:** `import { jwtVerify } from 'jose'` compila, pero al ejecutar la suite Jest falla con `SyntaxError: Unexpected token 'export'`. `jose` 6 publica un único build ESM (`exports['.'] → dist/webapi/index.js`, `"type": "module"`), y el backend compila a CommonJS.
- **Fix:** (a) en producción no hay problema: Node 22.17 carga ESM desde `require()` (require(esm), estable desde 22.12) — verificado con `node -e "require('jose')"`; se subió `engines.node` de `22.x` a `>=22.12 <23` para que Railway no provisione un 22.0 que reventaría al arrancar. (b) en Jest se transpila `jose` con ts-jest: `allowJs: true` en `tsconfig.json` y `transformIgnorePatterns: ["/node_modules/(?!jose/)"]` en las dos configuraciones.
- **Files modified:** `backend/tsconfig.json`, `backend/package.json`, `backend/test/jest-e2e.json`, `package.json` (raíz)
- **Verification:** `npm -w backend run test` y `test:e2e` verdes; `npm -w backend run build` verde.
- **Committed in:** `a76cb0d`

**2. [Rule 3 - Blocking] Los tipos generados por Prisma 7 no se llaman como el plan asumía**
- **Found during:** Task 1
- **Issue:** `import type { User } from '../generated/prisma/models'` no compila: el generador `prisma-client` de Prisma 7 exporta `UserModel`, y los enums no salen de `client.ts` sino de `enums.ts`.
- **Fix:** `import type { UserModel as User }` y `Role` desde `../generated/prisma/enums`.
- **Files modified:** los 4 archivos de `common/auth/` que tipan usuario o rol
- **Verification:** `nest build` sin errores.
- **Committed in:** `a76cb0d`

**3. [Rule 2 - Missing Critical] Un Admin podía degradar a un Super Admin**
- **Found during:** Task 3
- **Issue:** La regla del plan (`next.some(r => r === 'A' || r === 'S')`) solo mira los roles que se asignan. Con `roles: ['T']` sobre un Super Admin, `escalates` es `false` y un Admin lo degrada — exactamente lo contrario de la matriz §6. Lo mismo con `PATCH /:id/active` sobre un Admin.
- **Fix:** la condición mira también los roles actuales del objetivo (`esAdmin(target.roles)`), y `cambiarActivo` tiene su gemela (`SOLO_SUPER_ADMIN_DESACTIVA_ADMINS`). Test propio: «un Admin no toca los roles de otro Admin → 403».
- **Files modified:** `backend/src/modules/users/users.service.ts`, `backend/test/users-roles.e2e-spec.ts`
- **Verification:** `npm -w backend run test:e2e -- users-roles` → 10 passed.
- **Committed in:** `75e2caf`

**4. [Rule 2 - Missing Critical] Desactivar al último Super Admin no estaba cubierto**
- **Found during:** Task 3
- **Issue:** El plan protege el rol S al asignar roles, pero `PATCH /:id/active { isActive: false }` sobre el único Super Admin activo dejaba la app sin nadie que administre — el mismo lockout por la puerta de al lado, y la recuperación es SQL a mano contra producción.
- **Fix:** la comprobación `DEBE_QUEDAR_UN_SUPER_ADMIN` también en `cambiarActivo`, con test.
- **Files modified:** `backend/src/modules/users/users.service.ts`, `backend/test/users-roles.e2e-spec.ts`
- **Verification:** test «anti-lockout: desactivar al último Super Admin activo → 400» en verde.
- **Committed in:** `75e2caf`

**5. [Rule 2 - Missing Critical] El claim `email` no estaba en la guía de Entra**
- **Found during:** Verificación final
- **Issue:** `docs/ENTRA-SETUP.md` (Plan 01-04) no pide el optional claim `email` en el access token del Registro A. Sin él, el token no trae `email`, la vinculación del primer login no ocurre y **un usuario dado de alta ve «tu cuenta no está habilitada»** — un fallo silencioso que solo se descubre en el primer login real.
- **Fix:** un ítem en el checklist del portal y dos filas (`email`, `oid`) en la tabla de verificación por jwt.ms.
- **Files modified:** `fava-control-tecnico/docs/ENTRA-SETUP.md`
- **Verification:** documental; se comprueba en el checkpoint del Plan 01-06.
- **Committed in:** `78d6553`

### Simplificaciones deliberadas

- **Sin `auth.module.ts`.** El `jwksProvider` y los dos `APP_GUARD` se declaran en `app.module.ts`, que es donde Nest instancia los guards globales. Un módulo intermedio solo añadiría un archivo y un `exports`.
- **Validación de body a mano (3 líneas), sin `class-validator`.** Los dos únicos bodies de esta plan son `{ status: 'dismissed' }` y `{ roles: Role[] }` / `{ isActive: boolean }`. Instalar `class-validator` + `class-transformer` + `ValidationPipe` global para eso es más superficie de la que ahorra. `ParseUUIDPipe` (ya en `@nestjs/common`) cubre los path params.
- **`test/helpers/app.ts` (no estaba en la lista de archivos del plan).** Las tres suites e2e necesitan las mismas dos sustituciones de provider; triplicarlas garantizaba que la tercera copia divergiera.
- **La lista de solicitudes ordena por `status DESC`** — `'pending' > 'dismissed'` alfabéticamente. Con exactamente dos estados, un `CASE` o un campo `priority` sería ceremonia; el comentario lo dice en el sitio.
- **Sin test de «desactivarse a uno mismo»**: el anti-lockout del último Super Admin ya cubre el caso irreversible, y que un Super Admin de dos se desactive lo arregla el otro.

---

**Total deviations:** 5 auto-fixed (2 blocking, 3 missing critical) + 5 simplificaciones deliberadas
**Impact on plan:** Ninguna cambia el alcance ni el contrato con el frontend. Las dos «blocking» son realidades de las librerías (jose ESM-only, nombres del generador de Prisma 7). Las tres «missing critical» cierran agujeros de privilegio y un fallo silencioso de despliegue.

## Issues Encountered

- **Limitación conocida y declarada (Pitfall 7 del research):** AUTH-04 se cumple al 100 % para la baja **en la app** (siguiente petición). La baja **en el directorio de Entra** no corta el token ya emitido: sigue siendo criptográficamente válido hasta que expira, y la vida del token de Entra es **aleatoria entre 60 y 90 minutos**. La mitigación completa es Continuous Access Evaluation (declararse recurso CAE-capable y manejar los *claims challenge*), desproporcionada para esta fase. **Procedimiento operativo de baja: desactivar en la app _y_ en el directorio** — la app corta al instante, el directorio impide la siguiente emisión. Esto es una limitación documentada, no un bug.
- **Un solo Postgres local para dos plans en paralelo.** Durante la Task 2, la suite `tenant-swap` falló una vez con `not_invited` donde esperaba `ok`: el Plan 01-02 estaba corriendo sus e2e a la vez y su `truncateAll()` se llevó por delante el usuario sembrado en `beforeAll`. Se movió la siembra a `beforeEach` (que además es lo correcto para el aislamiento) y se re-ejecutó. **Las suites e2e de dos plans no pueden correr simultáneamente contra la misma base**; con `--runInBand` dentro de una plan es suficiente.
- **`truncateAll()` borra al Super Admin del seed.** Repuesto al terminar con `npm -w backend run db:seed` (ya documentado por el Plan 01-01).
- **El `tsconfig.json` sigue usando `baseUrl`**, que el analizador de TypeScript 7 marca como deprecado. Es del Plan 01-01, no afecta a la compilación con 5.9.3 y está fuera del alcance de esta plan.

## User Setup Required

En el portal de Entra, antes del Plan 01-06 (añadido a `docs/ENTRA-SETUP.md`):

- **Registro A → Token configuration → Add optional claim → Access → `email`.** Sin ese claim, ningún invitado consigue vincular su cuenta en el primer login.

Nada más: el guard no necesita secretos (el JWKS es público) y las tres variables (`ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_REQUIRED_SCOPE`) ya estaban en el contrato de env del Plan 01-01.

## Next Phase Readiness

**Listo para 01-06 (deploy):**
- `/health` es la única ruta sin token; todo `/api/*` responde 401 sin `Authorization` (dos aserciones en `auth.e2e-spec`). El smoke del Plan 01-06 puede dar por bueno `GET /api/me` → 401 sin token.
- `engines.node` exige `>=22.12`: Railway debe provisionar 22.12 o superior o el proceso morirá al cargar `jose`. **Verificar en el primer deploy** (`node -v` en los logs de build).
- El primer login real necesita el optional claim `email` (arriba).

**Listo para Fase 2 (dominio):**
- `@CurrentUser()`, `@Roles()` y el contexto RLS del Plan 01-02 (que lee `req.user`) están operativos: un servicio nuevo usa `prisma.client` y ya corre dentro de la transacción con las GUCs fijadas.
- `test/helpers/app.ts` + `tokens.ts` permiten escribir un e2e autenticado con tres líneas.

**Concerns:**
- `users` y `access_requests` siguen **sin políticas RLS** (decisión del Plan 01-02, correcta: el guard consulta `users` antes de que exista contexto). Su aislamiento es de capa de servicio (`@Roles`). Si una fase futura añade un endpoint que lea `users` sin pasar por `@Roles`, no hay red de seguridad debajo.
- El rate limit es en memoria (`@nestjs/throttler` por defecto). Con una sola instancia en Railway es correcto; si algún día hay dos réplicas, el límite se multiplica por el número de réplicas.

## Self-Check: PASSED

- 21/21 archivos creados existen en disco; 7/7 modificados presentes.
- 7/7 commits verificados en el historial: `1aeb5a2`, `a76cb0d`, `046e3e6`, `9499d11`, `f8140fd`, `75e2caf`, `78d6553`.
- `npm -w backend run test` → 12 passed (entra.guard).
- `npm -w backend run test:e2e` → **6 suites, 45 tests passed** (incluye las suites del Plan 01-02 tras el merge).
- `npm -w backend run build` verde.
- Grep de seguridad: `preferred_username` no aparece en código ejecutable (solo en comentarios que explican por qué no se usa); ningún cache/TTL sobre el lookup de `users`; `issuer` y `audience` salen de `EnvService`, no de constantes.

---
*Phase: 01-fundaci-n-segura-y-desplegada*
*Completed: 2026-07-25*
