# Architecture Research

**Dominio:** Backend NestJS (monolito modular) + PostgreSQL/RLS para app de control de días técnicos con aprobación, PDF firmado y KPIs — ~50 usuarios, hosting Railway
**Researched:** 2026-07-25
**Confidence:** MEDIUM-HIGH (patrones NestJS/Prisma/RLS verificados en docs oficiales; límites de Railway verificados en docs de Railway; decisiones de storage y PDF son opinadas sobre evidencia de terceros)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (técnico en móvil / admin en escritorio)                   │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ AppProvider│  │ TanStack     │  │ lib/api    │  │ lib/auth     │  │
│  │ (UI state) │  │ Query        │  │ apiFetch() │  │ MSAL React   │  │
│  │ tema/lang/ │  │ (server      │  │ + tipos    │  │ loginRedirect│  │
│  │ ruta/modal │  │  state)      │  │ generados  │  │ acquireSilent│  │
│  └────────────┘  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘  │
│                         │ invalidate     │ Bearer         │           │
│                  ┌──────┴───────┐        │                │           │
│                  │useAppEvents  │        │                │           │
│                  │(SSE vía fetch)│       │                │           │
│                  └──────┬───────┘        │                │           │
└─────────────────────────┼────────────────┼────────────────┼───────────┘
                          │ GET /api/events│ /api/*         │ OIDC
                          ▼                ▼                ▼
                 ╔════════════════════════════════╗   ┌───────────────┐
                 ║  RAILWAY — servicio único      ║   │ Microsoft     │
                 ║  (Nest sirve API + build Vite) ║   │ Entra ID      │
                 ╠════════════════════════════════╣   │ (JWKS, OIDC)  │
                 ║  main.ts: helmet, rate-limit,  ║◄──┤ tenant dev →  │
                 ║  ServeStatic (sin CORS)        ║   │ tenant FAVA   │
                 ╟────────────────────────────────╢   └───────────────┘
                 ║  COMMON (transversal)          ║
                 ║  ┌──────────┐ ┌─────────────┐  ║
                 ║  │JwtStrategy│ │ RolesGuard  │  ║
                 ║  │(JWKS+DB) │ │ @Roles(T/A/S)│ ║
                 ║  └──────────┘ └─────────────┘  ║
                 ║  ┌──────────────────────────┐  ║
                 ║  │ RlsTxInterceptor (ALS)   │  ║
                 ║  │ 1 tx interactiva/request │  ║
                 ║  └──────────────────────────┘  ║
                 ║  ┌──────────┐ ┌─────────────┐  ║
                 ║  │AuditInterc│ │ EventsBus   │  ║
                 ║  │→ audit_log│ │ Subject<Ev> │  ║
                 ║  └──────────┘ └─────────────┘  ║
                 ╟────────────────────────────────╢
                 ║  MODULES (uno por dominio)     ║
                 ║  catalogs  users  technicians  ║
                 ║  projects  daily-entries       ║
                 ║  weekly-notes ├─ pdf/          ║
                 ║  dashboards  realtime  audit   ║
                 ║  import (CLI, sin controller)  ║
                 ╚═══════════════╤════════════════╝
                                 │ Prisma (rol fava_app, NOBYPASSRLS)
                                 ▼
                 ┌────────────────────────────────────────┐
                 │  RAILWAY POSTGRES (red privada)        │
                 │  ┌──────────────────────────────────┐  │
                 │  │ RLS: daily_entries, weekly_notes,│  │
                 │  │      trips  (set_config LOCAL)   │  │
                 │  ├──────────────────────────────────┤  │
                 │  │ Catálogos, proyectos, users      │  │
                 │  │ (solo RBAC, sin políticas)       │  │
                 │  ├──────────────────────────────────┤  │
                 │  │ weekly_note_pdfs (bytea)         │  │
                 │  │ audit_log · vistas de KPIs       │  │
                 │  └──────────────────────────────────┘  │
                 └────────────────────────────────────────┘
```

### Component Responsibilities

| Componente | Responsabilidad (qué posee) | Implementación |
|---|---|---|
| `common/auth` | Validar token Entra, resolver usuario de BD, exponer `CurrentUser`, RBAC | `passport-jwt` + `jwks-rsa`; `RolesGuard` global |
| `common/prisma` | Cliente Prisma + **una** transacción interactiva por request con las variables de sesión RLS | `AsyncLocalStorage` + interceptor |
| `common/audit` | Escribir `audit_log` en toda transición y ABM | Interceptor + `AuditService.record(tx, ...)` |
| `common/events` | Bus in-process de eventos de dominio (solo señales, sin payload) | `Subject<AppEvent>` de RxJS |
| `catalogs` | `concepts`, `role_types` — solo lectura, cacheables | Servicio con cache en memoria |
| `users` | Alta/baja, asignación de rol, vínculo `entra_oid ↔ technician_id` | CRUD + invalidación de cache de auth |
| `technicians` | Maestro de técnicos, tipo de vínculo (interno/externo), rol técnico | CRUD |
| `projects` | Proyecto **+ días vendidos (rol×fase) + máquinas** en un solo módulo | CRUD con escrituras anidadas |
| `daily-entries` | Bitácora diaria en estado `draft`: crear/editar/borrar los propios | CRUD con guard de inmutabilidad |
| `weekly-notes` | **Máquina de estados**: submit/approve/return/sign; posee el bloqueo de las 7 entradas | Servicios transaccionales + subcarpeta `pdf/` |
| `weekly-notes/pdf` | Render del documento fiel al formato real; persistencia de bytes | `@react-pdf/renderer` → `bytea` |
| `dashboards` | Agregaciones vendido/ejecutado, utilización, distribución | SQL crudo/vistas, **no** pasa por otros servicios |
| `realtime` | Endpoint `@Sse` + heartbeat + filtrado por rol | RxJS `merge(events$, interval)` |
| `audit` | Lectura de `audit_log` (solo S) | Query paginada |
| `import` | Migración Excel 2025/2026 + reporte de conciliación | Contexto standalone de Nest (CLI) |

---

## Recommended Project Structure

```
fava-control-tecnico/
├─ backend/
│  ├─ prisma/
│  │  ├─ schema.prisma              # tablas §10 — el contrato de datos
│  │  ├─ migrations/
│  │  │  └─ 0000_rls_roles/         # SQL manual: rol fava_app + políticas RLS
│  │  ├─ seed.ts                    # concepts, role_types (catálogos fijos)
│  │  └─ data/aliases.json          # mapas de limpieza §5, revisables por el cliente
│  ├─ src/
│  │  ├─ main.ts                    # helmet, rate-limit, ServeStatic del build de Vite
│  │  ├─ app.module.ts
│  │  ├─ cli.ts                     # createApplicationContext → import/reconcile
│  │  ├─ config/env.ts              # zod: DATABASE_URL, ENTRA_TENANT_ID, ENTRA_API_AUDIENCE…
│  │  ├─ common/
│  │  │  ├─ auth/
│  │  │  │  ├─ jwt.strategy.ts      # JWKS → claims → lookup users (cache 60s)
│  │  │  │  ├─ roles.guard.ts       # @Roles('A','S') — guard global
│  │  │  │  └─ current-user.decorator.ts
│  │  │  ├─ prisma/
│  │  │  │  ├─ prisma.service.ts    # cliente base + getter que devuelve el tx de ALS
│  │  │  │  └─ rls.interceptor.ts   # abre la tx, set_config(...), excluye /events
│  │  │  ├─ audit/
│  │  │  └─ events/events.service.ts
│  │  ├─ modules/
│  │  │  ├─ catalogs/
│  │  │  ├─ users/
│  │  │  ├─ technicians/
│  │  │  ├─ projects/               # + sold-days + machines (mismo módulo)
│  │  │  ├─ daily-entries/
│  │  │  ├─ weekly-notes/
│  │  │  │  ├─ weekly-notes.service.ts   # submit/approve/return/sign
│  │  │  │  └─ pdf/
│  │  │  │     ├─ nota-semanal.tsx  # documento react-pdf (formato real)
│  │  │  │     └─ pdf.service.ts    # render + persistencia bytea
│  │  │  ├─ dashboards/
│  │  │  ├─ realtime/
│  │  │  ├─ audit/
│  │  │  └─ import/                 # excel-parser, alias-resolver, reconciliation
│  │  └─ ...
│  └─ test/                         # e2e por módulo + test de aislamiento RLS
│
├─ frontend/                        # EXISTENTE — se le añade la capa de integración
│  └─ src/
│     ├─ lib/
│     │  ├─ api/client.ts           # apiFetch: token MSAL + ApiError tipado
│     │  ├─ api/types.gen.ts        # GENERADO desde OpenAPI (no editar a mano)
│     │  ├─ auth/msal.ts            # PublicClientApplication + config
│     │  └─ realtime/useAppEvents.ts# SSE vía fetch → invalidateQueries
│     ├─ state.tsx                  # SOLO estado de UI (se le quitan los mocks)
│     ├─ data.ts                    # se borra pantalla por pantalla
│     └─ screens/ components/       # sin cambios estructurales
│
├─ docker-compose.yml               # postgres local (con los 2 roles ya creados)
└─ README.md
```

### Structure Rationale

- **`modules/` por dominio, no por capa:** requisito explícito del usuario (legibilidad). Borrar o mover una funcionalidad es una operación de una sola carpeta. Es también el consenso actual de la comunidad NestJS para monolitos.
- **`projects/` absorbe sold-days y machines:** un módulo por *tabla* genera dependencias circulares. El agregado comercial (proyecto + días vendidos + máquinas) se escribe siempre junto, así que vive junto.
- **`weekly-notes/pdf/` anidado:** el PDF no tiene vida propia; es una proyección de la nota. Anidarlo evita un módulo `pdf` genérico que nadie más usa.
- **`import/` sin controller:** es una herramienta de operación, no una capacidad del producto. Exponerlo por HTTP sería una puerta trasera que escribe datos de todos los técnicos.
- **`common/` solo lo verdaderamente transversal:** auth, prisma/RLS, audit, events. Todo lo demás pertenece a un dominio.
- **Un solo servicio en Railway (Nest sirve el build de Vite):** elimina CORS, preflight, configuración de orígenes y un segundo despliegue. Mismo origen ⇒ el `<iframe>` del PDF y el SSE funcionan sin trucos. *Techo:* el frontend se redespliega con el backend; si eso molesta, separar servicios y configurar CORS.

---

## Architectural Patterns

### Pattern 1: RLS por transacción-por-request (NO la extensión de Prisma)

**Qué:** un interceptor abre **una** `$transaction` interactiva por request, ejecuta `set_config(..., true)` con la identidad, la guarda en `AsyncLocalStorage`, y `PrismaService` devuelve ese cliente a todos los servicios.

**Cuándo usarlo:** siempre que la app necesite escrituras multi-tabla atómicas bajo RLS. Es exactamente este caso: `approve` toca `weekly_notes` + 7 `daily_entries` + `audit_log`.

**Trade-offs:**
- ✅ Las transiciones de estado son atómicas de verdad.
- ✅ Ningún servicio recuerda pasar el contexto; imposible olvidarlo.
- ⚠️ Cada request retiene una conexión mientras dura → subir `connection_limit` en la URL y mantener los handlers rápidos.
- ⚠️ El timeout por defecto de la tx interactiva de Prisma es 5 s: **el render del PDF va fuera de la tx**.

> **Por qué NO el ejemplo oficial `prisma-client-extensions/row-level-security`:** ese ejemplo envuelve *cada query* en su propia batch transaction, y su propia documentación advierte que `$transaction()` explícito «puede no funcionar como se espera». Prisma confirma además que una extensión disparada dentro de una transacción emite sus queries en una conexión nueva, ignorando el contexto transaccional. Para una app cuya lógica central son transiciones de estado multi-tabla, copiar ese patrón es una bomba de tiempo.

```typescript
// common/prisma/rls.interceptor.ts (esqueleto)
intercept(ctx: ExecutionContext, next: CallHandler) {
  const req = ctx.switchToHttp().getRequest();
  if (req.path === '/api/events') return next.handle();      // SSE: nunca en tx
  const u = req.user;                                        // {userId, role, technicianId}
  return from(this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id',       ${u.userId},              TRUE),
      set_config('app.role',          ${u.role},                TRUE),
      set_config('app.technician_id', ${u.technicianId ?? ''},  TRUE)`;
    return this.als.run(tx, () => lastValueFrom(next.handle()));
  }, { timeout: 10_000 }));
}
```

```sql
-- prisma/migrations/0000_rls_roles/migration.sql (extracto)
CREATE ROLE fava_app LOGIN PASSWORD :'app_pw' NOBYPASSRLS;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fava_app;

ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries FORCE ROW LEVEL SECURITY;   -- que el owner tampoco mienta en tests
CREATE POLICY de_self ON daily_entries FOR ALL TO fava_app
  USING (
    current_setting('app.role', TRUE) IN ('A','S')
    OR technician_id = current_setting('app.technician_id', TRUE)::uuid
  );
```

**Alcance mínimo de RLS:** políticas **solo** en `daily_entries`, `weekly_notes` y `trips` — las únicas tablas donde la fuga entre técnicos es un problema real. Catálogos, proyectos y usuarios se protegen con RBAC. Tres políticas que se pueden auditar de un vistazo valen más que doce que nadie relee.

### Pattern 2: Endpoints de transición de estado con dueño único

**Qué:** `submit` / `approve` / `return` / `sign` son endpoints propios (ya decidido en §11). Además: **`weekly-notes` es el único módulo que escribe `status` en `daily_entries`**.

**Cuándo:** siempre que dos tablas compartan un ciclo de vida.

**Trade-offs:** `daily-entries` queda dependiendo de una regla que vive en otro módulo — se hace explícita con un único guard en su servicio, no repartida entre controladores.

```typescript
// weekly-notes.service.ts — submit: bloquear las entradas es parte de la transición
async submit(noteId: string, user: CurrentUser) {
  const tx = this.prisma.client;                       // el tx del request (RLS activo)
  const note = await tx.weeklyNote.findUniqueOrThrow({ where: { id: noteId } });
  assert(note.status === 'draft' || note.status === 'returned', 'Estado inválido');

  const entries = await tx.dailyEntry.findMany({
    where: { technicianId: note.technicianId, date: { gte: note.weekStart, lte: note.weekEnd } },
  });
  if (entries.length === 0) throw new BadRequestException('Semana sin registros');

  await tx.dailyEntry.updateMany({
    where: { id: { in: entries.map(e => e.id) } },
    data: { status: 'submitted', weeklyNoteId: noteId },   // ← el bloqueo vive aquí
  });
  await tx.weeklyNote.update({ where: { id: noteId }, data: { status: 'submitted', submittedAt: new Date() } });
  await this.audit.record(tx, user, 'submit', 'weekly_note', noteId, note, { status: 'submitted' });

  this.events.publish({ type: 'weekly-note.submitted', entity: 'weekly-notes', id: noteId });
}
```

```typescript
// daily-entries.service.ts — un solo guard, todos los callers pasan por aquí
private assertEditable(e: DailyEntry) {
  if (e.status !== 'draft') throw new ForbiddenException('Registro enviado: no editable');
}
```

### Pattern 3: SSE como bus de invalidación, no de datos

**Qué:** los eventos SSE llevan solo `{ type, entity, id }`. El cliente **refetchea**; el evento nunca transporta el estado.

**Cuándo:** en cualquier despliegue donde el proxy pueda cortar la conexión — y Railway **corta a los 15 minutos** y mata streams sin datos **a los 5 minutos**.

**Trade-offs:**
- ✅ Una reconexión no pierde nada: al reconectar se refetchea y punto. Sin `Last-Event-ID`, sin buffer de replay, sin bug de "actualización perdida".
- ✅ Ningún dato sensible viaja por un canal que no pasa por RLS.
- ⚠️ Un refetch extra por evento. Irrelevante con ~50 usuarios.

```typescript
// realtime.controller.ts
@Sse('events')
stream(@CurrentUser() u: CurrentUser): Observable<MessageEvent> {
  return merge(
    this.events.stream$.pipe(filter(e => this.visibleTo(e, u))),
    interval(25_000).pipe(map(() => ({ type: 'ping' } as AppEvent))),  // < 5 min de Railway
  ).pipe(map(data => ({ data })));
}
```

```typescript
// frontend/src/lib/realtime/useAppEvents.ts — SSE con fetch (EventSource NO admite headers)
const res = await fetch('/api/events', {
  headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'text/event-stream' },
  signal,
});
// leer res.body como stream → por cada evento:
qc.invalidateQueries({ queryKey: [event.entity] });
```

> **Gotcha real:** `EventSource` no permite cabeceras. La salida barata es meter el token en la query string — y ahí queda, en los logs del proxy. Un lector de `ReadableStream` con `fetch` (o `@microsoft/fetch-event-source`) reutiliza el mismo Bearer y además da control sobre el backoff de reconexión.

### Pattern 4: Roles en la BD, identidad en el token

**Qué:** el token de Entra prueba **quién** es (claim `oid`). El **rol** (T/A/S) sale de la tabla `users`. `JwtStrategy` valida firma/`iss`/`aud`/`exp` contra el JWKS del tenant y luego resuelve el usuario, con cache en memoria de 60 s invalidada al hacer `PATCH /api/users/:id`.

**Por qué:** la matriz §6 es lógica de negocio y el Admin la gestiona **dentro de la app** (§11). Depender de App Roles de Entra obligaría a FAVA a tocar su tenant cada vez que alguien cambia de rol. Se mantiene intacto lo importante: sin usuario en el directorio no hay token, y baja en el directorio = acceso perdido.

**Consecuencia de seguridad:** un `oid` desconocido devuelve **403**, no se auto-provisiona. Sin esto, cualquier miembro del tenant de FAVA entraría a la app.

**Registro de app:** uno solo, con plataforma SPA (redirect URI) *y* «Expose an API» (`api://<client-id>/access_as_user`). Cambiar de tenant dev a tenant FAVA = dos variables de entorno en el backend y dos en el frontend. Nota verificada: MSAL emite el token para **el primer recurso** del array de scopes — el scope de la API propia debe pedirse en una llamada separada de la de Graph.

### Pattern 5: El PDF vive en Postgres

**Qué:** `weekly_note_pdfs(weekly_note_id PK, bytes BYTEA, sha256 TEXT, generated_at TIMESTAMPTZ)`, tabla aparte para no engordar los listados de `weekly_notes`. Se renderiza al vuelo mientras la nota es borrador; se **persiste al firmar** y queda inmutable.

**Por qué no volumen de Railway:** los volúmenes de Railway son incompatibles con réplicas, provocan downtime en cada redespliegue, solo se pueden restaurar hasta 48 h tras el borrado y no tienen S/FTP. Es la herramienta equivocada para documentos de negocio firmados por un cliente.

**Por qué no R2/S3 (todavía):** 15 técnicos × 52 semanas × ~150 KB ≈ **120 MB/año**. Cabe de sobra en Postgres, entra en el mismo backup PITR que el resto del dato, y la RLS de la nota protege el PDF automáticamente. Añadir un bucket es un proveedor más, un secreto más y un ciclo de vida de URLs firmadas más para resolver un problema que no existe.

**Sobre §12 ("PDFs en storage privado con URLs firmadas"):** el objetivo se cumple con más margen — el PDF no es alcanzable por ninguna URL pública; se sirve por `GET /api/weekly-notes/:id/pdf` con RBAC + RLS. Una URL firmada es un permiso que viaja solo; aquí no viaja nada.

**Techo declarado:** si aparecen adjuntos con fotos, o FAVA pide enviar la nota por enlace externo, migrar a Cloudflare R2 con presigned URLs (ojo: R2 topa el TTL de firma en 7 días).

```typescript
// pdf.service.ts
const buf = await renderToBuffer(<NotaSemanal note={note} entries={entries} />);   // ~400 ms
// fuera de la tx del request si tarda; luego persistir en una tx corta
```

> Se descartó Puppeteer/Chromium: ~300–400 MB de imagen, picos de memoria, fugas de `page` si falta el `finally`, y ~2,8 s por documento frente a <400 ms de `@react-pdf/renderer`. La Nota es **una** plantilla fija: no hace falta un navegador para imprimirla.
>
> **Corolario de diseño:** el preview del frontend deja de ser HTML propio y pasa a ser el PDF real embebido (`fetch` con Bearer → `blob:` URL → `<iframe>`). Una sola representación, imposible que diverja. (Un `<iframe src="/api/...">` a secas no lleva la cabecera `Authorization` — de ahí el paso por blob.)

### Pattern 6: Migración como contexto standalone de Nest

**Qué:** `src/cli.ts` arranca `NestFactory.createApplicationContext(CliModule)` y despacha por `process.argv[2]`. Reutiliza DI, Prisma, validaciones y catálogos. Sin `nest-commander` — un argumento posicional no necesita un parser.

**Detalles que importan:**
- Corre con la **URL del rol owner** (necesita escribir filas de todos los técnicos ⇒ debe saltarse RLS a propósito).
- **Idempotente**: `upsert` sobre la clave natural `(technician_id, date)`, que ya es el `UNIQUE` del esquema.
- **`--dry-run` por defecto**; produce el reporte de conciliación (CSV: totales Excel vs. app por técnico/mes/concepto) sin escribir nada.
- Los mapas de alias de §5 son `prisma/data/aliases.json` versionados en git: el cliente los revisa, el diff es legible, y no ocupan una tabla que solo se usa una vez.
- El `.xls` es BIFF antiguo: convertirlo **una vez** a CSV y parsear CSV. Es una migración única; no merece una dependencia de lectura de Excel (SheetJS ya no se publica en el registro público de npm). Cuando llegue Fase 2 con exportaciones a formato matriz, ahí sí entra `exceljs`.

---

## Data Flow

### Request Flow (mutación típica: Admin aprueba una nota)

```
[Admin pulsa "Aprobar"]
   ↓  apiFetch → acquireTokenSilent(api://…/access_as_user)
[POST /api/weekly-notes/:id/approve]  Authorization: Bearer …
   ↓
[JwtStrategy]  JWKS → verifica firma/iss/aud/exp → lookup users(entra_oid) → {userId, role:'A'}
   ↓
[RolesGuard]   @Roles('A','S') ✓
   ↓
[RlsTxInterceptor]  BEGIN; set_config('app.role','A',TRUE) …   ← ALS guarda el tx
   ↓
[WeeklyNotesService.approve]
   ├─ valida reglas (7 días presentes, estado = submitted)
   ├─ UPDATE weekly_notes SET status='approved'
   ├─ UPDATE daily_entries SET status='approved'
   └─ INSERT audit_log (before/after)
   ↓                                                            COMMIT
[EventsService.publish({type:'weekly-note.approved', entity:'weekly-notes', id})]
   ↓                                       ↓
[200 → refetch del actor]        [Subject → todos los @Sse suscritos]
                                           ↓
                             [useAppEvents → qc.invalidateQueries(['weekly-notes'])]
                                           ↓
                             [Bandeja y KPIs de los demás se repintan solos]
```

Nota de orden: **`publish` va después del COMMIT**, nunca dentro de la transacción. Emitir antes provoca que un cliente refetchee y lea el estado viejo.

### State Management (frontend)

```
   AppProvider (existente, adelgazado)          TanStack Query (nuevo)
   ─────────────────────────────────            ──────────────────────
   tema · idioma · densidad · ruta              users · technicians · projects
   modales · toast · búsqueda · onboarding      daily-entries · weekly-notes
   rol activo de la sesión                      dashboards · audit
            │                                            ▲
            │ useApp()                                   │ invalidateQueries
            ▼                                            │
      [11 pantallas]  ◄──── useQuery/useMutation ────────┤
                                                          │
                                              [useAppEvents ← SSE]
```

El corte es limpio: **`state.tsx` deja de conocer datos del servidor**. Hoy inicializa `users/projects/notes/week/expenses/audit` desde `data.ts`; esos seis campos salen del `AppState`. Lo demás (tema, idioma, ruta, modales) se queda tal cual — funciona y no hay motivo para tocarlo.

*Alternativa honesta más perezosa:* mantener todo en `AppProvider` con `fetch` a mano y una función `reload()`. Es viable a esta escala; el coste es que las 11 pantallas re-implementan estado de carga/error y la invalidación por SSE se vuelve un refetch global. Con 11 pantallas ya no compensa: TanStack Query es la única dependencia de estado de servidor que se añade.

### Key Data Flows

1. **Captura única (el corazón del producto):** `daily_entries` es la única entrada de datos. De ahí salen, por lectura: la Nota Semanal (7 filas ⇒ PDF), los KPIs (agregación por proyecto/rol/fase) y el control vendido/ejecutado (`project_sold_days` vs. `COUNT(daily_entries)`). **Ningún número se guarda dos veces.** El `delta` no es una columna, es una resta en una vista.
2. **Identidad:** Entra emite el token → el backend resuelve `users.entra_oid` → `role` + `technician_id` → variables de sesión Postgres → políticas RLS. La identidad atraviesa las tres capas sin que ningún servicio de dominio la manipule.
3. **Tiempo real:** mutación → COMMIT → `Subject` → `@Sse` filtrado por rol → invalidación en el cliente → refetch. El dato solo viaja por el canal HTTP autenticado.
4. **Documento firmado:** entradas aprobadas → render `@react-pdf/renderer` → firma cliente (canvas → PNG base64 → columna) → persistencia `bytea` + `sha256` → inmutable. El `sha256` permite demostrar después que el PDF entregado es el que se firmó.
5. **Histórico:** CSV limpio → `aliases.json` resuelve técnicos/roles/proyectos → `upsert` por `(técnico, fecha)` → reporte de conciliación CSV que FAVA firma. Sin esto los KPIs históricos no tienen con qué contrastarse.

---

## Scaling Considerations

| Escala | Ajustes de arquitectura |
|---|---|
| **0–50 usuarios (este proyecto)** | Todo lo descrito. Una réplica en Railway, `Subject` en memoria, PDFs en Postgres, sin cache externa. |
| **50–500 usuarios** | 1) `connection_limit` explícito en la URL de Prisma y handlers cortos (la tx-por-request retiene conexión). 2) Vistas materializadas para los KPIs, refrescadas al aprobar. 3) PDFs a R2 si aparecen adjuntos. |
| **500+ / multi-réplica** | El `Subject` in-process deja de servir: cambiar a **Postgres `LISTEN/NOTIFY`** (ya se tiene Postgres; no hace falta Redis para esto). Además, el volumen deja de ser opción y todo storage debe ser objeto. |

### Scaling Priorities

1. **Primer cuello: agotamiento del pool de conexiones.** La transacción por request retiene una conexión mientras dura el handler. Un endpoint lento (un dashboard sin índice) tumba el pool antes que la CPU. *Arreglo:* índices sobre `daily_entries(technician_id, date)` y `(project_id, date)`, y prohibir I/O externo dentro de la tx (el render de PDF va fuera).
2. **Segundo cuello: KPIs recalculados en cada carga.** Con decenas de miles de filas/año, `GET /api/dashboards/kpis` recorre todo. *Arreglo:* vista materializada refrescada en `approve`, no cache por tiempo — el requisito es «tiempo real» y un `REFRESH` en la transición lo cumple exactamente.
3. **Tercero: conexiones SSE ociosas.** Un técnico con la pestaña abierta todo el día mantiene un socket. A 50 usuarios es ruido; el heartbeat de 25 s ya lo sostiene dentro de los límites de Railway.

---

## Anti-Patterns

### Anti-Pattern 1: Correr la app con el superusuario de Postgres

**Qué se hace:** usar la `DATABASE_URL` que Railway entrega tal cual (rol `postgres`) para el runtime.
**Por qué está mal:** superusuarios y **dueños de tabla** se saltan RLS silenciosamente. Las políticas se escriben, los tests pasan, y la segunda capa de defensa simplemente no existe. Es el fallo más peligroso porque **no hay ningún síntoma**.
**Hacer en su lugar:** dos roles y dos URLs — `fava_owner` (migraciones, seed, import) y `fava_app` (`NOBYPASSRLS`, runtime). Añadir `FORCE ROW LEVEL SECURITY` para que ni siquiera un test corrido como owner mienta. Un test e2e que falle si el técnico A ve una fila del técnico B.

### Anti-Pattern 2: Copiar la extensión RLS de Prisma sin leer la advertencia

**Qué se hace:** adoptar `prisma-client-extensions/row-level-security` porque es el ejemplo oficial.
**Por qué está mal:** envuelve cada query en su propia batch transaction. `approve` (nota + 7 entradas + auditoría) deja de ser atómico y una caída a mitad deja registros bloqueados sin nota aprobada. La propia doc de Prisma advierte que `$transaction()` explícito «puede no funcionar como se espera» y que una extensión dentro de una transacción abre conexión nueva.
**Hacer en su lugar:** Pattern 1 — una transacción interactiva por request en un interceptor + `AsyncLocalStorage`.

### Anti-Pattern 3: `timestamptz` para el día trabajado

**Qué se hace:** `daily_entries.date` como `DateTime` de Prisma (⇒ `timestamptz`).
**Por qué está mal:** un técnico en Bogotá (UTC−5) y otro en Italia (UTC+2) registran «lunes». Con instantes, el `UNIQUE(technician_id, date)` deja de proteger nada y las semanas de la Nota se cortan mal. Es el edge case «zonas horarias» de PROJECT.md, y se manifiesta como días duplicados meses después.
**Hacer en su lugar:** `date` como tipo **`DATE`** (`@db.Date`) — un día calendario de negocio no tiene hora ni zona. Toda la aritmética de semana (`week_start`/`week_end`) sobre fechas puras.

### Anti-Pattern 4: `PATCH /api/weekly-notes/:id { status }`

**Qué se hace:** un endpoint genérico de cambio de estado.
**Por qué está mal:** cada transición tiene reglas distintas (no aprobar sin sus días, no firmar sin aprobar, no reabrir sin comentario) y cada una debe dejar rastro distinto en auditoría. Un `PATCH` genérico convierte la máquina de estados en una cadena de `if` dentro de un método, y el `audit_log` pierde la semántica.
**Hacer en su lugar:** lo ya decidido en §11 — `submit` / `approve` / `return` / `sign` como endpoints propios. La ruta *es* la acción auditada.

### Anti-Pattern 5: Calcular los KPIs en TypeScript

**Qué se hace:** `findMany()` de todas las entradas y `reduce()` en Node para vendido/ejecutado.
**Por qué está mal:** trae decenas de miles de filas por request para devolver una tabla de veinte números, y reintroduce a mano justo los errores aritméticos que §5 detectó en el Excel.
**Hacer en su lugar:** `$queryRaw` con `GROUP BY` o vistas SQL. El delta vendido/ejecutado es una resta entre dos agregados, no un campo persistido.

### Anti-Pattern 6: Un módulo Nest por tabla

**Qué se hace:** `sold-days.module.ts`, `machines.module.ts`, `expenses.module.ts`.
**Por qué está mal:** dependencias circulares por todas partes y `forwardRef()` sembrado como parche. Es el error de estructura que más se repite en monolitos NestJS.
**Hacer en su lugar:** un módulo por **dominio**. Los días vendidos y las máquinas son parte del agregado proyecto; los gastos son un `JSONB` de la nota (§10 ya lo modela así).

### Anti-Pattern 7: Desplegar en Railway al final

**Qué se hace:** desarrollar todo en local y desplegar en la última fase.
**Por qué está mal:** los tres límites reales de esta arquitectura solo aparecen en Railway — el corte de SSE a 15 min, el kill a 5 min sin datos y la gestión de los dos roles de Postgres. Descubrirlos con la app terminada obliga a rehacer la capa de tiempo real.
**Hacer en su lugar:** desplegar el *primer* slice vertical (login Entra + `GET /api/me`) y no seguir hasta que funcione en Railway.

---

## Integration Points

### External Services

| Servicio | Patrón de integración | Gotchas |
|---|---|---|
| **Microsoft Entra ID** | Frontend: MSAL React `loginRedirect` + `acquireTokenSilent`. Backend: `passport-jwt` + `jwks-rsa` contra `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` | `passport-azure-ad` está **archivado**; Microsoft aún no publica sustituto oficial y remite a `passport-jwt`+`jwks-rsa`. Usar `loginRedirect`, no popup (los técnicos entran desde el móvil). Un token solo sirve para **un** recurso: pedir el scope de la API propia por separado. Registro único con plataforma SPA + «Expose an API». |
| **Railway (app)** | Servicio único: Nest sirve `/api/*` y el build de Vite | SSE: máx. **15 min** por conexión, cerrada a los **5 min** sin datos ⇒ heartbeat + diseño tolerante a reconexión. |
| **Railway Postgres** | Prisma; **dos** URLs (owner para migraciones/import, app para runtime) | La URL que da Railway es de superusuario: RLS no aplica. Crear `fava_app` en la primera migración. |
| **Resend (si hay email)** | HTTP API | Railway bloquea SMTP saliente (ya anotado en PROJECT.md). Nada de `nodemailer` con SMTP. |
| **Cloudflare R2** | *No en v1.* Reservado para adjuntos o enlaces externos | Presigned URL topa en 7 días de TTL. |

### Internal Boundaries

| Frontera | Comunicación | Consideraciones |
|---|---|---|
| `daily-entries` ↔ `weekly-notes` | Import directo de servicio; **weekly-notes escribe, daily-entries valida** | La regla de inmutabilidad vive en un único método privado de `daily-entries`; todos los callers pasan por él. |
| `dashboards` → resto | **SQL crudo / vistas**, no servicios de dominio | Los KPIs son agregaciones; pasar por repositorios de entidad los volvería N+1. |
| `*` → `common/events` | `EventsService.publish()`, siempre post-COMMIT | Eventos sin payload. El bus jamás puentea RLS. |
| `*` → `common/audit` | `audit.record(tx, …)` dentro de la misma transacción | Auditoría fuera de la tx = registros huérfanos ante rollback. |
| `import` → dominio | Import de servicios, **con cliente Prisma owner** | Es el único punto que salta RLS a propósito; sin controller HTTP. |
| Frontend ↔ Backend | REST `/api` + tipos **generados** desde OpenAPI (`@nestjs/swagger` → `openapi-typescript`) | Los tipos mock actuales **no coinciden** con el esquema (`Note.tech` es un nombre; `Project.sold` es una `PhaseMatrix` que en BD son filas de `project_sold_days`). Decisión: **los DTO del backend adoptan la forma que las pantallas ya consumen** (pivotar `sold_days` a matriz en la query) en vez de reescribir 11 pantallas. |

---

## Suggested Build Order

El orden lo dictan dos dependencias duras: **nada funciona sin identidad**, y **retrofitear RLS después es tocar todos los servicios**.

| # | Bloque | Depende de | Por qué aquí |
|---|---|---|---|
| 0 | `schema.prisma` + seed de catálogos + docker-compose | — | Fija el contrato de datos (§16.1). Todo lo demás lo referencia. |
| 1 | **Slice vertical de auth**: registro Entra → MSAL login → `GET /api/me` → lookup en `users` | 0 | De-riesga lo más incierto (acceso al tenant) antes de invertir en dominio. |
| 2 | **Deploy en Railway de ese slice** | 1 | Los límites de SSE, los dos roles de Postgres y el build único aparecen solo en Railway. Descubrirlos ahora cuesta horas; al final, semanas. |
| 3 | **Cimiento RLS**: `fava_app`, políticas en 3 tablas, interceptor tx+ALS, test de aislamiento | 1 | Después de esto sería refactor de todos los servicios. |
| 4 | `catalogs` → `technicians` → `users` → `projects` | 3 | Datos de referencia: las entradas diarias apuntan a ellos. Aquí se conectan las primeras pantallas admin. |
| 5 | **`daily-entries`** | 4 | El núcleo. PROJECT.md: «si todo lo demás falla, la bitácora diaria debe funcionar». |
| 6 | `weekly-notes` (submit/approve/return) + interceptor de auditoría | 5 | La auditoría entra con las primeras transiciones, no después. |
| 7 | `import` + reporte de conciliación | 4 (esquema estable) | **Puede ir en paralelo con 5–6.** Debe estar *antes* de dashboards: los KPIs sin histórico no se pueden validar contra el Excel. |
| 8 | `realtime` (SSE) | 6 | Necesita eventos que publicar. |
| 9 | `pdf` + firma del cliente | 6 | Necesita notas aprobadas y el formato real cerrado. |
| 10 | `dashboards` (KPIs con Nivo) | 7 + 5 | Necesita histórico migrado para tener sentido. |
| 11 | Cutover del frontend | — | **Pantalla por pantalla, intercalado desde el paso 4.** `data.ts` sobrevive hasta que cada pantalla tiene su endpoint. Nunca un big-bang. |

**Fase 2** (`trips`, `exports`) no se andamia ahora: carpetas vacías son código muerto. Cuando lleguen, entran como módulos nuevos sin tocar los existentes — que es precisamente para lo que sirve un módulo por dominio.

---

## Sources

**Alta confianza (documentación oficial):**
- [Server-Sent Events — NestJS Docs](https://docs.nestjs.com/techniques/server-sent-events) — decorador `@Sse`, desuscripción automática al cerrar el cliente
- [Volumes — Railway Docs](https://docs.railway.com/volumes/reference) — un volumen por servicio, **incompatible con réplicas**, downtime al redesplegar, restauración solo 48 h
- [Choose Between SSE and WebSockets — Railway Guides](https://docs.railway.com/guides/sse-vs-websockets) — **15 min** de tope por stream, cierre a los **5 min** sin datos, heartbeat obligatorio
- [PostgreSQL 18 — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — superusuarios, `BYPASSRLS` y **dueños de tabla** se saltan RLS; `FORCE ROW LEVEL SECURITY`
- [Prisma Client extensions — Prisma Docs](https://www.prisma.io/docs/orm/prisma-client/client-extensions) — GA desde 4.16.0
- [prisma-client-extensions/row-level-security — GitHub](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) — patrón `set_config(..., TRUE)`; **advertencia explícita sobre `$transaction()`**
- [Prisma Discussion #20016 — Client Extensions and Interactive Transactions](https://github.com/prisma/prisma/discussions/20016) — una extensión dentro de una transacción emite queries en conexión nueva
- [Acquire a token to call a web API (SPA) — Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-acquire-token) — `acquireTokenSilent`, scope `api://<appid>/<scope>`
- [Resources and Scopes — MSAL.js](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/resources-and-scopes) — el token se emite para **el primer recurso** del array
- [AzureAD/passport-azure-ad — GitHub](https://github.com/AzureAD/passport-azure-ad) — repositorio archivado

**Confianza media (verificado contra ≥2 fuentes):**
- [Node JS auth request validation — microsoft-identity-web Discussion #2405](https://github.com/AzureAD/microsoft-identity-web/discussions/2405) — `passport-jwt` + `jwks-rsa` como reemplazo de facto
- [Validating Entra ID Generated OAuth Tokens — Voitanos](https://www.voitanos.io/blog/validating-entra-id-generated-oauth-tokens/) — validación de firma/`iss`/`aud`
- [PDF Generation on the Server: Puppeteer vs @react-pdf/renderer — DEV](https://dev.to/iurii_rogulia/pdf-generation-on-the-server-puppeteer-vs-react-pdfrenderer-a-production-comparison-44cg) — ~2,8 s vs <400 ms; fugas de `page` en Puppeteer
- [Postgres Row-Level Security Footguns — Bytebase](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) — probar siempre con el rol de aplicación, nunca con superusuario
- [Node.js SSE in 2026: The Production Guide — HireNodeJS](https://www.hirenodejs.com/blog/nodejs-server-sent-events-sse-2026) — `EventEmitter`/`Subject` in-process basta con un proceso; bus externo al escalar
- [NestJS Project Structure Best Practices 2026 — Encore](https://encore.dev/articles/nestjs-project-structure-best-practices) — estructura por feature; no un módulo por entidad
- [Puppeteer-Railway-Buildpack — GitHub](https://github.com/ryannono/Puppeteer-Railway-Buildpack) — evidencia del coste de infra que se evita

**Baja confianza (señalar para validar en implementación):**
- Estimación de tamaño de PDFs (~150 KB × 780/año ≈ 120 MB/año) — extrapolada del PDF de ejemplo de FAVA; medir con el primer render real.
- Estado de publicación de SheetJS en el registro npm — mitigado por la recomendación de convertir el `.xls` a CSV una sola vez.
- Comportamiento de buffering del proxy de Railway con SSE — la doc de Railway documenta timeouts pero **no** buffering; verificar en el paso 2 del build order (deploy temprano).

**No disponible:** Context7 MCP no estaba accesible en esta sesión; toda la verificación se hizo contra documentación oficial vía WebFetch/WebSearch.

---
*Architecture research for: monolito modular NestJS + Postgres RLS + SSE + PDF, sobre Railway*
*Researched: 2026-07-25*
