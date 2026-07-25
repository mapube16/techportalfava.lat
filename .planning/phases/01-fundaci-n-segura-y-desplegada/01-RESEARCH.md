# Phase 1: Fundación segura y desplegada — Research

**Researched:** 2026-07-25
**Domain:** Entra ID (SPA + API) · NestJS 11 + Prisma 7 + Postgres RLS · deploy Railway · cutover del frontend existente
**Confidence:** HIGH en versiones y en las reglas de Entra/RLS/Railway (registro npm en vivo + docs oficiales). MEDIUM en dos puntos marcados abajo (CSP de helmet vs MSAL, pool de Prisma 7 con adapter).

> Convención: encabezados en inglés (plantilla GSD), contenido en español — igual que `research/PITFALLS.md`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Acceso de usuarios nuevos**
- Usuario con cuenta Microsoft válida pero no invitado → pantalla «sin acceso»: muestra el nombre de su cuenta MS, «tu cuenta no está habilitada», botón salir. NO auto-registro — solo Admin da altas (matriz §6).
- La pantalla incluye botón **«solicitar acceso»**: crea una solicitud que los Admins ven en la pantalla de Usuarios (lista/badge de solicitudes pendientes). El centro de notificaciones completo es Fase 7 — en Fase 1 la solicitud aterriza en la pantalla de Usuarios, no en un feed.
- Vinculación Entra↔app: el Admin invita con email corporativo; el primer login cuyo email coincida exactamente se vincula y **se guarda el OID de Entra como identidad definitiva** (el email pasa a ser dato informativo; cambios de email no rompen la cuenta).
- Usuario desactivado que intenta entrar → mensaje específico «tu cuenta fue desactivada» (app interna, claridad sobre opacidad). Distinto del mensaje de no-invitado.

**Boundary de la fase**
Login Microsoft Entra real (tenant dev, swap a FAVA por env), RBAC 3 roles + RLS en Postgres, scaffold NestJS modular, primer deploy en Railway, y frontend cableado en Login/Layout (usuario y rol reales vía cliente API tipado + MSAL React). Requisitos: AUTH-01..04, INFRA-01..03. Los CRUD de dominio, bitácora, notas, KPIs son fases posteriores.

**Ideas específicas**
- La pantalla de login ya diseñada (`Login.tsx`) se conserva visualmente; el botón «Iniciar sesión con Microsoft» pasa de stub a MSAL real.
- El riesgo técnico señalado en STATE.md se honra en esta fase: prototipar la transición multi-tabla con RLS + `$transaction` ANTES de construir encima (criterio de éxito 5 del roadmap).

### Claude's Discretion

Áreas no discutidas — defaults razonables, ajustables durante planning sin volver al usuario:

- **Selector de rol T·A·S**: en la app real el switcher solo aparece para usuarios con más de un rol, limitado a SUS roles (Ivan con T+A+S lo conserva completo; un técnico raso no lo ve). El header deja de ser un toggle de demo.
- **URL pública**: subdominio de Railway ahora; dominio propio después (solo env vars + redirect URIs de Entra). La app es públicamente alcanzable pero solo pasa quien autentica en Entra y está invitado.
- **Semilla día 1**: la cuenta del dev en el tenant dev entra como Super Admin (seed). Datos demo de dominio llegan en fases posteriores.
- Detalles técnicos ya fijados por research/STATE (no re-decidir): `jose` para validación, roles desde BD no desde claims, transacción-por-petición con `set_config(..., true)`, dos roles de Postgres, TS 5.9.x pineado, Prisma 7 `cjs`.

### Deferred Ideas (OUT OF SCOPE)

- Notificación in-app real de solicitudes de acceso → Fase 7 (RT-02); en Fase 1 solo lista en Usuarios.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Soporte de esta investigación |
|----|-------------|-------------------------------|
| **AUTH-01** | Login con Microsoft Entra ID (SSO); tenant dev → tenant FAVA solo por env vars | § Entra ID — dos app registrations, `requestedAccessTokenVersion: 2`; § MSAL en el frontend (msal-browser v5 + redirect bridge); § Env vars — 5 variables, cero constantes; Code Examples 1-3 |
| **AUTH-02** | RBAC 3 roles en BD y asignables en la app; solo Super Admin asigna Admin | § Pattern 4 (roles en BD, identidad en el token); § Pattern 6 (regla de escalada + guard anti-lockout); Pitfall 6 |
| **AUTH-03** | RLS en Postgres: un técnico no lee registros de otro ni con bug de código (rol sin BYPASSRLS + FORCE RLS, test e2e) | § Pattern 2 (dos roles + FORCE + `ALTER DEFAULT PRIVILEGES`); § Pattern 3 (tx-por-petición + ALS); Pitfalls 3, 4, 5; Code Examples 4-6; § Validation Architecture |
| **AUTH-04** | Usuario desactivado pierde acceso de inmediato | § Pattern 5 (lookup por petición **sin cache**); § `/api/me` como unión discriminada; Pitfall 7 (CAE fuera de alcance) |
| **INFRA-01** | NestJS monolito modular + Prisma 7 (cjs) + PostgreSQL; TS pineado 5.9.x | § Standard Stack; § Recommended Project Structure; § Prisma 7 — configuración exacta |
| **INFRA-02** | Deploy en Railway con dos roles de Postgres y secretos en env vars | § Pattern 1 (servicio único + workspaces); § Railway — configuración verificada; § db-bootstrap idempotente; Pitfall 8 |
| **INFRA-03** | Frontend conectado al API real con cliente tipado + MSAL; mocks se retiran pantalla por pantalla | § Frontend Integration (mapa exacto sobre `state.tsx` / `Login.tsx` / `Layout.tsx`); Pitfall 1 (React 19), Pitfall 2 (COOP/CSP) |
</phase_requirements>

## Summary

Tres cosas cambiaron respecto de lo que asume `research/STACK.md` y hay que decidirlas en planning, no en implementación. **(1) `@azure/msal-react@5` ya no soporta React 18** — Microsoft lo declara explícitamente («MSAL React v5 supports React 19.2.1 or greater. It no longer supports React 16, 17, or 18»), y el frontend existente es React 18.3.1. La salida barata no es subir React: es **no usar `@azure/msal-react` en absoluto** y hablar directo con `@azure/msal-browser@5`, porque `state.tsx` ya es el proveedor central con `login/logout` que `MsalProvider` duplicaría. **(2) MSAL Browser v5 exige una página puente de redirección** (`redirect.html`) por el soporte de COOP — es una entrada extra de Rollup en `vite.config.ts` y un redirect URI distinto en Entra. **(3) Prisma 7 eliminó los parámetros de pool de la URL de conexión**: `connection_limit` ya no existe, el pool se configura en el `PrismaPg` adapter (`max`, `connectionTimeoutMillis`). Cualquier plan que copie `?connection_limit=N` de la investigación previa no tendrá efecto.

El resto del terreno está bien cartografiado por `research/` y esta fase sólo lo aterriza. Lo verdaderamente nuevo y de alto riesgo son dos combinaciones que no aparecen en ningún tutorial: **helmet + MSAL** (los defaults de helmet ponen `Cross-Origin-Opener-Policy: same-origin`, que rompe exactamente el puente de redirección, y su CSP por defecto `default-src 'self'` bloquea las llamadas de MSAL a `login.microsoftonline.com`), y **Prisma 7 + RLS + transacción interactiva** (el riesgo técnico ya declarado en STATE.md). Ambos se resuelven con pocas líneas, pero sólo si se planifican; descubrirlos en depuración cuesta un día cada uno.

La forma del despliegue queda decidida: **un servicio en Railway**, con npm workspaces en `fava-control-tecnico/` y NestJS sirviendo el build de Vite. Elimina CORS, preflight, un segundo despliegue y la coordinación de dos dominios en los redirect URIs de Entra — y la restricción de «migrar de cuenta personal a empresa sin arqueología» se cumple con `railway.toml` versionado + un script `db:bootstrap` idempotente + una lista cerrada de 8 variables de entorno.

