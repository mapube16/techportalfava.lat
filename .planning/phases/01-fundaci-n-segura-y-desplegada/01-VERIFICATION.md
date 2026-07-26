---
phase: 01-fundaci-n-segura-y-desplegada
verified: 2026-07-25T23:59:00Z
status: gaps_found
score: 4/5 success criteria verified (6/7 requirements satisfied)
gaps:
  - truth: "Un usuario abre la URL de Railway, hace login con Microsoft y el frontend real (no el mock) muestra su nombre y rol traídos del API."
    status: failed
    reason: "No existe un tenant de Entra propio del usuario (lo que vio en el portal es el 'Microsoft Services tenant' de sistema, sin directorio, no apto para app registrations). Los dos registros de Entra (Registro A API, Registro B SPA) que exige AUTH-01 nunca se crearon en ningún tenant real. Verificado en vivo: `railway variables` muestra ENTRA_TENANT_ID=ENTRA_API_CLIENT_ID=VITE_ENTRA_SPA_CLIENT_ID=VITE_ENTRA_TENANT_ID = literal 'placeholder-sin-tenant' en el servicio de producción. El único login que funciona hoy en la URL pública es el modo dev temporal (DEV_AUTH_ENABLED=true, confirmado por HTTP: POST /api/dev-auth/login responde 401 con body vacío, no 404), que usa una contraseña compartida — exactamente lo que AUTH-01 prohíbe ('la app no gestiona contraseñas')."
    artifacts:
      - path: "fava-control-tecnico/docs/ENTRA-SETUP.md"
        issue: "Receta completa, correcta y committeada (2 registros + fallback de 1 + tenant swap), pero el checkpoint humano que la ejecuta (Plan 01-04 Task 2, 'checkpoint:human-action') nunca se completó — no hay SUMMARY.md para 01-04."
      - path: "fava-control-tecnico/frontend/src/lib/auth/msal.ts"
        issue: "Código MSAL Browser v5 real y correcto (loginRedirect, acquireTokenSilent, ramificación por errorCode) — no es un stub — pero nunca se ha ejercitado contra un tenant real porque no hay client id ni tenant id reales que inyectarle."
      - path: "fava-control-tecnico/backend/src/common/auth/entra.guard.ts"
        issue: "Ninguno — el guard es correcto y pasa 12 unit + 53 e2e con tokens firmados localmente. El artefacto que falta no es código, es el registro externo en Entra."
    missing:
      - "Cuenta Azure con tenant Entra ID propio (del desarrollador o directamente de FAVA) — requiere verificación con tarjeta y no se puede evitar creando uno temporal, porque habría que repetir la verificación contra el tenant real de FAVA de todos modos."
      - "Ejecutar 01-04 Task 2: crear Registro A (API, scope access_as_user, requestedAccessTokenVersion 2) y Registro B (SPA, redirect a /redirect.html) siguiendo ENTRA-SETUP.md; obtener los 4 valores reales."
      - "Cargar ENTRA_TENANT_ID / ENTRA_API_CLIENT_ID / VITE_ENTRA_SPA_CLIENT_ID / VITE_API_SCOPE reales en las variables del servicio de Railway (hoy son el literal 'placeholder-sin-tenant') y redesplegar (las VITE_* se hornean en build)."
      - "Ejecutar 01-06 Task 3 (checkpoint:human-verify): checklist de las 3 cuentas (invitada / no invitada / desactivada) con la consola del navegador abierta, verificando ausencia de errores COOP/CSP contra login.microsoftonline.com."
      - "Tras el cutover: apagar DEV_AUTH_ENABLED y VITE_DEV_AUTH, y correr `UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%'` (documentado en docs/ENV.md) para que el primer login real de cada persona no choque con el oid ficticio."
---

# Phase 1: Fundación segura y desplegada — Verification Report

**Phase Goal:** Cualquier persona de FAVA entra a una URL pública, inicia sesión con su cuenta Microsoft, y la app sabe quién es y qué tiene permitido ver — con el aislamiento por técnico garantizado en la base, no en el código.

