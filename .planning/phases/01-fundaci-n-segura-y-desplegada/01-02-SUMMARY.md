---
phase: 01-fundaci-n-segura-y-desplegada
plan: 02
subsystem: seguridad-datos
tags: [postgres, rls, prisma, nestjs, interceptor, async-local-storage, jest, e2e, concurrencia]

# Dependency graph
requires: ["01-01"]
provides:
  - "Migracion SQL versionada con ENABLE + FORCE ROW LEVEL SECURITY y politicas de_self / wn_self sobre daily_entries y weekly_notes"
  - "RlsInterceptor real: una $transaction interactiva por peticion autenticada, 3 GUCs con set_config(..., TRUE) y als.run(tx)"
  - "Prueba ejecutable de AUTH-03 en local: 13 casos de aislamiento contra el rol fava_app (NOBYPASSRLS)"
  - "Prototipo del criterio 5: transicion multi-tabla + 200 transacciones concurrentes sobre un pool de 10, sin P2028 ni fuga de contexto"
  - "PrismaService.base / .client devuelven un cliente con delegados de modelo utilizables (bug de Proxy corregido)"
affects: [01-03-auth, 01-06-deploy, fase-03-bitacora, fase-04-notas, fase-06-migracion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Politicas RLS en migraciones SQL escritas a mano e idempotentes (DROP POLICY IF EXISTS): Prisma no las genera ni las preserva"
    - "Contexto = 3 GUCs de sesion local (app.user_id / app.technician_id / app.is_admin), nunca un rol de texto que la politica tenga que parsear"
    - "NULLIF(current_setting(x, TRUE), '')::uuid: el OR de una politica no cortocircuita, el cast del admin sin technician_id revienta sin esto"
    - "Los tests afirman el SQLSTATE (42501), no el texto del error: Postgres traduce los mensajes al idioma del cluster"
    - "El e2e ejercita el interceptor real con un ExecutionContext minimo en vez de reimplementar el patron: si el interceptor cambia, el test se entera"

key-files:
  created:
    - fava-control-tecnico/backend/prisma/migrations/20260725221504_rls/migration.sql
    - fava-control-tecnico/backend/test/rls-isolation.e2e-spec.ts
    - fava-control-tecnico/backend/test/rls-transaction.e2e-spec.ts
  modified:
    - fava-control-tecnico/backend/src/common/prisma/rls.interceptor.ts
    - fava-control-tecnico/backend/src/common/prisma/prisma.service.ts

key-decisions:
  - "Sin WITH CHECK explicito en las politicas: en FOR ALL, Postgres reutiliza USING como WITH CHECK, y el test demuestra que insertar a nombre de otro tecnico ya devuelve 42501"
  - "users y access_requests sin politica a proposito: el guard busca por entra_oid ANTES de que exista contexto RLS, una politica ahi bloquearia el login de todos"
  - "El spike usa new PrismaService() + RlsInterceptor reales en vez de un cliente de test con transactionOptions copiados: lo que se mide es el codigo que corre en produccion"
  - "La prueba de fuga de GUC se hace con 30 sondas en paralelo sobre un pool de 10, no con una sola consulta: una sola toca una conexion y no prueba nada"

patterns-established:
  - "Cada suite de RLS lleva su control anti-mentira: pg_class (relrowsecurity + relforcerowsecurity), current_user = fava_app y un conteo hecho por el owner"
  - "Antes de dar por buena una suite de seguridad se verifica en rojo rompiendo la propiedad (RLS apagado / set_config con is_local = FALSE)"

requirements-completed: [AUTH-03]

# Metrics
duration: 15min
completed: 2026-07-25
---

# Phase 1 Plan 02: RLS real, transaccion-por-peticion y el spike de concurrencia Summary

**Aislamiento por tecnico impuesto por Postgres (ENABLE + FORCE RLS con politicas `FOR ALL TO fava_app`) y consumido por un interceptor que abre una transaccion por peticion con `set_config(..., TRUE)`; 19 casos e2e conectados como `fava_app` lo demuestran, incluidas 200 transiciones multi-tabla concurrentes sobre un pool de 10 sin un solo P2028.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-25T22:14:23Z
- **Completed:** 2026-07-25T22:29:25Z
- **Tasks:** 3 de 3
- **Files modified:** 5 (3 creados, 2 modificados)

## Accomplishments

- **AUTH-03 cerrado en local, con el rol real.** Los 13 casos de `rls-isolation` corren conectados como `fava_app` (NOBYPASSRLS, no dueno). Cross-read = 0 filas, cross-update = 0 filas, cross-delete = 0 filas, e insertar una fila a nombre de otro tecnico devuelve `42501` sin que ninguna capa de aplicacion intervenga.
- **El caso admin no revienta.** `is_admin='on'` con `technician_id=''` ve las 8 filas: es la prueba directa del `NULLIF(..., '')::uuid` del Pitfall 3, el fallo que aparece cuando el planificador decide evaluar primero la segunda rama del `OR`.
- **Las suites no pueden pasar con RLS apagado, y esta comprobado empiricamente:** con `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` caen 9 de los 13 casos. La asercion sobre `pg_class` (`relrowsecurity` y `relforcerowsecurity` en true para las dos tablas) es la que cierra esa puerta.
- **El riesgo tecnico declarado en STATE.md queda medido, no supuesto.** 200 transiciones multi-tabla (nota semanal + 7 entradas diarias + lectura de verificacion) en lotes de 20 promesas sobre un pool de 10: cero rechazos, cero `P2028`, cero `Timed out fetching a new connection`. El patron esta validado para el approve de la Fase 4.
- **Cero fuga de contexto entre peticiones.** Cada transaccion comprueba desde dentro que no ve ni una fila ajena; despues de la tormenta, 30 sondas en paralelo confirman que ninguna conexion del pool conserva las GUCs. Verificado en rojo: cambiando el tercer argumento de `set_config` a `FALSE` cae exactamente ese test y ningun otro.
- **Un bug que habria matado al Plan 01-03 en su primera peticion, encontrado y arreglado** (ver Deviations): `prisma.base.user` era `undefined` en tiempo de ejecucion con TypeScript contento.

## Task Commits

1. **Task 1: Migracion RLS e interceptor tx-por-peticion** — `b24d713` (feat)
2. **Task 2 (TDD): aislamiento con el rol real** — `e22b130` (test) · RED verificado apagando RLS en el cluster
3. **Task 3 (TDD): spike multi-tabla + concurrencia** — `16b24bf` (fix, PrismaService) + `25e9fe0` (test) · RED verificado con `set_config(..., FALSE)`

## Files Created/Modified

- `backend/prisma/migrations/20260725221504_rls/migration.sql` — `ENABLE` + `FORCE ROW LEVEL SECURITY` y politicas `de_self` / `wn_self` (`FOR ALL TO fava_app`), idempotentes; el razonamiento de por que `users` y `access_requests` quedan fuera esta en el propio SQL
- `backend/src/common/prisma/rls.interceptor.ts` — sustituye el esqueleto: salida temprana sin `req.user`, `$transaction` + `set_config` de las 3 GUCs + `als.run(tx, ...)`, con la regla de «nada de I/O externo dentro de la transaccion» escrita al lado
- `backend/src/common/prisma/prisma.service.ts` — los getters `base` y `client` devuelven el Proxy de Prisma, no el objeto envuelto
- `backend/test/rls-isolation.e2e-spec.ts` — 13 casos (172 lineas): daily_entries, weekly_notes, admin, sin contexto, y el bloque de control anti-mentira
- `backend/test/rls-transaction.e2e-spec.ts` — 6 casos (220 lineas): forma de la transaccion, transicion multi-tabla, tormenta de 200, fuga de GUC e integridad cruzada por sufijo de tecnico

## Decisions Made

Ver `key-decisions` en el frontmatter. La que mas afecta a lo que viene:

1. **`users` y `access_requests` no llevan politica RLS en esta fase.** El guard de 01-03 busca al usuario por `entra_oid` con `PrismaService.base`, fuera de la transaccion y antes de que exista contexto: una politica sobre `users` dejaria a todo el mundo sin login. Su aislamiento es de capa de servicio (`@Roles`) hasta que alguna fase futura tenga un lector con contexto ya fijado.
2. **La transicion multi-tabla toca primero la nota semanal.** Bloquear la fila raiz del agregado serializa las transacciones del mismo tecnico y elimina de raiz el riesgo de deadlock entre `updateMany` concurrentes sobre las mismas 7 entradas. Es el orden que debe seguir el approve de la Fase 4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `PrismaService.base` y `.client` devolvian un cliente sin delegados de modelo**
- **Found during:** Task 3
- **Issue:** `prisma.base.dailyEntry.count()` fallaba con `Cannot read properties of undefined (reading 'count')`. Prisma 7 envuelve la instancia en un `Proxy` y los delegados de modelo (`.user`, `.dailyEntry`) solo existen a traves de el; dentro de un getter, `this` es el objeto envuelto. TypeScript no ve la diferencia, asi que el codigo compila y explota en tiempo de ejecucion. El alcance real es mayor que este plan: el lookup por `entra_oid` del guard de 01-03 (`prisma.base.user.findUnique`) habria muerto en la primera peticion autenticada, y cualquier servicio que use `prisma.client` fuera de una peticion HTTP, igual.
- **Fix:** El constructor guarda el Proxy (ahi `this` si lo es) y los dos getters lo devuelven. 5 lineas.
- **Files modified:** `backend/src/common/prisma/prisma.service.ts`
- **Verification:** Reproducido y confirmado con un probe (`svc.base.dailyEntry` = `undefined` antes, `object` despues); el test «sin req.user» de la suite nueva ejecuta ahora `prisma.client.dailyEntry.count()` y es la regresion permanente.
- **Commit:** `16b24bf`

**2. [Rule 1 - Bug] La suite afirmaba sobre el texto del error de Postgres, que viene traducido**
- **Found during:** Task 2
- **Issue:** El caso de insert cruzado esperaba `/row-level security/i`; el cluster responde en espanol («el nuevo registro viola la politica de seguridad de registros»). El test fallaba pese a que el comportamiento era exactamente el correcto.
- **Fix:** Se afirma el SQLSTATE `42501`, que no depende del idioma del cluster.
- **Files modified:** `backend/test/rls-isolation.e2e-spec.ts`
- **Commit:** `e22b130`

**3. [Rule 3 - Blocking] `pg_current_xact_id()` devuelve `xid8` y el cliente no lo sabe deserializar**
- **Found during:** Task 3
- **Issue:** `Failed to deserialize column of type 'xid8'` al comprobar que las dos consultas de una peticion comparten transaccion.
- **Fix:** `pg_current_xact_id()::text`.
- **Files modified:** `backend/test/rls-transaction.e2e-spec.ts`
- **Commit:** `25e9fe0`

### Desviaciones deliberadas respecto al texto del plan

- **El spike usa `new PrismaService()` en vez del `appClient` del helper.** El plan pedia correr las transacciones «con los transactionOptions heredados del cliente (timeout 10s)», pero `test/helpers/db.ts` crea un `PrismaClient` pelado, sin `transactionOptions` ni `max`. Anadirselos habria tocado un archivo compartido con el Plan 01-03, que corre en paralelo. Instanciar el `PrismaService` real es ademas mas fiel: el objeto medido es el que corre en produccion (pool 10, timeout 10 s / maxWait 5 s), y las peticiones pasan por el `RlsInterceptor` de verdad en lugar de por una reimplementacion del patron.
- **Sin `WITH CHECK` en las politicas.** Redundante: en `FOR ALL`, Postgres reutiliza `USING`. El comportamiento no se da por supuesto — hay un caso que lo verifica.

### Simplificaciones deliberadas

- **Ni `GRANT` ni `REVOKE` en la migracion.** El `ALTER DEFAULT PRIVILEGES` del bootstrap del Plan 01-01 ya deja a `fava_app` con los privilegios de tabla, y `audit_log` (el `REVOKE` del research) no existe todavia.
- **El helper de test es una funcion de 6 lineas por rol (`comoTecnico` / `comoAdmin`), no una fixture.** Es el mismo `$transaction` + `set_config` que hace el interceptor, escrito donde se lee.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking) + 2 desviaciones deliberadas + 2 simplificaciones
**Impact on plan:** Ninguna reduce el alcance ni ablanda las pruebas. El bug del Proxy de Prisma es el hallazgo importante: no lo buscaba este plan y bloqueaba al 01-03.