**Primary recommendation:** Construir un slice vertical desplegado antes que cualquier lógica de dominio: `redirect.html` → login MSAL real → `GET /api/me` con validación `jose` → lookup por `oid` sin cache → interceptor de transacción con `set_config(..., true)` → dos roles de Postgres con `FORCE ROW LEVEL SECURITY` → test e2e que se conecta como `fava_app` y cuenta filas. Nada más entra en esta fase hasta que esa cadena funcione **en Railway**, no en local.

## Standard Stack

### Core (backend nuevo — `fava-control-tecnico/backend/`)

| Librería | Versión | Propósito | Por qué es la estándar |
|----------|---------|-----------|------------------------|
| Node.js | **22.x LTS** | Runtime | Intersección obligada: Prisma 7 ≥20.19, NestJS 11 ≥20, y Puppeteer (Fase 5) declara `engines.node ">=22.12.0"`. Pinear ya en Fase 1 (`.nvmrc` + `engines`) evita un cambio de runtime a mitad de proyecto. |
| TypeScript | **5.9.3** (exacto, sin `^`) | Lenguaje | `npm view typescript version` devuelve **7.0.2** hoy: un `npm i -D typescript` ingenuo instala el compilador Go, que nunca se comprometió con `emitDecoratorMetadata`. `@nestjs/cli@11.0.24` sigue declarando `typescript: 5.9.3` como dependencia propia. |
| `@nestjs/core` · `common` · `platform-express` | **11.1.28** | Framework | Verificado en el registro. `platform-express@11.1.28` trae **`express: 5.2.1`** — Express 5, no 4; importa para middlewares y para el peer de `serve-static`. |
| `prisma` · `@prisma/client` · `@prisma/adapter-pg` | **7.9.0** (las tres en lockstep) | Datos + migraciones | Adapter obligatorio en v7 (el motor Rust desapareció). Desfase de versión entre client y adapter = errores de runtime confusos. |
| `@nestjs/serve-static` | **5.0.5** | Servir el build de Vite | Peers verificados: `@nestjs/common ^11.0.2`, **`express ^5.0.1`** ✓ compatible con Nest 11. Habilita el servicio único. |
| `jose` | **6.2.4** | Validar el JWT de Entra | Cero dependencias. `createRemoteJWKSet` resuelve fetch, selección por `kid`, cache, rotación y cooldown anti-abuso en una llamada; `jwtVerify` valida firma + `iss` + `aud` + `exp`/`nbf` en otra. Sustituye a `passport` + `@nestjs/passport` + `passport-jwt` + `jwks-rsa`. |
| `@nestjs/config` + `zod` | 4.0.4 / **4.4.3** | Env con esquema | El arranque debe fallar si falta `ENTRA_TENANT_ID`. Requisito explícito de Fase 8, gratis si se hace aquí. |
| `helmet` | **8.3.0** | Cabeceras de seguridad | ⚠️ Sus defaults chocan con MSAL — ver Pitfall 2. No se instala «y ya». |
| `@nestjs/throttler` | 6.5.0 | Rate limiting | El endpoint público de «solicitar acceso» es el único escribible por cualquier miembro del tenant: necesita límite. |
| `@nestjs/terminus` | 11.1.1 | `/health` | Sin healthcheck, Railway no distingue un contenedor arrancando de uno roto. |
| `nestjs-pino` + `pino` | 4.6.1 / 10.3.1 | Logs estructurados | Railway ingiere JSON. Configurar **redacción de `authorization`** desde el primer día. |

### Frontend (añadidos a `fava-control-tecnico/frontend/`)

| Librería | Versión | Propósito | Cuándo |
|----------|---------|-----------|--------|
| `@azure/msal-browser` | **5.17.1** | Login + `acquireTokenSilent` | **Única dependencia de auth.** Framework-agnóstica: no impone versión de React. |
| ~~`@azure/msal-react`~~ | — | — | **NO instalar.** Ver la tabla de alternativas: exige React 19.2.1+, y su valor (contexto + hooks) ya lo cubre `state.tsx`. |

**Nada más.** Nada de TanStack Query en Fase 1: la única llamada de servidor es `GET /api/me`, y meter una capa de estado de servidor para un objeto que se pide una vez al montar es sobre-ingeniería. Query entra en Fase 2, cuando hay 6 pantallas con listas.

### Alternatives Considered

| En vez de | Se podría usar | Trade-off |
|-----------|----------------|-----------|
| `msal-browser@5` sin `msal-react` | `msal-browser@4.30.0` (dist-tag **`lts`**) + `msal-react@3.0.29` | React 18 sí soportado y **no requiere el puente de redirección** — es la vía de escape si el puente da guerra. Coste: la rama v4 «transitioned out of active support», sólo bugfixes críticos, sin features nuevas. Verificado: `npm view @azure/msal-browser dist-tags` → `lts: 4.30.0`, `latest: 5.17.1`. |
| `msal-browser@5` sin `msal-react` | Subir el frontend a React 19.2.1 + `msal-react@5` | Nivo (Fase 7) soporta React 19, así que no bloquea nada más adelante. Coste: upgrade de React fuera del boundary de esta fase, con 11 pantallas a re-verificar. **No hacerlo ahora**; si Fase 7 lo pide por otro motivo, `msal-react` puede entrar entonces. |
| Dos app registrations (SPA + API) | Una sola con plataforma SPA + «Expose an API» | Funciona: el `aud` es el propio client id (así lo sugiere `research/ARCHITECTURE.md` §Pattern 4). Coste: se pierde la frontera cliente↔recurso y la lista de «authorized client applications» deja de significar algo. Microsoft recomienda separarlas. **Recomendación: dos.** |
| Tipos de API escritos a mano | `@nestjs/swagger` + `openapi-typescript@7.13.0` | En Fase 1 el contrato son 4 interfaces (`Me`, `AccessRequest`, `ApiError`, `Role`). Montar la tubería de codegen para eso es más código que el que genera. **Escribirlos a mano ahora; adoptar codegen en Fase 2** cuando haya ~20 endpoints. Sí dejar `@nestjs/swagger` instalado y decorando los DTOs, para que Fase 2 sea sólo añadir el script. |
| Jest (default del CLI de Nest) | Vitest 4.x | Vitest exige `unplugin-swc` para que funcionen los decoradores de Nest — fricción real a cambio de compartir runner con un frontend que hoy **no tiene tests**. **Usar Jest**, que el `nest new` ya deja configurado. |

**Installation:**

```bash
# ── fava-control-tecnico/backend/ ──────────────────────────
npm install @nestjs/core@11 @nestjs/common@11 @nestjs/platform-express@11 \
            @nestjs/serve-static reflect-metadata rxjs
npm install @prisma/client@7.9.0 @prisma/adapter-pg@7.9.0 pg
npm install jose
npm install @nestjs/config zod nestjs-zod helmet @nestjs/throttler \
            @nestjs/terminus @nestjs/swagger nestjs-pino pino pino-http
npm install -D prisma@7.9.0 @nestjs/cli@11 typescript@5.9.3 \
               @types/node@22 @types/pg @types/express jest supertest @nestjs/testing

# ── fava-control-tecnico/frontend/ (un solo añadido) ───────
npm install @azure/msal-browser@5.17.1
```

⚠️ `"typescript": "5.9.3"` **sin caret** en ambos `package.json`. El frontend hoy tiene `"typescript": "^5.5.3"`: con TS 7 publicado como `latest`, un `npm install` limpio en una máquina nueva puede resolver algo que no compila. Pinear los dos.

## Architecture Patterns

### Recommended Project Structure