**Verified:** 2026-07-25
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria del ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Login con Microsoft en la URL de Railway muestra nombre/rol reales del API | ✗ FAILED | No hay tenant de Entra ni app registrations reales. `railway variables` en producción: `ENTRA_TENANT_ID=ENTRA_API_CLIENT_ID=VITE_ENTRA_SPA_CLIENT_ID=VITE_ENTRA_TENANT_ID = "placeholder-sin-tenant"`. El login que funciona hoy es el modo dev (contraseña compartida), no Microsoft SSO. |
| 2 | Técnico que consulta datos de otro técnico recibe 0 filas (rol app, sin BYPASSRLS) | ✓ VERIFIED | Verificado de forma independiente contra Postgres de producción vía `psql` directo (proxy Railway): `fava_app` → `rolsuper=f`, `rolbypassrls=f`; `daily_entries`/`weekly_notes` → `relrowsecurity=t`, `relforcerowsecurity=t`. Localmente, suite `rls-isolation.e2e-spec.ts` (13 casos) en verde contra Postgres real con `fava_app`. |
| 3 | Desactivar a un usuario le corta el acceso en su siguiente petición | ✓ VERIFIED | `auth.e2e-spec.ts` (caso AUTH-04: mismo token, desactivación vía owner, siguiente petición 403/deactivated) pasa dentro de la suite completa ejecutada localmente (7 suites / 53 tests en verde). Guard sin cache: `findUnique` por `entraOid` en cada petición, confirmado leyendo `entra.guard.ts`. |
| 4 | Admin que asigna Admin recibe 403; Super Admin lo consigue | ✓ VERIFIED | `users-roles.e2e-spec.ts` dentro de la suite en verde; regla `SOLO_SUPER_ADMIN_ASIGNA_ADMIN` + 2 anti-lockout verificados en `users.service.ts`. |
| 5 | Transición multi-tabla con RLS activo, sin P2028 ni fuga de contexto | ✓ VERIFIED | `rls-transaction.e2e-spec.ts` (200 transiciones concurrentes, pool de 10) dentro de la suite en verde ejecutada localmente. |

**Score:** 4/5 truths verified.

### Required Artifacts (verificación independiente, no solo lectura de SUMMARY)

| Artefacto | Esperado | Status | Detalle |
|---|---|---|---|
| `fava-control-tecnico/backend/src/common/auth/entra.guard.ts` | jwtVerify + tid + scp + lookup sin cache | ✓ VERIFIED | Leído completo; verifica firma/iss/aud/exp vía `jwtVerify`, `tid` explícito, `scp`, lookup `findUnique({entraOid})` sin cache, vinculación atómica por `updateMany` count===1. |
| `fava-control-tecnico/backend/src/common/auth/jwks.provider.ts` | Conmuta JWKS local (dev) vs remoto (Microsoft) | ✓ VERIFIED | `useFactory` devuelve `createLocalJWKSet` si `DEV_AUTH_ENABLED`, si no `createRemoteJWKSet` contra `login.microsoftonline.com/{tenant}`. Único punto donde el modo dev existe para validación. |
| `fava-control-tecnico/backend/prisma/migrations/20260725221504_rls/migration.sql` | ENABLE+FORCE RLS + políticas | ✓ VERIFIED | Leído; y re-confirmado con `psql` directo tanto en local como en producción (`relrowsecurity`/`relforcerowsecurity` = true). |
| `fava-control-tecnico/backend/src/common/auth/dev-auth.*` | Login temporal validado por el MISMO guard | ✓ VERIFIED | `git diff 7ec773e..HEAD -- entra.guard.ts` → 0 líneas (confirmado independientemente). Endpoint vivo en producción: `POST /api/dev-auth/login` → 401 (no 404) con body vacío. |
| `fava-control-tecnico/frontend/src/lib/auth/msal.ts` | PublicClientApplication + loginRedirect/acquireTokenSilent | ✓ VERIFIED (código) / ✗ SIN EJERCITAR | Código real, no stub. Sin tenant real, nunca completó un login real de punta a punta. |
| `fava-control-tecnico/docs/ENTRA-SETUP.md` | Receta reproducible de los 2 registros | ✓ VERIFIED (doc) / ✗ SIN EJECUTAR | Documento completo y correcto; el checkpoint humano que lo ejecuta nunca ocurrió. |
| `fava-control-tecnico/railway.toml` + deploy | Servicio desplegado, healthcheck, pre-deploy migrate | ✓ VERIFIED | `curl` directo: `/health`→200, `/`→200, `/api/me`→401, `/redirect.html` sin cabecera COOP. Coincide con el smoke declarado 4/4. |

### Key Link Verification