## Issues Encountered

- **`truncateAll()` sigue borrando al Super Admin del seed.** Tras estas dos suites se repuso con `npm -w backend run db:seed` (verificado: 1 usuario en `users`).
- **Correr `npm -w backend run test:e2e` sin filtro mientras el Plan 01-03 escribe sus propios specs da fallos fantasma.** Repetida la ejecucion con el arbol estable: **35 tests, 5 suites, todo verde** (las 3 suites de 01-01/01-02 y las 2 de 01-03).
- **La verificacion de idempotencia de la migracion se hizo re-aplicando el `.sql` con `psql -v ON_ERROR_STOP=1`**, ademas de `migrate deploy` y de `migrate dev` (que la replica en la shadow database). `prisma migrate deploy` por si solo no reejecuta nada, asi que no demuestra idempotencia.

## User Setup Required

None. Todo corre contra el cluster local del puerto 55432 documentado en el Plan 01-01.

## Next Phase Readiness

**Para el Plan 01-03 (auth), ahora mismo:**
- `prisma.base.user.findUnique(...)` funciona (antes no). Si su rama tenia un workaround para el `undefined`, se puede quitar.
- El interceptor espera en `req.user`: `{ id: string; technicianId?: string | null; roles: string[] }`. `roles` que contenga `'A'` o `'S'` produce `app.is_admin = 'on'`.
- El guard debe seguir usando `PrismaService.base` (fuera de la transaccion): `users` no tiene politica y el lookup ocurre antes de que exista contexto.