```
fava-control-tecnico/
├─ package.json                  # NUEVO: workspaces ["backend","frontend"] + build/start
├─ railway.toml                  # NUEVO (ruta ABSOLUTA en Railway: /fava-control-tecnico/railway.toml)
├─ docker-compose.yml            # NUEVO: postgres 17 local con los 2 roles ya creados
├─ backend/                      # NUEVO
│  ├─ prisma/
│  │  ├─ schema.prisma           # users, access_requests + 2 tablas de spike RLS
│  │  ├─ prisma.config.ts        # hogar recomendado de config CLI en v7
│  │  ├─ migrations/
│  │  │  ├─ 0001_init/           # generada por Prisma
│  │  │  └─ 0002_rls/            # SQL A MANO: ENABLE+FORCE RLS, políticas, GRANTs
│  │  └─ seed.ts                 # el dev del tenant dev entra como Super Admin
│  ├─ scripts/
│  │  ├─ db-bootstrap.ts         # idempotente: CREATE ROLE fava_app + DEFAULT PRIVILEGES
│  │  └─ smoke.ts                # verificación post-deploy contra la URL de Railway
│  ├─ src/
│  │  ├─ main.ts                 # helmet condicional, ServeStatic, listen(PORT,'0.0.0.0')
│  │  ├─ app.module.ts
│  │  ├─ config/env.ts           # zod: falla el boot si falta una variable
│  │  ├─ common/
│  │  │  ├─ auth/
│  │  │  │  ├─ jwks.provider.ts       # ← inyectable: tests lo sustituyen por createLocalJWKSet
│  │  │  │  ├─ entra.guard.ts         # verifica token → resuelve usuario → req.user
│  │  │  │  ├─ roles.guard.ts         # @Roles('A','S')
│  │  │  │  ├─ allow-unprovisioned.decorator.ts
│  │  │  │  └─ current-user.decorator.ts
│  │  │  ├─ prisma/
│  │  │  │  ├─ prisma.service.ts      # cliente base + getter que devuelve el tx del ALS
│  │  │  │  └─ rls.interceptor.ts     # abre la tx, set_config(...), guarda en ALS
│  │  │  └─ health/
│  │  └─ modules/
│  │     ├─ me/                       # GET /api/me  (unión discriminada)
│  │     ├─ users/                    # PATCH roles / activo — reglas de escalada
│  │     └─ access-requests/          # POST (unprovisioned) · GET/PATCH (admin)
│  └─ test/
│     ├─ rls-isolation.e2e-spec.ts    # criterio 2 del roadmap
│     ├─ rls-transaction.e2e-spec.ts  # criterio 5: multi-tabla + concurrencia
│     └─ auth.e2e-spec.ts             # criterios 1, 3, 4
└─ frontend/                     # EXISTENTE — sólo se le añaden 3 archivos
   ├─ redirect.html              # NUEVO: puente MSAL v5 (junto a index.html)
   ├─ vite.config.ts             # + rollupOptions.input.redirect
   └─ src/lib/
      ├─ auth/msal.ts            # NUEVO: PublicClientApplication + getToken()
      └─ api/client.ts           # NUEVO: apiFetch tipado + tipos a mano
```

### Pattern 1: Un servicio en Railway, npm workspaces, Nest sirve el build de Vite

**Qué:** un único servicio Railway con Root Directory `/fava-control-tecnico`. Un `package.json` raíz con workspaces construye ambos paquetes con un `npm ci` y arranca el backend, que sirve `frontend/dist` como estático.

**Por qué:** elimina CORS y preflight, un segundo despliegue, un segundo dominio en los redirect URIs de Entra, y la coordinación de versiones entre dos servicios. A ~50 usuarios no hay ningún argumento a favor de separarlos en Fase 1.

**Techo declarado:** el frontend se redespliega con el backend (irrelevante aquí), y cuando llegue Puppeteer en Fase 5 el servicio necesitará un Dockerfile — el cambio será de builder, no de arquitectura.

```json
// fava-control-tecnico/package.json (NUEVO)
{
  "private": true,
  "workspaces": ["backend", "frontend"],
  "engines": { "node": "22.x" },
  "scripts": {
    "build": "npm -w frontend run build && npm -w backend run build",
    "start": "npm -w backend run start:prod",
    "db:bootstrap": "npm -w backend run db:bootstrap"
  }
}
```

```ts
// backend/src/app.module.ts — el estático va DESPUÉS de las rutas /api
ServeStaticModule.forRoot({
  rootPath: join(process.cwd(), 'frontend', 'dist'),  // cwd = raíz del workspace
  exclude: ['/api/{*path}'],                          // Express 5: sintaxis nueva de comodín
});
```

⚠️ Dos trampas concretas: (a) `__dirname` apunta a `backend/dist/...` tras compilar — usar `process.cwd()` y verificar con un `console.log` en el primer deploy; (b) con Express 5 la sintaxis de comodín cambió (`*` ya no vale; es `{*path}`), y todo tutorial anterior a NestJS 11 muestra la vieja.

### Pattern 2: Dos roles de Postgres + `FORCE RLS` + `ALTER DEFAULT PRIVILEGES`

**Qué:** `postgres` (el que da Railway, dueño de las tablas, corre migraciones) y `fava_app` (runtime, `NOBYPASSRLS`, no dueño, sin DDL). Dos URLs: `MIGRATE_DATABASE_URL` y `DATABASE_URL`.

**El detalle que se olvida y rompe el deploy siguiente:** sin `ALTER DEFAULT PRIVILEGES`, cada tabla que cree una migración futura es **invisible** para `fava_app` — la app arranca y falla con `permission denied for table X` justo después de un `migrate deploy` exitoso. Un `GRANT ... ON ALL TABLES` sólo cubre las tablas que existían en ese instante.

```sql
-- scripts/db-bootstrap.ts ejecuta esto como owner. Idempotente: correr N veces = mismo estado.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fava_app') THEN
    CREATE ROLE fava_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
ALTER ROLE fava_app WITH PASSWORD :'app_pw';          -- desde env, nunca en el repo

GRANT CONNECT ON DATABASE :"db"  TO fava_app;
GRANT USAGE   ON SCHEMA   public TO fava_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO fava_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO fava_app;

-- ← LA LÍNEA QUE SALVA EL DEPLOY DE LA FASE 2
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fava_app;
```

Las políticas RLS y el `FORCE` viven en **migraciones SQL versionadas** (`prisma migrate dev --create-only` y editar el `.sql`), no en el bootstrap: Prisma no genera ni preserva políticas, y una migración futura que recree una tabla se las lleva por delante.

### Pattern 3: Transacción-por-petición con `AsyncLocalStorage` (NO la extensión oficial de Prisma)

**Qué:** un interceptor abre **una** `$transaction` interactiva por petición autenticada, ejecuta `set_config(..., true)` con la identidad, guarda el `tx` en `AsyncLocalStorage`, y `PrismaService.client` lo devuelve a todos los servicios.

**Cuándo NO abrir la transacción:** `/health`, los estáticos, y `GET /api/me` / `POST /api/access-requests` cuando el usuario aún no está aprovisionado (no hay identidad que fijar). El interceptor debe salir temprano si `req.user` no existe — si no, o abre una transacción sin contexto RLS, o revienta.

**Por qué no el ejemplo oficial `prisma-client-extensions/row-level-security`:** envuelve *cada query* en su propia batch transaction, y la propia documentación de Prisma advierte que `$transaction()` explícito «puede no funcionar como se espera». La lógica central del producto (Fase 4: `approve` toca nota + 7 entradas + auditoría) son transacciones multi-tabla. Copiar ese patrón es una bomba de tiempo — y `$use` ya no existe en v7 de todos modos.

**Configuración de tiempos y pool (novedad de Prisma 7):**

```ts
// common/prisma/prisma.service.ts
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 10,                       // ← el pool ya NO se configura en la URL en v7
  connectionTimeoutMillis: 5_000,
});

super({
  adapter,
  transactionOptions: { timeout: 10_000, maxWait: 5_000 },  // defaults 5s/2s son cortos
});
```

⚠️ **Verificado en la doc de Prisma 7:** «there are no connection URL parameters for these in Prisma ORM v7». Cualquier `?connection_limit=20` copiado de la investigación previa o de un tutorial de v5/v6 es **silenciosamente ignorado**.

**Regla dura:** nada de I/O externo dentro de la transacción. En Fase 1 no hay ninguno; escribir la regla en el README ahora evita que el render del PDF entre ahí en Fase 5.

### Pattern 4: Dos GUCs booleanos, no un rol de texto

**Qué:** el contexto RLS son exactamente tres variables: `app.user_id`, `app.technician_id`, `app.is_admin`. **No** una lista de roles que la política tenga que parsear.