| From | To | Via | Status | Detalle |
|---|---|---|---|---|
| `entra.guard.ts` | `users` (BD) | `findUnique` por `entraOid`, sin cache | ✓ WIRED | Confirmado leyendo el archivo; ejercitado por 53 e2e en verde. |
| `jwks.provider.ts` | `dev-auth.service.ts` | keyset local compartido (RSA en memoria) | ✓ WIRED | Mismo `devKeyPair()` importado por ambos; `kid: dev-auth` reconocible. |
| Railway `DATABASE_URL` (runtime) | rol `fava_app` | conexión explícita, nunca la URL owner | ✓ WIRED | Verificado con `railway variables`: `DATABASE_URL=postgresql://fava_app:...@postgres.railway.internal/...`. Rol confirmado `rolsuper=f rolbypassrls=f` vía `psql` directo. |
| `frontend/src/lib/auth/msal.ts` | Entra tenant real | `authority` con `VITE_ENTRA_TENANT_ID` | ✗ NOT WIRED | La variable de producción es el literal `"placeholder-sin-tenant"`, no un tenant real — el link de código existe, el extremo remoto no. |
| `RlsInterceptor` | `PrismaService.client` (ALS) | `als.run(tx, …)` | ✓ WIRED | Confirmado por `rls-transaction.e2e-spec.ts` (200 tx concurrentes) en verde. |

### Requirements Coverage

| Requirement | Source Plan(s) | Descripción | Status | Evidencia |
|---|---|---|---|---|
| AUTH-01 | 01-03, 01-04, 01-05, 01-07 | SSO con Microsoft Entra ID; la app no gestiona contraseñas | ✗ BLOCKED | Backend/frontend construidos y probados con tokens firmados localmente; validación contra Microsoft real pendiente de tenant. El sustituto operativo (dev-auth) sí gestiona una contraseña compartida — contradice literalmente el enunciado del requisito mientras esté activo. `REQUIREMENTS.md` ya lo marca "Parcial" con nota explicativa — coincide con lo verificado aquí. |
| AUTH-02 | 01-03 | RBAC 3 roles, solo Super Admin asigna Admin | ✓ SATISFIED | `users-roles.e2e-spec.ts` en verde (dentro de las 53 e2e); regla en `users.service.ts` leída y confirmada. |
| AUTH-03 | 01-02 | RLS: técnico no lee registros de otro | ✓ SATISFIED | Verificado independientemente en producción vía `psql` directo (rol y flags de RLS) además de la suite e2e local. |
| AUTH-04 | 01-03 | Desactivado pierde acceso de inmediato | ✓ SATISFIED | e2e en verde + guard sin cache confirmado por lectura de código. |
| INFRA-01 | 01-01 | NestJS modular + Prisma 7 cjs + TS 5.9.x pineado | ✓ SATISFIED | `npm run build` verde (frontend+backend) ejecutado independientemente; `npm -w backend run test` → 12/12. |
| INFRA-02 | 01-01, 01-06 | Deploy Railway con 2 roles de Postgres, secretos en env | ✓ SATISFIED | Verificado en producción: `fava_app` sin BYPASSRLS/SUPERUSER, `DATABASE_URL` del runtime apunta al rol de app (no al owner), migraciones en pre-deploy (`railway.toml`). |
| INFRA-03 | 01-05 | Frontend con cliente tipado + MSAL, mocks retirados pantalla por pantalla | ✓ SATISFIED | `lib/api/client.ts` y `lib/auth/msal.ts` leídos, código real (no stub); mocks de sesión fuera de `state.tsx`, resto de mocks documentado como deferred a propósito (Fase 2+). |

**Sin requisitos huérfanos:** los 7 IDs de la fase (AUTH-01/02/03/04, INFRA-01/02/03) están declarados en el frontmatter de algún plan y todos tienen evidencia arriba.

### Anti-Patterns Found

Ninguno. `grep` de `TODO|FIXME|XXX|HACK` sobre `backend/src` y `frontend/src` (excluyendo código generado) no devuelve resultados. No se encontraron handlers vacíos, `return null` sospechosos ni endpoints con "not implemented".

### Verificación independiente realizada (no solo lectura de SUMMARY)

