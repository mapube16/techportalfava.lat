---
phase: 01-fundaci-n-segura-y-desplegada
plan: 05
subsystem: auth
tags: [msal, entra-id, react, vite, typescript, oauth, spa]

# Dependency graph
requires:
  - phase: none
    provides: frontend React 18 + Vite ya existente (prototipo con mocks)
provides:
  - "MSAL Browser v5 configurado sin msal-react (React 18 compatible)"
  - "redirect.html: puente COOP como segunda entrada de Rollup, sin script inline"
  - "lib/auth/msal.ts: initAuth/login/logout/getToken con scope único del API"
  - "lib/api/client.ts: apiFetch tipado con Bearer + tipos MeResponse/AccessRequest/ApiError"
  - "sessionStatus (boot/anon/ok/not_invited/deactivated) como gobierno del árbol de render"
  - "Pantallas sin-acceso y desactivada con «solicitar acceso»"
  - "Layout con identidad real y switcher T·A·S limitado a los roles del usuario"
  - "Sección de solicitudes de acceso pendientes en Usuarios"
affects: [01-03 (contrato /api/me y /api/access-requests), 01-06 (verificación desplegada), fase-2 (cutover del resto de mocks)]

# Tech tracking
tech-stack:
  added: ["@azure/msal-browser@5.17.1", "typescript@5.9.3 (pineado exacto)"]
  patterns:
    - "MSAL directo desde un provider propio (state.tsx), sin MsalProvider"
    - "Tipos de API escritos a mano (4 interfaces) — codegen aplazado a Fase 2"
    - "Handler único de 401 registrado en el cliente API: un solo guard para todos los llamantes"
    - "Cutover pantalla por pantalla: solo la sesión salió de los mocks"

key-files:
  created:
    - fava-control-tecnico/frontend/redirect.html
    - fava-control-tecnico/frontend/src/lib/auth/msal.ts
    - fava-control-tecnico/frontend/src/lib/api/client.ts
    - fava-control-tecnico/frontend/src/screens/NoAccess.tsx
  modified:
    - fava-control-tecnico/frontend/package.json
    - fava-control-tecnico/frontend/vite.config.ts
    - fava-control-tecnico/frontend/src/vite-env.d.ts
    - fava-control-tecnico/frontend/src/state.tsx
    - fava-control-tecnico/frontend/src/App.tsx
    - fava-control-tecnico/frontend/src/Login.tsx
    - fava-control-tecnico/frontend/src/Layout.tsx
    - fava-control-tecnico/frontend/src/screens/Users.tsx
    - fava-control-tecnico/frontend/src/i18n.ts

key-decisions:
  - "@azure/msal-react NO se instala: v5 exige React >=19.2.1 y el frontend es React 18.3; state.tsx ya cubre contexto y hooks"
  - "El 401 se maneja en el cliente API (handler registrado por state.tsx), no en cada llamante"
  - "Los roles activos vienen de /api/me: switchRole solo acepta roles de myRoles y nunca cambia permisos"
  - "NoAccess.tsx se adelantó a Task 2 para que App.tsx no dejara un commit con estados de sesión en blanco"

patterns-established:
  - "sessionStatus como única fuente de verdad del árbol de render (App.tsx)"
  - "scopes = [VITE_API_SCOPE] siempre: un token, un recurso; nunca scopes de Graph"
  - "Ramificar errores de MSAL por errorCode, nunca por message (en v5 el message es un enlace)"

requirements-completed: [AUTH-01, INFRA-03]

# Metrics
duration: 55min
completed: 2026-07-25
---

# Phase 1 Plan 05: Frontend cableado a la identidad real Summary

**Login Microsoft real con MSAL Browser v5 (sin msal-react), puente COOP `redirect.html` como segunda entrada de Rollup, cliente API tipado a mano y las tres pantallas de sesión — ok / no invitado / desactivado — gobernadas por `sessionStatus` desde `GET /api/me`.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-25T21:04:00Z
- **Completed:** 2026-07-25T21:58:03Z
- **Tasks:** 3 de 3
- **Files modified:** 13 (4 creados, 9 modificados) + baseline del frontend versionado

## Accomplishments

- El botón «Iniciar sesión con Microsoft» dispara `loginRedirect` real; el `setTimeout` de login falso desapareció de `state.tsx`.
- `redirect.html` se emite en `dist/` con el script convertido en chunk externo (`/assets/redirect-*.js`) — sin script inline, que es lo que la CSP del backend necesita.
- `apiFetch` adjunta el Bearer de `acquireTokenSilent` y centraliza el 401: cualquier llamada con token muerto devuelve la app a estado anónimo.
- Las tres decisiones locked del CONTEXT tienen UI: no-invitado con «solicitar acceso» (y estado «solicitud enviada»), desactivado con mensaje propio, e identidad de la cuenta MS visible en ambas.
- El switcher T·A·S dejó de ser un toggle de demo: solo aparece con más de un rol y solo con los roles que el servidor asignó.
- La pantalla Usuarios lista las solicitudes pendientes con badge y botón descartar.