**Por qué:** Ivan tiene T+A+S. Una política que compare `current_setting('app.role') IN ('A','S')` obliga a elegir *un* rol por petición, y hace que el backend dependa de qué rol tiene activo el switcher del header — que es estado de UI del cliente y por tanto no confiable. Con `app.is_admin` derivado en el servidor de `users.roles`, la política es una comparación y el switcher no puede influir en los privilegios.

**Consecuencia para el switcher T·A·S:** cambiar de rol en el header cambia la navegación y los filtros de consulta, **nunca los permisos**. Un Super Admin en «vista Técnico» sigue teniendo `is_admin = on` en la BD; que sólo vea sus propios días es un `WHERE technician_id = :self` en el servicio, no RLS. Documentarlo: es la clase de atajo que un revisor futuro leerá como bug.

### Pattern 5: Roles en la BD, identidad en el token, **sin cache**

**Qué:** el token de Entra prueba *quién* es (`oid`). El rol y el estado activo salen de `users` en cada petición.

**Por qué sin cache:** el criterio 3 del roadmap dice «le corta el acceso en su **siguiente petición**». Un cache de 60 s (como sugería `research/ARCHITECTURE.md`) lo incumple por definición. Un `SELECT` por `entra_oid` con índice único, a ~50 usuarios, es ruido estadístico frente a la validación criptográfica del JWT que ya ocurre en la misma petición. **La opción perezosa y la correcta coinciden: no hay cache que invalidar.**

`GET /api/me` es el único endpoint marcado `@AllowUnprovisioned()` y devuelve una unión discriminada, porque las tres pantallas del CONTEXT necesitan distinguirse:

```ts
type MeResponse =
  | { status: 'ok';           user: { id, displayName, email, roles: Role[], technicianId: string | null } }
  | { status: 'not_invited';  entra: { displayName, email }, requestPending: boolean }
  | { status: 'deactivated';  entra: { displayName, email } };
```

Todo lo demás con un `oid` desconocido o inactivo responde **403**. Sin esto, cualquier miembro del tenant de FAVA entra a la app.

### Pattern 6: La regla de escalada de rol vive en un solo sitio

`PATCH /api/users/:id/roles` es accesible a `A` y `S`, pero:

```ts
// users.service.ts — root cause, no un @Roles por endpoint
const escalates = next.some(r => r === 'A' || r === 'S');
if (escalates && !actor.roles.includes('S'))
  throw new ForbiddenException('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');   // criterio 4
if (target.id === actor.id && !next.includes('S') && actor.roles.includes('S'))
  throw new BadRequestException('NO_PUEDES_QUITARTE_SUPER_ADMIN'); // anti-lockout
if (removing 'S' && (await countActiveSuperAdmins()) === 1)
  throw new BadRequestException('DEBE_QUEDAR_UN_SUPER_ADMIN');     // anti-lockout
```

Los dos guards anti-lockout no están en los requisitos y son 4 líneas: sin ellos, un Super Admin puede dejar el tenant dev sin nadie que pueda asignar roles, y la recuperación es SQL a mano contra producción.

### Anti-Patterns to Avoid

- **`SET app.x = ...` (sin `LOCAL`) sobre una conexión del pool** — la variable sobrevive al `release()` y la siguiente petición, de otro técnico, hereda el contexto. Intermitente, invisible en dev con un usuario. Siempre `set_config(clave, valor, true)`.
- **Correr el runtime con la `DATABASE_URL` que Railway entrega tal cual** — es el superusuario `postgres`, dueño de todas las tablas: RLS queda escrito y sin efecto, y **no hay ningún síntoma**.
- **Cachear el lookup de usuario** — incumple AUTH-04. Ver Pattern 5.
- **Confiar en el header/estado del rol activo del cliente** para autorizar — ver Pattern 4.
- **Un `@Roles('S')` en el endpoint de roles** — impediría que un Admin asigne el rol Técnico, que sí puede (matriz §6). La regla es condicional, no de endpoint.
- **Auto-provisionar al primer login** — CONTEXT lo prohíbe explícitamente: sólo Admin da altas.
- **Meter el access token en query string** (SSE de Fase 7, o un `<iframe src>`) — queda en los logs del proxy de Railway.

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|----------|--------------|------|---------|
| Descargar y cachear el JWKS de Entra, seleccionar por `kid`, manejar rotación | Un fetch + `Map` + TTL | `jose.createRemoteJWKSet(url)` | Maneja fetch, selección por `kid`/`alg`/`use`/`key_ops`, cache, `cacheMaxAge`, `cooldownDuration` anti-abuso y `timeoutDuration` en una llamada. Un rollover de clave con cache casero = caída total del login sin causa visible. |
| Verificar firma + `iss` + `aud` + `exp` + `nbf` | Decodificar y comparar campos | `jose.jwtVerify(token, JWKS, { issuer, audience })` | La versión a mano se «arregla» con `ignoreExpiration` en cuanto falla algo. Es el camino directo al confused deputy. |
| Aislamiento por técnico | `WHERE technician_id = ?` en cada servicio | Políticas RLS en Postgres | AUTH-03 pide explícitamente que resista **un bug de código**. Un `WHERE` olvidado no deja rastro; una política sí. |
| Propagar la identidad a través de las capas | Pasar `userId` por parámetro a cada método | `AsyncLocalStorage` + interceptor | Con paso manual, olvidarlo es posible; con ALS es imposible. |
| Flujo de login redirect, PKCE, state, nonce, renovación silenciosa | OAuth a mano contra `/authorize` | `@azure/msal-browser` | PKCE + validación de `state`/`nonce` + cache + refresh + el puente COOP. Nadie debería reimplementar esto en 2026. |
| Puente de redirección COOP | Un `postMessage` propio | `broadcastResponseToMainFrame()` de `@azure/msal-browser/redirect-bridge` | Usa BroadcastChannel con el protocolo que MSAL espera al otro lado. |
| Cabeceras de seguridad | Escribir 13 `res.setHeader` | `helmet@8` — **configurado**, no por defecto | Los defaults son correctos para una app sin IdP externo; ver Pitfall 2 para las dos excepciones que hay que hacer. |
| Rate limit del endpoint de solicitud de acceso | Un contador en memoria | `@nestjs/throttler` | Es el único endpoint escribible por cualquier miembro del tenant. |

**Key insight:** en esta fase, todo lo que se escriba a mano en la ruta de autenticación o de aislamiento es, por definición, código de seguridad no auditado. Las tres librerías (`jose`, `msal-browser`, políticas RLS de Postgres) sustituyen exactamente las tres cosas que este proyecto no puede permitirse implementar mal.

## Common Pitfalls

### Pitfall 1: `@azure/msal-react@5` no soporta React 18 (y el registro npm no lo dice)

**Qué sale mal:** se instala `@azure/msal-react@^5` siguiendo `research/STACK.md`, `npm install` **no falla** (el rango de peers publicado es `^16.8.0 || ^17 || ^18 || ^19.2.1`, verificado en el registro), y la app parece funcionar. Pero la documentación oficial de Microsoft dice: *«MSAL React v5 supports React 19.2.1 or greater. It no longer supports React 16, 17, or 18»* y *«React 18 isn't supported or validated for v5 [...] You might see untested behavior around rendering/lifecycle timing, StrictMode interactions»*. El frontend arranca con `<StrictMode>` en `main.tsx`.

**Por qué pasa:** contradicción real entre el `peerDependencies` publicado y la doc. La doc gana: es la que declara el soporte.

**Cómo evitarlo:** no instalar `@azure/msal-react`. `state.tsx` ya expone `login`/`logout`/`loggedIn`; `MsalProvider` + `useMsal` no aportan nada que no exista. Usar `@azure/msal-browser@5` directamente desde `lib/auth/msal.ts`.

**Señales de alarma:** cualquier plan que instale `@azure/msal-react`; `npm ls react` mostrando 18.3.1 junto a msal-react 5.x.

---

### Pitfall 2: helmet con sus defaults rompe MSAL de dos maneras distintas

**Qué sale mal:** dos fallos independientes y ambos silenciosos hasta que se prueba el login real en Railway.