- `npm -w backend run test` → **12/12** unit, ejecutado en esta verificación.
- `npm -w backend run test:e2e` contra Postgres local real → **7 suites / 53 tests**, ejecutado en esta verificación (coincide con lo declarado en 01-07-SUMMARY).
- `npm run build` en la raíz → verde (frontend 763 módulos + `redirect.html` sin script inline; backend `nest build` + `prisma generate`).
- `psql` directo contra Postgres **local**: `fava_app` (`rolsuper=f`, `rolbypassrls=f`), `relrowsecurity`/`relforcerowsecurity` = true en ambas tablas.
- `psql` directo contra Postgres de **producción** (proxy público de Railway, con credenciales obtenidas vía `railway variables`): mismos resultados — `fava_app` sin bypass/superuser, RLS forzado en ambas tablas.
- `curl` directo contra `https://techportalfavalat-production.up.railway.app`: `/health`→200, `/`→200 (sirve `index.html` con los bundles reales), `/api/me`→401 sin token, `/redirect.html`→200 sin cabecera `cross-origin-opener-policy`.
- `curl` contra `/api/dev-auth/login`: GET→404 (no existe como ruta GET), POST con body vacío→401 (existe y valida) — confirma que `DEV_AUTH_ENABLED=true` está activo en producción, no solo documentado.
- `railway variables --service techportalfava.lat`: confirma `DATABASE_URL` del runtime apunta a `fava_app`, y confirma que `ENTRA_TENANT_ID`/`ENTRA_API_CLIENT_ID`/`VITE_ENTRA_SPA_CLIENT_ID`/`VITE_ENTRA_TENANT_ID` son el literal `"placeholder-sin-tenant"` — evidencia directa y no ambigua del gap de AUTH-01.
- `git diff 7ec773e..HEAD -- .../entra.guard.ts` → 0 líneas, confirmando independientemente que el login de desarrollo no tocó el guard de producción.

### Human Verification Required

No se listan items de verificación humana de UI/UX pendientes de decisión — lo que falta no es "probar algo ya construido", es una precondición externa (tenant de Entra) que bloquea dos checkpoints ya definidos en los propios planes:

1. **01-04 Task 2** (checkpoint:human-action) — crear los 2 app registrations en un tenant real de Entra siguiendo `docs/ENTRA-SETUP.md` y entregar los 4 valores.
2. **01-06 Task 3** (checkpoint:human-verify) — checklist de las 3 cuentas (invitada / no invitada / desactivada) contra la URL pública, con consola del navegador abierta.

Ambos están descritos en detalle en sus PLAN.md respectivos y no requieren replanificación — solo ejecución, una vez exista el tenant.

### Gaps Summary

La fase construyó, con solidez verificable de forma independiente, **toda la infraestructura de identidad y aislamiento**: NestJS 11 + Prisma 7 + dos roles de Postgres reproducibles (INFRA-01/02), RLS forzado en la base de datos y confirmado tanto en local como en producción con consultas directas a `pg_roles`/`pg_class` (AUTH-03), RBAC con las reglas de escalada y anti-lockout probadas (AUTH-02), desactivación sin cache (AUTH-04), y un cliente frontend con MSAL real y tipado (INFRA-03). La app está desplegada, sirve tráfico real, y el smoke 4/4 se reprodujo aquí de forma independiente.

El único gap es exactamente el que el propio equipo ya documentó con honestidad en `REQUIREMENTS.md`: **AUTH-01 no está cerrado contra Microsoft real** porque no existe un tenant de Entra ID que lo permita — ni del desarrollador (lo que aparece en el portal es el tenant de sistema "Microsoft Services", sin directorio) ni de FAVA todavía. El equipo construyó un login de desarrollo (`DEV_AUTH_ENABLED`) que es notablemente disciplinado como puente temporal — el `EntraGuard` de producción tiene **0 líneas de diff**, verificado de forma independiente en este reporte — pero sigue siendo, por diseño y admitido en la documentación, una contraseña compartida: lo opuesto de lo que AUTH-01 promete. Esto también hace fallar literalmente el criterio de éxito #1 del roadmap ("hace login con Microsoft").

Esto no es una carencia de esfuerzo ni un artefacto a medio construir: es una dependencia externa (cuenta Azure verificable con tarjeta, tenant de FAVA) fuera del control del código. Cerrarlo requiere ejecutar los dos checkpoints ya escritos (01-04 y 01-06 Task 3) en cuanto exista el tenant, y después el cutover de dos pasos ya documentado en `docs/ENV.md` (apagar las variables de dev-auth + limpiar los `entra_oid` con prefijo `dev:`).

---

*Verified: 2026-07-25*
*Verifier: Claude (gsd-verifier)*