**Para las Fases 3-4:**
- El patron de transicion multi-tabla esta validado bajo concurrencia. Orden recomendado: bloquear primero la nota semanal, despues las entradas.
- Toda tabla nueva con `technician_id` necesita su propia migracion de `ENABLE` + `FORCE` + politica: RLS no se hereda y Prisma no la genera.
- Regla de oro heredada: nada de I/O externo (HTTP, colas, PDF) dentro del handler de una peticion autenticada; retiene una conexion de las 10 durante toda la transaccion.

**Concerns:**
- La prueba desplegada de AUTH-03 sigue pendiente del Plan 01-06: hay que confirmar que Railway no entrega una `DATABASE_URL` de superusuario al runtime, porque un superusuario se salta RLS **incluso con FORCE** y sin ningun sintoma.
- La tormenta se midio en local (latencia ~0). En Railway, con la BD en otro host, cada transaccion retiene su conexion mas tiempo; el smoke del Plan 01-06 deberia repetir una version reducida.

## Self-Check: PASSED

- 5/5 archivos declarados existen en disco.
- 4/4 commits de tarea existen en el historial (`b24d713`, `e22b130`, `16b24bf`, `25e9fe0`).
- `npm -w backend run build` compila.
- `npm -w backend run test:e2e` → 35 passed, 5 suites (incluye las 13 + 6 de este plan).
- `pg_class`: `relrowsecurity` y `relforcerowsecurity` = true en `daily_entries` y `weekly_notes`; `pg_policies` muestra `de_self` y `wn_self` para `{fava_app}`.
- Super Admin repuesto tras las suites (1 fila en `users`).

---
*Phase: 01-fundaci-n-segura-y-desplegada*
*Completed: 2026-07-25*