1. **COOP mata el puente.** helmet fija `Cross-Origin-Opener-Policy: same-origin` por defecto (verificado en la doc de helmet: es una de las 13 cabeceras por defecto). La doc de MSAL es explícita: *«The redirect bridge page must NOT be served with Cross-Origin-Opener-Policy headers [...] the browser performs a browsing context group swap that severs the communication channel back to the main application — reintroducing the exact problem the bridge is designed to solve»*.
2. **La CSP por defecto bloquea a Entra.** El default de helmet es `default-src 'self'; ... script-src 'self'; ...` sin `connect-src` ni `frame-src` propios — que por las reglas de fallback de CSP heredan `'self'`. MSAL hace `fetch` a `https://login.microsoftonline.com/.../token` y abre un iframe oculto contra el mismo host. Ambos quedan bloqueados por la CSP, con un error en consola que no menciona a MSAL.

**Cómo evitarlo:**

```ts
// main.ts
const AAD = 'https://login.microsoftonline.com';
const base = helmet({
  contentSecurityPolicy: { useDefaults: true, directives: {
    'connect-src': ["'self'", AAD],
    'frame-src':   ["'self'", AAD],
    'form-action': ["'self'", AAD],
  }},
});
const bridge = helmet({ /* mismas directivas */, crossOriginOpenerPolicy: false });
app.use((req, res, next) => (req.path === '/redirect.html' ? bridge : base)(req, res, next));
```

**Señales de alarma:** el login funciona en `vite dev` (sin helmet) y falla en Railway; errores de CSP en consola mencionando `login.microsoftonline.com`; el popup/iframe se abre y la app principal nunca recibe respuesta.

**Confianza:** el punto (1) es HIGH (ambas docs oficiales lo dicen textualmente). El punto (2) es **MEDIUM** — se deduce de los defaults documentados de helmet más las reglas de fallback de CSP; no encontré una fuente que documente esta combinación concreta. **Verificar en el navegador durante la implementación**, no darlo por hecho en ninguna dirección.

---

### Pitfall 3: `current_setting(...)::uuid` revienta cuando el valor es cadena vacía

**Qué sale mal:** un Admin sin `technician_id` genera `set_config('app.technician_id', '', true)`, y la política

```sql
USING (current_setting('app.role', TRUE) IN ('A','S')
       OR technician_id = current_setting('app.technician_id', TRUE)::uuid)
```

falla con `invalid input syntax for type uuid: ""`. La trampa es que **Postgres no garantiza la evaluación en cortocircuito del `OR`**: puede funcionar en dev y fallar en producción cuando el planificador reordena.

**Cómo evitarlo:** `NULLIF(current_setting('app.technician_id', TRUE), '')::uuid`. `NULL = valor` da `NULL`, que la política trata como falso — exactamente el comportamiento deseado. Y usar siempre `current_setting(name, TRUE)` (segundo argumento `missing_ok`), que devuelve `NULL` en vez de error cuando la GUC no está fijada.

**Señales de alarma:** el `::uuid` aparece pegado a un `current_setting` sin `NULLIF`; el test de RLS sólo cubre técnicos, nunca admins.

---

### Pitfall 4: la migración RLS pasa por la shadow database de Prisma

**Qué sale mal:** un `CREATE ROLE` dentro de una migración SQL falla la segunda vez que corre (`role already exists`), y `prisma migrate dev` la ejecuta contra la shadow database además de la real.

**Cómo evitarlo:** separar responsabilidades. El **rol** lo crea `scripts/db-bootstrap.ts` (idempotente, `DO $$ IF NOT EXISTS`, fuera de Prisma). Las **políticas y `GRANT`** van en migraciones SQL, escritas de forma idempotente (`DROP POLICY IF EXISTS` antes de `CREATE POLICY`) y referenciando sólo el *nombre* del rol, que es estable. En la shadow DB el `GRANT TO fava_app` fallaría si el rol no existe allí — por eso el bootstrap se corre también contra la BD local antes del primer `migrate dev`, y se documenta en el README.

**Señales de alarma:** `CREATE ROLE` dentro de `prisma/migrations/`; `migrate dev` que funciona una vez y falla la siguiente.

---

### Pitfall 5: P2028 y agotamiento del pool, los dos fallos opuestos de la tx-por-petición

**Qué sale mal:** con `timeout` en el default de 5 s, cualquier handler lento muere con `P2028 Transaction already closed`; y como cada petición retiene una conexión mientras dura, un endpoint lento agota el pool antes que la CPU. La corrección ingenua (subir el timeout a 60 s) empeora el segundo problema.

**Cómo evitarlo:** `transactionOptions: { timeout: 10_000, maxWait: 5_000 }` en el constructor; `max: 10` en el pool del adapter; ningún I/O externo dentro de la transacción; e índice en `users(entra_oid)` para que el lookup por petición no sea un seq scan. El test de concurrencia del criterio 5 es el que lo demuestra, no la inspección del código.

**Señales de alarma:** `P2028` o `Timed out fetching a new connection` en los logs de Railway; un `?connection_limit=` en la URL (que en v7 no hace nada).

---

### Pitfall 6: la vinculación por email deja una ventana de suplantación

**Qué sale mal:** el CONTEXT decide que el Admin invita por email y el primer login cuyo email coincida se vincula, guardando el `oid`. Si el matching se hace contra `preferred_username` o `upn` (que son mutables y reasignables en Entra), un email reciclado puede aterrizar en la invitación de otra persona.

**Cómo evitarlo:** comparar en minúsculas y con `trim` contra un `email` normalizado, tomando el claim **`email`** del token v2 y no `preferred_username`; hacer la vinculación **atómica** con un `updateMany({ where: { email, entraOid: null }, ... })` y verificar `count === 1` (si otro proceso ya vinculó, `count` es 0 y se responde 409, no se sobrescribe); y una vez escrito el `entra_oid`, **nunca volver a mirar el email para autenticar** — pasa a ser dato de visualización, como decidió el CONTEXT.

**Señales de alarma:** un `findFirst` seguido de `update` en el vínculo; el email como columna consultada en el guard después del primer login.

---

### Pitfall 7: «desactivado en el directorio» tarda hasta 90 minutos, y eso no es un bug

**Qué sale mal:** AUTH-04 dice «en app o en directorio». La parte «en app» se resuelve al 100 % con el lookup sin cache (Pattern 5). La parte «en directorio» no: si FAVA deshabilita la cuenta en Entra, el access token ya emitido **sigue siendo criptográficamente válido hasta que expira** — y la vida del token de Entra es aleatoria entre **60 y 90 minutos**, no una hora fija.

**Cómo evitarlo:** no se «evita», se acota y se declara. La mitigación completa es Continuous Access Evaluation, que para una API propia exige declararse recurso CAE-capable y manejar los `claims challenge` — desproporcionado para esta fase. Lo que sí corresponde: (a) documentar la ventana explícitamente en el criterio de aceptación, (b) el procedimiento operativo de baja es «desactivar en la app **y** en el directorio», siendo la app la que corta al instante, (c) no hardcodear ningún `3600` en el frontend — `acquireTokenSilent` decide cuándo renovar.

**Señales de alarma:** un plan que promete revocación instantánea desde el directorio sin nombrar CAE; una constante `3600` en el código de refresco.

---

### Pitfall 8: la migración de cuenta personal → empresa como arqueología

**Qué sale mal:** el proyecto se monta a clicks en la cuenta personal de Railway (variables escritas a mano, rol de BD creado desde un `psql` interactivo, redirect URIs añadidos en el portal de Entra sobre la marcha). Meses después hay que recrearlo en la cuenta de la empresa y nadie sabe qué estado existe ni por qué.

**Cómo evitarlo — todo lo del entorno vive en el repo desde el día 1:**
- `railway.toml` en **ruta absoluta del repo** (`/fava-control-tecnico/railway.toml`) — Railway documenta que el archivo de config **no** sigue el Root Directory.
- `scripts/db-bootstrap.ts` idempotente: recrear el rol de BD es un comando, no un recuerdo.
- `docs/ENV.md` con las 8 variables, su origen y cuál es secreta.
- `docs/ENTRA-SETUP.md` con los dos app registrations paso a paso y la lista exacta de redirect URIs (`http://localhost:5173/redirect.html` y `https://<dominio>/redirect.html`).
- `scripts/smoke.ts <url>` que verifica un despliegue recién creado en 10 segundos.