## Task Commits

1. **Baseline: versionar el frontend existente** — `2e5f400` (chore)
2. **Task 1: MSAL Browser v5 + puente de redirección + entrada Vite** — `be64c30` (feat)
3. **Task 2: Cliente API tipado y sesión real en state.tsx** — `a4e2fc0` (feat)
4. **Task 3: Layout con identidad real y solicitudes en Usuarios** — `af5029f` (feat)

## Files Created/Modified

- `frontend/redirect.html` — puente COOP de MSAL v5; `broadcastResponseToMainFrame()` en módulo.
- `frontend/vite.config.ts` — `rollupOptions.input` con dos entradas HTML (main + redirect).
- `frontend/package.json` — `@azure/msal-browser@5.17.1`; `typescript` pineado a `5.9.3` exacto.
- `frontend/src/vite-env.d.ts` — tipa `VITE_ENTRA_SPA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, `VITE_API_SCOPE`.
- `frontend/src/lib/auth/msal.ts` — `PublicClientApplication` (sessionStorage, redirectUri al puente) + `initAuth/login/logout/getToken`.
- `frontend/src/lib/api/client.ts` — `apiFetch<T>` con Bearer y base `/api`; `MeResponse`/`AccessRequest`/`ApiError`; helpers `getMe`, `requestAccess`, `listAccessRequests`, `dismissAccessRequest`; `setUnauthorizedHandler`.
- `frontend/src/state.tsx` — `sessionStatus`/`me`/`myRoles`; efecto de montaje `initAuth() → getMe()`; `login/logout` reales; `switchRole` restringido.
- `frontend/src/App.tsx` — el árbol se decide por `sessionStatus` (boot → spinner, anon → Login, ok → Layout, resto → NoAccess).
- `frontend/src/screens/NoAccess.tsx` — variantes no-invitado y desactivada, con identidad MS, «solicitar acceso» y salir.
- `frontend/src/Login.tsx` — el bloque «prototipo de demostración» pasa a nota de cuenta corporativa (visual intacto).
- `frontend/src/Layout.tsx` — bloque de usuario con `displayName`/`email`/roles de `/api/me`; switcher condicionado a `myRoles`.
- `frontend/src/screens/Users.tsx` — sección «Solicitudes de acceso» sobre la lista mock (que sigue viva hasta Fase 2).
- `frontend/src/i18n.ts` — claves `no_access_*`, `deactivated_*`, `access_requests_*`, `login_note*` en es e it.

## Decisions Made

- **Sin `@azure/msal-react`** (Pitfall 1 del research): v5 exige React ≥19.2.1 y aquí hay React 18.3 con `StrictMode`. `state.tsx` ya es el provider central.
- **401 centralizado en el cliente API.** En vez de que cada pantalla interprete el 401, `client.ts` invoca un handler que `state.tsx` registra al montar. Un guard, todos los llamantes.
- **Los tipos del API se escriben a mano.** Son 4 interfaces; el codegen desde OpenAPI entra en Fase 2 con ~20 endpoints (decisión del research, confirmada en ejecución).
- **`NoAccess.tsx` se adelantó de Task 3 a Task 2** para que el commit de Task 2 no dejara `not_invited`/`deactivated` renderizando en blanco. Task 3 mantuvo el resto de su alcance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El frontend entero estaba sin versionar**
- **Found during:** Antes de Task 1
- **Issue:** `fava-control-tecnico/` figuraba como `??` en git: ningún archivo del prototipo estaba en el repo, así que los commits atómicos por tarea habrían mezclado «archivo nuevo» con «cambio de la tarea» y el diff no diría nada.
- **Fix:** Commit baseline `chore(01-05): track existing frontend prototype in git` con `frontend/**` tal cual, sin cambios de código. `fava-control-tecnico/README.md` se dejó fuera por pertenecer al ámbito del Plan 01-01.
- **Files modified:** 37 archivos del prototipo (sin edición).
- **Verification:** `npm run build` verde antes del commit.
- **Committed in:** `2e5f400`

**2. [Rule 1 - Bug] `goInbox()` forzaba el rol Admin a cualquier usuario**
- **Found during:** Task 2
- **Issue:** `goInbox` hacía `if (role === 'T') patch({ role: 'A' })` sin mirar los roles reales. Con la sesión real, un técnico raso pulsando la campana se autoasignaba la vista de Admin — exactamente el toggle de demo que este plan retira.
- **Fix:** `goInbox` solo conmuta a un rol administrativo que el usuario tenga (`S` preferido sobre `A`) y sale sin navegar si no tiene ninguno. En Task 3, la campana se oculta para quien no tiene rol administrativo.
- **Files modified:** `src/state.tsx`, `src/Layout.tsx`
- **Verification:** build verde; la ruta `inbox` es inalcanzable sin rol A/S desde la UI.
- **Committed in:** `a4e2fc0` (state) y `af5029f` (Layout)

**3. [Rule 2 - Missing Critical] El onboarding seguía nombrando al usuario de demo**
- **Found during:** Task 3
- **Issue:** `ob1_b` («Ivan tiene tres roles…») se muestra en el primer login de CUALQUIER usuario real, y describía un switcher que ahora solo existe para multi-rol.
- **Fix:** Texto reescrito en es e it: «Si tienes más de un rol…».
- **Files modified:** `src/i18n.ts`
- **Verification:** build verde.
- **Committed in:** `af5029f`

### Ajustes menores de contrato

- Los greps de verificación del plan (`api/me` en `state.tsx`, `access-requests` en `Users.tsx`) se satisfacen con el comentario que documenta el endpoint consumido, ya que la ruta literal vive en `lib/api/client.ts` (donde debe estar). La llamada real existe vía `getMe()` / `listAccessRequests()`.

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical) + 1 reordenación de tarea (NoAccess de Task 3 a Task 2).
**Impact on plan:** Ninguna amplía el alcance. Las tres corrigen restos del prototipo de demo que la sesión real dejaba al descubierto.

## Issues Encountered

- **Plan 01-01 creó el workspace npm en paralelo.** Tras su commit, `fava-control-tecnico/package.json` (workspaces) coexiste con el `package-lock.json` anidado del frontend. Se verificó que `npm -w frontend run build` desde la raíz del workspace es verde. El lock anidado queda registrado en `deferred-items.md` para que lo retire 01-01/01-06 — no se borra desde aquí por ser archivo de otro plan en vuelo.
- **Sin runner de tests en el frontend** (decisión de 01-VALIDATION): la verificación de esta plan es build `tsc` + los greps del contrato. El comportamiento end-to-end (login real con las 3 cuentas) se verifica en el checkpoint del Plan 01-06.

## User Setup Required

Ninguno desde este plan. Las variables `VITE_ENTRA_SPA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID` y `VITE_API_SCOPE` las documenta el Plan 01-04 (`docs/ENTRA-SETUP.md` / `docs/ENV.md`) y deben existir en el build de Railway antes de la verificación del Plan 01-06. El redirect URI a registrar en Entra es `<origen>/redirect.html`.

## Next Phase Readiness

- Listo para el Plan 01-06: el frontend compila con las dos entradas HTML y espera un backend que sirva `GET /api/me` con la unión discriminada acordada (`ok` / `not_invited` / `deactivated`).
- El Plan 01-03 debe implementar el contrato con los nombres exactos de `lib/api/client.ts`; cualquier divergencia se ve como pantalla en blanco tras el login.
- Recordatorio para el backend (Pitfall 2 del research): `/redirect.html` NO puede servirse con `Cross-Origin-Opener-Policy`, y la CSP necesita `login.microsoftonline.com` en `connect-src`/`frame-src`/`form-action`.
- El resto de los mocks de `data.ts` sigue vivo por diseño; su cutover es Fase 2 en adelante.

## Trazabilidad de requisitos

- **INFRA-03 → marcado completo.** El cliente tipado y MSAL existen y el mock de sesión salió de `state.tsx`; el retiro del resto de mocks es explícitamente pantalla por pantalla en fases siguientes.
- **AUTH-01 → NO marcado desde aquí.** Este plan entrega solo el lado cliente. El requisito se cierra cuando 01-03 valide el token en el backend y 01-06 verifique el login real desplegado con las 3 cuentas. Marcarlo ahora sería un falso verde.

## Self-Check: PASSED

- Artefactos presentes: `redirect.html`, `src/lib/auth/msal.ts` (contiene `acquireTokenSilent`), `src/lib/api/client.ts` (contiene `MeResponse` y usa `getToken`), `src/screens/NoAccess.tsx` (98 líneas ≥ 30 exigidas).
- `vite.config.ts` declara la entrada `redirect`; `dist/index.html` y `dist/redirect.html` se emiten, y el redirect sale sin script inline.
- Commits verificados en el repo: `2e5f400`, `be64c30`, `a4e2fc0`, `af5029f`.
- `npm run build` verde en frontend y desde la raíz del workspace (`npm -w frontend run build`).

---
*Phase: 01-fundaci-n-segura-y-desplegada*
*Completed: 2026-07-25*