**Señales de alarma:** una variable de entorno que sólo existe en el dashboard de Railway; un paso de configuración que sólo está en el historial de un chat.

## Code Examples

### 1. Config de MSAL sin `msal-react` (frontend)

```ts
// frontend/src/lib/auth/msal.ts
// Fuente: learn.microsoft.com/entra/msal/javascript/browser/v4-migration (COOP + redirect bridge)
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';

const pca = new PublicClientApplication({
  auth: {
    clientId:  import.meta.env.VITE_ENTRA_SPA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: `${window.location.origin}/redirect.html`,   // ← el puente, no la home
  },
  cache: { cacheLocation: 'sessionStorage' },
});

const API_SCOPE = import.meta.env.VITE_API_SCOPE;  // api://<api-client-id>/access_as_user

export async function initAuth(): Promise<AccountInfo | null> {
  await pca.initialize();                                     // obligatorio desde v3
  const res = await pca.handleRedirectPromise({ navigateToLoginRequestUrl: true });
  const account = res?.account ?? pca.getAllAccounts()[0] ?? null;
  if (account) pca.setActiveAccount(account);
  return account;
}

export const login  = () => pca.loginRedirect({ scopes: [API_SCOPE] });
export const logout = () => pca.logoutRedirect();

export async function getToken(): Promise<string> {
  try {
    const r = await pca.acquireTokenSilent({ scopes: [API_SCOPE] });
    return r.accessToken;
  } catch (e: any) {
    if (e?.errorCode === 'interaction_required' || e?.errorCode === 'login_required') {
      await pca.acquireTokenRedirect({ scopes: [API_SCOPE] });
    }
    throw e;   // v5: e.message es un enlace a la doc — ramificar SIEMPRE por errorCode
  }
}
```

⚠️ **Un token sirve para un solo recurso.** Pedir `[API_SCOPE]` — nunca `['User.Read']` ni mezclado con scopes de Graph. Microsoft es tajante: los tokens de Microsoft Graph **no se pueden validar** por terceros (formato propietario). Si en el `aud` aparece `00000003-0000-0000-c000-000000000000`, eso es Graph y el backend lo rechazará.

### 2. Puente de redirección + Vite (frontend)

```html
<!-- frontend/redirect.html — junto a index.html, NO dentro de src/ -->
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Redirect</title></head>
<body><p>Procesando autenticación…</p>
<script type="module">
  import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
  broadcastResponseToMainFrame().catch(e => console.error('redirect bridge', e));
</script></body></html>
```

```ts
// frontend/vite.config.ts — el único cambio en el build existente
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: {
    main:     resolve(__dirname, 'index.html'),
    redirect: resolve(__dirname, 'redirect.html'),   // ← entrada adicional
  }}},
});
```

En `vite dev` se sirve solo en `/redirect.html`; en build, Rollup emite ambos HTML y convierte el `<script type="module">` inline en un chunk con `src` (relevante para la CSP: verificar en el `dist` que no queda script inline).

### 3. Guard de Entra con JWKS inyectable (backend)

```ts
// common/auth/jwks.provider.ts — separado A PROPÓSITO: es el punto de sustitución en tests
import { createRemoteJWKSet } from 'jose';
export const JWKS = 'JWKS_RESOLVER';
export const jwksProvider = {
  provide: JWKS,
  inject: [EnvService],
  useFactory: (env: EnvService) => createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/discovery/v2.0/keys`),
    { cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 5_000 },
  ),
};
```

```ts
// common/auth/entra.guard.ts
const { payload } = await jwtVerify(token, this.jwks, {
  issuer:   `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0`,
  audience: env.ENTRA_API_CLIENT_ID,        // o api://<api-client-id> — el que emita Entra
  clockTolerance: 60,
});
if (payload.tid !== env.ENTRA_TENANT_ID) throw new UnauthorizedException();
if (!String(payload.scp ?? '').split(' ').includes(env.ENTRA_REQUIRED_SCOPE))
  throw new ForbiddenException();

const user = await this.prisma.base.user.findUnique({ where: { entraOid: payload.oid } });
req.entra = { oid: payload.oid, email: payload.email, name: payload.name };
req.user  = user && user.isActive ? user : null;      // ← sin cache: AUTH-04
if (!req.user && !allowUnprovisioned) throw new ForbiddenException();
```

En los tests el provider `JWKS` se sustituye por `createLocalJWKSet(publicJwks)` sobre un par de claves generado con `generateKeyPair('RS256')`. Eso permite firmar tokens de prueba (expirado, `aud` ajeno, otro `tid`, sin `scp`) sin red y sin tenant.

### 4. Interceptor RLS (backend)

```ts
// common/prisma/rls.interceptor.ts
intercept(ctx: ExecutionContext, next: CallHandler) {
  const req = ctx.switchToHttp().getRequest();
  if (!req.user) return next.handle();          // /health, estáticos, /api/me no aprovisionado
  const u = req.user;
  return from(this.prisma.base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id',       ${u.id},                          TRUE),
      set_config('app.technician_id', ${u.technicianId ?? ''},          TRUE),
      set_config('app.is_admin',      ${u.roles.some(r => r === 'A' || r === 'S') ? 'on' : 'off'}, TRUE)`;
    return this.als.run(tx, () => lastValueFrom(next.handle()));
  }));
}
```

### 5. Migración RLS (backend, SQL a mano)

```sql
-- prisma/migrations/0002_rls/migration.sql
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries FORCE  ROW LEVEL SECURITY;   -- ni el owner miente en los tests

DROP POLICY IF EXISTS de_self ON daily_entries;        -- idempotente
CREATE POLICY de_self ON daily_entries FOR ALL TO fava_app
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR technician_id = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
  );

REVOKE UPDATE, DELETE ON audit_log FROM fava_app;      -- append-only para el runtime
```

### 6. Test de aislamiento con el rol real (backend)

```ts
// test/rls-isolation.e2e-spec.ts — el que demuestra el criterio 2
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: MIGRATE_URL }) });
const app   = new PrismaClient({ adapter: new PrismaPg({ connectionString: APP_URL   }) });

await owner.dailyEntry.createMany({ data: [ ...5 de A, ...3 de B ] });

const visto = await app.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.is_admin','off',TRUE),
                              set_config('app.technician_id',${TEC_A},TRUE)`;
  return tx.dailyEntry.findMany();
});
expect(visto).toHaveLength(5);
expect(visto.every(e => e.technicianId === TEC_A)).toBe(true);

// y el control que demuestra que el test no miente:
expect(await owner.dailyEntry.count()).toBe(8);
expect(
  (await app.$queryRaw`SELECT relrowsecurity, relforcerowsecurity
                       FROM pg_class WHERE relname='daily_entries'`)[0],
).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
```

Sin la aserción sobre `pg_class`, un test que pasa porque RLS está desactivado y la query no devolvió nada por otro motivo es indistinguible de uno que pasa de verdad.

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto aquí |
|---------------|----------------|---------------|--------------|
| `?connection_limit=N` en la URL de Prisma | `new PrismaPg({ max, connectionTimeoutMillis })` | Prisma 7 (adapters obligatorios) | Un `connection_limit` copiado se ignora en silencio |
| `prisma.$use()` para RLS | Extensión `$extends`, o mejor: interceptor + ALS | Prisma 7 (`$use` eliminado) | El snippet de RLS más copiado de internet no compila |
| `generator client { provider = "prisma-client-js" }` | `provider = "prisma-client"` + `output` + `moduleFormat = "cjs"` | Prisma 7 | Todo tutorial anterior a 2026 está obsoleto; sin `cjs`, NestJS no arranca |
| `passport-azure-ad` | `jose` + guard propio | Deprecado y archivado (2023) | Sigue siendo el primer resultado de Google |
| `redirectUri` = la home de la app | `redirectUri` = página puente `/redirect.html` | MSAL Browser v5 (COOP) | Cambia `vite.config.ts` **y** el registro de Entra |
| `@azure/msal-react` como forma normal de usar MSAL en React | `msal-browser` directo si ya hay un provider propio | msal-react v5 exige React ≥19.2.1 | Evita un upgrade de React fuera de alcance |
| `app.use('*', ...)` en Express | `app.use('{*path}', ...)` | Express 5 (NestJS 11) | Afecta al `exclude` de ServeStatic |
| Nixpacks | Railpack | Railway puso Nixpacks en mantenimiento | Usar el builder por defecto actual |

**Deprecado / a no usar:**
- `passport-azure-ad`: archivado, sin sustituto de Microsoft para Node.
- `@azure/msal-browser@4` / `msal-react@3`: dist-tag `lts` — sólo bugfixes críticos. Vía de escape documentada, no elección por defecto.
- `PublicClientNext` y `PublicClientApplication.createPublicClientApplication()`: eliminados en msal-browser v5.
- `navigateToLoginRequestUrl` en la config de MSAL: se movió a `handleRedirectPromise({ ... })` en v5.
- TypeScript 7.x para el backend: es `latest` en npm y no está comprometido con `emitDecoratorMetadata`.

## Open Questions

1. **¿La CSP por defecto de helmet bloquea de verdad a MSAL?** (Pitfall 2, punto 2)
   - Qué sabemos: helmet fija `default-src 'self'` y no declara `connect-src`/`frame-src`; por las reglas de fallback de CSP, ambos heredan `'self'`; MSAL llama a `login.microsoftonline.com`.
   - Qué no está claro: no encontré fuente que documente esta combinación específica. La deducción es sólida pero no verificada de extremo a extremo.
   - Recomendación: incluir las tres directivas desde el principio (coste: 3 líneas) y **verificar en el navegador** durante la tarea de deploy, con la consola abierta. No es una decisión que merezca un spike propio.

2. **¿Una app registration o dos?** `research/ARCHITECTURE.md` §Pattern 4 dice una (SPA + «Expose an API» en el mismo registro); `research/PITFALLS.md` §3 dice dos. Ambas funcionan.
   - Recomendación: **dos**, alineado con la doc de Microsoft y con `aud` semánticamente limpio. Es un registro extra creado una sola vez y documentado en `ENTRA-SETUP.md`. Si FAVA IT objeta el número de registros en el tenant real, la variante de uno solo es un cambio de dos variables de entorno.

3. **¿`fava_app` debe poder crear tablas en `public`?** No, pero en Postgres 15+ el esquema `public` ya no otorga `CREATE` a `PUBLIC`, así que el default correcto es gratis. Verificar la versión mayor que provisiona Railway hoy y **fijar la misma en `docker-compose.yml`** — un desajuste de mayor entre local y Railway es una fuente de sorpresas en el comportamiento de RLS y de los defaults de permisos.

4. **¿El spike multi-tabla sobre qué tablas?** El criterio 5 pide una transición multi-tabla de prueba con RLS activo, pero `daily_entries`/`weekly_notes` son de Fase 3-4.
   - Recomendación: crear **ya** en el schema de Fase 1 las dos tablas con su forma definitiva mínima (`daily_entries`, `weekly_notes`, con `technician_id`, `status`, `date @db.Date`) aunque ningún módulo las use todavía. El spike opera sobre ellas y Fase 3 las encuentra hechas. Alternativa (tablas `spike_*` desechables) mide algo que después se tira: más trabajo y menos garantía.
   - Corolario ya señalado en `PITFALLS.md` §6: los campos `source_year`/`source_sheet`/`source_row` de la migración (Fase 6) se deciden en Fase 1 o hay que migrar dos veces.

5. **¿`accessTokenAcceptedVersion` vs `requestedAccessTokenVersion`?** El manifiesto de Entra ha tenido ambos nombres según el formato (AAD Graph vs Microsoft Graph). Recomendación: editarlo en **Manage → Manifest** buscando `"requestedAccessTokenVersion": 2` dentro de `"api"`, y **verificar el token emitido** en jwt.ms comprobando `"ver": "2.0"` antes de escribir una línea del guard. Es la verificación de 2 minutos que evita depurar «invalid signature» fantasma.

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|-----------|-------|
| Framework | **Jest 30.x** (el que instala `@nestjs/cli@11` con `nest new`) + `@nestjs/testing` + `supertest` |
| Config | `backend/package.json` (`jest` para unit) y `backend/test/jest-e2e.json` (e2e) — **ninguno existe: Wave 0** |
| Base de datos de test | Postgres del `docker-compose.yml` local, con `db-bootstrap` ya corrido (dos roles) — **no existe: Wave 0** |
| Comando rápido | `npm -w backend run test` |
| Suite completa | `npm -w backend run test && npm -w backend run test:e2e` |
| Smoke de despliegue | `npm -w backend run smoke -- https://<dominio>.up.railway.app` |

### Phase Requirements → Test Map

| Req | Comportamiento | Tipo | Comando automatizado | ¿Existe? |
|-----|----------------|------|----------------------|----------|
| AUTH-01 | Token válido del tenant y audiencia correctos → 200 con identidad | integración | `npm -w backend run test:e2e -- auth` | ❌ Wave 0 |
| AUTH-01 | Token expirado / `aud` ajeno / otro `tid` / sin `scp` → 401-403 (4 casos) | unit | `npm -w backend run test -- entra.guard` | ❌ Wave 0 |
| AUTH-01 | Swap de tenant es sólo env: la suite corre con dos `ENTRA_TENANT_ID` distintos y pasa | integración | `npm -w backend run test:e2e -- tenant-swap` | ❌ Wave 0 |
| AUTH-02 | Admin asigna Técnico → 200; Admin asigna Admin → 403; Super Admin asigna Admin → 200 | integración | `npm -w backend run test:e2e -- users.roles` | ❌ Wave 0 |
| AUTH-02 | Anti-lockout: quitarse el propio S, o dejar cero Super Admins → 400 | integración | `npm -w backend run test:e2e -- users.roles` | ❌ Wave 0 |
| AUTH-03 | Técnico A conectado como `fava_app` ve 5 de 8 filas; `relforcerowsecurity = true` | integración | `npm -w backend run test:e2e -- rls-isolation` | ❌ Wave 0 |
| AUTH-03 | Admin (`app.is_admin = on`, `technician_id` vacío) ve las 8 sin error de cast | integración | `npm -w backend run test:e2e -- rls-isolation` | ❌ Wave 0 |
| AUTH-04 | Desactivar usuario → la petición inmediatamente siguiente con el **mismo** token da 403 | integración | `npm -w backend run test:e2e -- auth.deactivate` | ❌ Wave 0 |
| AUTH-04 | Baja en el directorio de Entra corta el acceso al expirar el token (60-90 min) | **manual** | — | Verificación documentada, no automatizable sin CAE |
| INFRA-01 | La app arranca; `/health` responde 200; falta una env var → el boot falla | integración | `npm -w backend run test:e2e -- bootstrap` | ❌ Wave 0 |
| INFRA-02 | Transición multi-tabla dentro de la tx-por-petición: 2 técnicos × 100 iteraciones concurrentes, cero fugas, cero P2028 | integración | `npm -w backend run test:e2e -- rls-transaction` | ❌ Wave 0 |
| INFRA-02 | Deploy vivo: `/health` 200, `/redirect.html` 200 **sin** cabecera COOP, `/api/me` sin token 401 | smoke | `npm -w backend run smoke -- <url>` | ❌ Wave 0 |
| INFRA-03 | `Login.tsx` con MSAL real: cuenta no invitada → pantalla «sin acceso»; desactivada → mensaje propio | **manual** | Checklist en el tenant dev con 3 cuentas | Automatizarlo exigiría E2E de navegador contra Entra — desproporcionado |
| INFRA-03 | `apiFetch` adjunta el Bearer y mapea 401/403 a los estados de la unión discriminada | unit | `npm -w frontend run test -- api-client` | ❌ Wave 0 (el frontend no tiene runner) |

### Sampling Rate

- **Por commit de tarea:** `npm -w backend run test` (unit, < 10 s)
- **Por merge de wave:** `npm -w backend run test && npm -w backend run test:e2e` (requiere el Postgres de docker-compose arriba)
- **Post-deploy:** `npm -w backend run smoke -- <url de Railway>` — obligatorio en cada despliegue de esta fase, porque tres de los cinco criterios sólo son observables desplegados
- **Phase gate:** suite completa en verde + smoke en verde + el checklist manual de 3 cuentas del tenant dev, antes de `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `fava-control-tecnico/package.json` — workspaces raíz (sin esto no hay comando que ejecutar)
- [ ] `backend/` completo vía `nest new` — trae Jest y `test/jest-e2e.json` configurados
- [ ] `docker-compose.yml` — Postgres con la **misma versión mayor** que Railway
- [ ] `backend/scripts/db-bootstrap.ts` — precondición de todo test de RLS
- [ ] `backend/test/helpers/tokens.ts` — `generateKeyPair` + firma de tokens de prueba + `createLocalJWKSet`
- [ ] `backend/test/helpers/db.ts` — dos `PrismaClient` (owner y app) + limpieza entre tests
- [ ] `backend/scripts/smoke.ts` — 4 aserciones HTTP contra la URL desplegada
- [ ] Runner de tests del frontend (Vitest) — **sólo** si se decide testear `apiFetch`; si no, marcarlo como verificación manual y no instalar nada

## Sources

### Primary (HIGH confidence)

- **Registro npm, consulta en vivo 2026-07-25** — todas las versiones, `peerDependencies`, `engines`, `dist-tags`. Hallazgos clave: `@azure/msal-browser` dist-tags (`lts: 4.30.0`, `latest: 5.17.1`); `@nestjs/platform-express@11.1.28` → `express: 5.2.1`; `@nestjs/serve-static@5.0.5` peer `express ^5.0.1`; `typescript` `latest` = 7.0.2.
- [Migrate from MSAL React v3 to v5](https://learn.microsoft.com/en-us/entra/msal/javascript/react/migration-guide-v4-v5) — «MSAL React v5 supports React 19.2.1 or greater. It no longer supports React 16, 17, or 18»; nota sobre React 18 no validado.
- [Migrate from MSAL Browser v4 to v5](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/v4-migration) — soporte COOP, puente de redirección obligatorio en todos los flujos, eliminación de `PublicClientNext`, `navigateToLoginRequestUrl` movido, `error.message` ahora es un enlace.
- [Set up the redirect bridge page](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge) — receta exacta de Vite (`rollupOptions.input`), advertencia «must NOT be served with Cross-Origin-Opener-Policy headers», obligación de actualizar el redirect URI en Entra.
- [How to configure an application to expose a web API](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-expose-web-apis) — Application ID URI `api://<client-id>`, `access_as_user`, «Authorized client applications» para suprimir el consentimiento.
- [Configure single-page app](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-registration) — plataforma SPA, redirect URI, cuenta organizacional única.
- [Access tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) — reglas de validación, confused deputy, v1 vs v2, imposibilidad de validar tokens de Graph, vida aleatoria 60-90 min.
- [Prisma — Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — `maxWait: 2000` / `timeout: 5000` por defecto, `transactionOptions` en el constructor (desde 5.10), P2034/P2028, «keep transactions short».
- [Prisma — Database connections](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections) — **«there are no connection URL parameters for these in Prisma ORM v7»**; el pool se configura en el adapter.
- [Prisma — Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) + [generators reference](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) — adapters obligatorios, `$use` eliminado, `moduleFormat`, `output` requerido.
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — superusuarios, `BYPASSRLS` y **dueños de tabla** saltan RLS; `FORCE ROW LEVEL SECURITY`.
- [Helmet — default headers](http://helmet.js.org/) — 13 cabeceras por defecto, `Cross-Origin-Opener-Policy: same-origin`, CSP por defecto, `helmet({ crossOriginOpenerPolicy: false })`.
- [Railway — Build configuration](https://docs.railway.com/builds/build-configuration) — **«The Railway Config File does not follow the Root Directory path. You have to specify the absolute path»**; watch paths desde `/`; comandos build/start personalizados.
- [Railway — Pre-deploy command](https://docs.railway.com/guides/pre-deploy-command) — corre entre build y deploy, en contenedor separado, sin volúmenes, no se reintenta si falla; caso de uso explícito: migraciones.
- [Railway — Deploying a monorepo](https://docs.railway.com/guides/deploying-a-monorepo) + [Variables](https://docs.railway.com/reference/variables) — Root Directory por servicio, `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, `${{Postgres.DATABASE_URL}}`.
- [jose — createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) — firma, `cacheMaxAge` / `cooldownDuration` / `timeoutDuration`, selección por `kid`/`alg`/`use`/`key_ops`.
- **Código del propio repo** — `frontend/src/{state,Login,Layout,types,App,main}.tsx`, `vite.config.ts`, `tsconfig.json`, `package.json`, `screens/Users.tsx`, `i18n.ts`. Base de todas las afirmaciones sobre puntos de integración.

### Secondary (MEDIUM confidence)

- Railway Central Station — `DATABASE_URL` privada (`*.railway.internal:5432`) vs `DATABASE_PUBLIC_URL` (`*.proxy.rlwy.net`); reportes de fallos intermitentes de red privada. Coincide con lo que documenta Railway sobre networking; corroborado por varias respuestas.
- Microsoft Q&A — `requestedAccessTokenVersion: 2` se edita en **Manage → Manifest**, dentro de `"api"`.
- Microsoft Q&A / MSAL FAQ — la rama `msal-lts` (v3/v4) «transitioned out of active support»: sólo bugfixes críticos.
- [Bytebase — Postgres RLS footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) — probar siempre con el rol de aplicación; vistas con `security_invoker`.
- `research/{STACK,ARCHITECTURE,PITFALLS}.md` del propio proyecto — reutilizados donde no contradicen lo verificado aquí; las tres contradicciones (pool de Prisma, cache de usuario, MSAL React) están marcadas y corregidas en el cuerpo.

### Tertiary (LOW confidence — validar en implementación)

- La CSP por defecto de helmet bloquea `connect-src`/`frame-src` hacia `login.microsoftonline.com` — deducción a partir de defaults documentados + reglas de fallback de CSP, sin fuente que documente la combinación. **Verificar en navegador.**
- Comportamiento exacto del `exclude` de `ServeStaticModule` con la sintaxis de comodines de Express 5 (`'/api/{*path}'`) — no lo verifiqué contra la doc de `@nestjs/serve-static@5`. Probar con un `curl /api/me` en el primer deploy.
- Railpack construyendo un workspace npm con dos paquetes y un `build` raíz — plausible y respaldado por la doc de comandos personalizados, pero no probado de extremo a extremo aquí. El plan debería tratar el primer deploy como una tarea con verificación propia, no como un paso trivial.

## Metadata

**Desglose de confianza:**
- Standard stack (versiones, peers, engines): **HIGH** — registro npm consultado en vivo el 2026-07-25.
- Entra ID (registros, validación, versiones de token): **HIGH** — Microsoft Learn, docs actualizadas 2026-06/2026-03.
- MSAL v5 / React 18 / puente de redirección: **HIGH** — declaraciones textuales en las guías de migración oficiales.
- Prisma 7 (adapters, pool, transacciones): **HIGH** — doc oficial de Prisma, incluida la frase que invalida `connection_limit`.
- RLS en Postgres (roles, FORCE, `NULLIF`): **HIGH** — doc de PostgreSQL + coincidencia de múltiples fuentes secundarias.
- Railway (config-as-code, pre-deploy, monorepo, variables): **HIGH** para lo citado; **MEDIUM** para Railpack + npm workspaces (no probado).
- helmet ↔ MSAL: **HIGH** en COOP, **MEDIUM** en CSP (deducido, no documentado).
- Arquitectura de validación: **MEDIUM-HIGH** — el enfoque es estándar; los comandos concretos dependen de lo que scaffoldee `nest new`.

**Research date:** 2026-07-25
**Valid until:** ~2026-08-25 para el stack en general. **~2026-08-08 para MSAL** — la línea v5 publicó 20 versiones en pocos meses y cambió de major el año pasado; reverificar `@azure/msal-browser` antes de empezar si pasan más de dos semanas.
