# Phase 3: Bitácora diaria - Research

**Researched:** 2026-07-26
**Domain:** Captura diaria multi-huso sobre Postgres `DATE` + RLS, borrador local en navegador, escritura idempotente por clave natural (NestJS 11 · Prisma 7 · React 19 sin runner de tests)
**Confidence:** HIGH — los seis puntos críticos están verificados **contra el motor y contra el runtime reales** de este repo (probes ejecutados y retirados), no contra documentación.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Forma de captura**
- **La grilla semanal manda**; tocar una fila abre el drawer para editar ese día. Una sola fuente de verdad, y el técnico ve siempre qué días le faltan. El drawer deja de ser un alta suelta.
- **Móvil: lista vertical de tarjetas**, una por día — el patrón que ya usan las otras pantallas en vista móvil. No grilla con scroll horizontal.
- **Botón «igual que ayer»**: copia proyecto, máquina, concepto, fase y descripción del día anterior. Justificación real: el PDF de Ivan Cortés tiene 6 días seguidos con el mismo texto.
- Al entrar se abre **la semana en curso**, con navegación a anteriores y siguientes.

**Borrador local**
- **Sin caducidad**: dura hasta que se envíe o se descarte. Perder trabajo escrito es la vía más rápida a que el técnico vuelva al papel.
- **No viaja entre dispositivos**: el borrador es local. Sincronizarlo exigiría un motor offline completo, descartado por sobredimensionado para ~1 registro/técnico/día.
- **Conflicto borrador local vs. servidor: avisar y que el técnico elija**, mostrando ambas versiones. No decidir por él en silencio en ninguna dirección.
- **Guarda mientras escribe, con retardo** (unos cientos de ms tras dejar de teclear), no solo al salir del campo: si la app muere a mitad de una frase no se pierde.

**Alcance de proyectos y máquinas**
- **El técnico elige de todos los proyectos activos.** No se crea tabla de asignación técnico↔proyecto: con ~15 técnicos y pocas obras simultáneas la lista es corta, y evita que alguien quede bloqueado porque nadie lo asignó.
- **Hay que relajar el permiso de listar proyectos** (hoy `A·S`) — aviso que dejó el plan 02-06. Pero un técnico ve **solo nombre y máquinas**: el valor de contrato y los días vendidos son información comercial que no necesita. Implica una proyección distinta por rol, no el mismo DTO.
- **Proyectos cerrados no aparecen** en la lista. Los días ya registrados contra uno cerrado se conservan y se ven.
- **La máquina sale de las asociadas al proyecto**, no del catálogo global — es lo que el admin cargó en la Fase 2 y lo que imprimirá la Nota.

**Ventana temporal**
- **No se puede registrar en el futuro**: hasta hoy inclusive. El Excel tenía 1.009 filas de fechas futuras precargadas que ensuciaban todas las agregaciones.
- **Hacia atrás: solo el mes en curso y el anterior.** Más antiguo exige intervención de un admin (no en esta fase).
- **Editable libremente mientras esté en borrador**, sin auditar cada cambio — es dato no confirmado. Al enviar queda en solo lectura, y eso es BIT-05 (Fase 4).
- **El duplicado por fecha lo hace imposible la grilla**: una fila por día, registrar sobre un día con dato es editarlo. La restricción única de la base es la red de seguridad, no la interfaz.

**Specifics**
- La fecha es **DATE local del sitio**, sin hora ni zona: el mismo día debe verse igual con el dispositivo en Bogotá, Roma o São Paulo. Nunca `new Date()` en el servidor para la fecha de trabajo.
- Conceptos sin proyecto (LR/NR/IL) se registran sin proyecto; un día de trabajo en obra sin proyecto se rechaza. La restricción `CHECK` por concepto ya existe en el esquema desde la Fase 2. ⚠️ **VERIFICADO FALSO — ver Hallazgo 1.**

### Claude's Discretion
- Diseño del indicador de borrador sin enviar y del aviso de conflicto.
- Cómo se presenta la navegación entre semanas.
- Formato de la clave de idempotencia y su ventana de validez.
- Textos ES/IT de los mensajes nuevos.

### Deferred Ideas (OUT OF SCOPE)
- Asignación técnico↔proyecto como tabla — solo si la lista de proyectos activos crece hasta molestar.
- Registrar más atrás del mes anterior (regularizar atrasos antiguos) — necesitaría una acción de admin.
- Sincronización del borrador entre dispositivos — descartada por diseño, no diferida.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Qué de esta investigación lo habilita |
|----|-------------|----------------------------------------|
| **BIT-01** | Técnico captura su semana en grilla de 7 días: proyecto, máquina, concepto, fase (Montaje/Collaudo), descripción | § Hallazgo 1 (**falta la columna `description`** — hay migración), § API mínima (`GET`/`PUT /api/daily-entries`), § Proyección por rol de `GET /api/projects`, § Máquina del proyecto (no del catálogo global) |
| **BIT-02** | Un registro por técnico por día — UNIQUE(técnico, fecha), fecha como DATE local del sitio (sin hora/tz) | § Contrato de fecha (las **dos reglas opuestas**, verificadas en 5 husos), § El `UNIQUE` ya existe como índice desde 01-01, § Test que no puede pasar por el motivo equivocado (Validation Architecture) |
| **BIT-03** | Conceptos sin proyecto (LR/NR/IL) permitidos vía project_id nullable + CHECK por concepto; sin proyecto centinela | § Hallazgo 1 (**el CHECK no existe** — hay migración), § Forma exacta del CHECK y su choque con la Fase 6 (Open Question 1) |
| **BIT-04** | Borrador persiste localmente (conectividad pobre en planta) y el envío es idempotente (Idempotency-Key) | § Idempotencia por clave natural (verificado: 8 upserts concurrentes → 1 fila, 0 errores), § localStorage vs IndexedDB, § Módulo `draft` puro y testable con `node --test` + `tsx` (cero dependencias nuevas) |
</phase_requirements>

---

## Summary

Esta fase parece «cablear dos pantallas al API» y no lo es. La investigación encontró **tres afirmaciones del CONTEXT que no se sostienen contra el esquema real** y **dos comportamientos de fecha exactamente opuestos entre cliente y servidor** que, si se confunden, producen el bug más caro del proyecto (PITFALLS §4: corrimiento de un día ya en producción = HIGH recovery cost, notas firmadas irrecuperables).

El resto es sorprendentemente barato: la idempotencia del criterio 4 **no necesita tabla de claves ni cabecera**, porque `UNIQUE(technician_id, date)` ya la da estructuralmente y se ha verificado que Prisma 7 la resuelve con `INSERT … ON CONFLICT` sin lanzar P2002 bajo concurrencia; el borrador local es `localStorage` y nada más; y la proyección por rol de `GET /api/projects` son dos constantes `select` y un `if`, con un test de fuga que cuesta tres líneas.

**Lo que hay que aceptar antes de planificar:** esta fase **tiene migración de esquema**. No es opcional y no es cosmética: sin ella BIT-01 no se puede cumplir (no hay dónde guardar la descripción) y BIT-03 no tiene motor (el CHECK que el CONTEXT da por hecho no existe).

### Los 3 hallazgos que cambian el plan

| # | Afirmación del CONTEXT | Realidad verificada | Consecuencia |
|---|---|---|---|
| **1a** | «`daily_entries` ya tiene todas sus columnas desde la Fase 2 — **No hace falta migración de esquema**» | `information_schema.columns` sobre la base real devuelve **14 columnas y ninguna es `description`**. BIT-01 exige «descripción» y el cuerpo de la Nota Semanal (Fase 5) la imprime en cada una de las 7 filas | **Migración obligatoria:** `ALTER TABLE daily_entries ADD COLUMN description TEXT` |
| **1b** | «La restricción `CHECK` por concepto ya existe en el esquema desde la Fase 2» | `pg_constraint` sobre `daily_entries` devuelve exactamente 5 filas: la PK y las 4 FKs. **Cero CHECK.** | **BIT-03 está sin motor.** El CHECK se escribe en esta fase, a mano, en una migración SQL versionada (Prisma no modela CHECK) |
| **2** | (implícito) el test estándar de husos es `TZ=Pacific/Kiritimati npm test` | En este entorno **la variable `TZ` del shell no llega al proceso Node**: `process.env.TZ` sale `undefined` y el offset sigue siendo el de Bogotá (300). La receta de PITFALLS §4 produciría un test **verde que no prueba nada** | Fijar `process.env.TZ` **en tiempo de ejecución** (sí funciona, y **cambia el huso varias veces dentro del mismo proceso**): un `it.each` de 4 husos en una sola suite |
| **3** | (implícito) el bug de fecha se vería en algún entorno | `new Date(y, m-1, d)` escribe el día correcto en **Bogotá (dev)** y en **UTC (Railway)**, y el día **anterior** en Roma y Kiritimati | El bug es **invisible en dev y en producción**. Solo lo caza el test con husos forzados o un guarda-rail de repo. Ninguna de las dos es opcional |

**Primary recommendation:** una migración (columna + CHECK + GRANT), **tres** endpoints (`GET` de la semana, `PUT` por día, `GET /api/projects` relajado con proyección de técnico), escritura **por día** con `upsert` sobre la clave natural, borrador en `localStorage` desde un módulo puro sin React, y **una** función de conversión de fecha en cada lado — con la regla escrita al lado, porque es opuesta.

---

## Standard Stack

### Core — cero dependencias nuevas

| Herramienta | Versión (ya instalada) | Para qué en esta fase | Por qué es la estándar aquí |
|---|---|---|---|
| Prisma 7 `upsert` sobre `@@unique([technicianId, date])` | 7.9.0 | Escritura idempotente del día | **Verificado:** 8 upserts concurrentes sobre la misma clave inexistente → 8×OK, **1 fila, 0 errores**. Prisma resuelve la ruta rápida con `INSERT … ON CONFLICT` |
| Postgres `DATE` + `@db.Date` | 16 | `daily_entries.date` | Ya está. Un día calendario no es un instante; ninguna conversión de huso puede romperlo |
| `CHECK` en migración SQL a mano | — | BIT-03 | Prisma no modela `CHECK`. Precedente del repo: las dos migraciones de RLS |
| `localStorage` | Web API | Borrador del criterio 4 | Síncrono (sobrevive a `pagehide`), sin plumbing async, ~5 MB de cuota para ~5 KB de datos |
| `<input type="date">` + `min`/`max` | HTML | Fecha y ventana temporal | El `value` es **`yyyy-mm-dd` y no depende de huso** (MDN, texto literal: *«includes the year, month, and day, but not the time»*). `min`/`max` deshabilitan fechas inválidas en el picker nativo |
| `setTimeout` + `clearTimeout` en un `useRef` | — | El «guarda mientras escribe, con retardo» | El repo ya tiene exactamente este patrón en `state.tsx` (`toastTimer`, `loadTimer`). Un `useDebounce` de librería son 6 líneas menos y una dependencia más |
| `node --test` + `tsx` | Node 22.17 / tsx 4.20 (ya en `node_modules`) | Primer test real del frontend | **Verificado ejecutándolo:** `node --import tsx --test <fichero>.ts` pasa. `tsx` ya está hoisted por los workspaces. **Cero dependencias nuevas** y el frontend deja de tener 0 % de cobertura ejecutable |

### Supporting

| Elemento | Para qué | Cuándo usarlo |
|---|---|---|
| `useApiData(cargar, deps)` + `ApiState` (02-06) | Carga/error de la semana y de los proyectos | Las dos pantallas nuevas. `setData` expuesto = la grilla refleja su propio `PUT` sin refetch |
| `state.dataVersion` / `refresh()` | Invalidar la semana tras guardar desde el drawer | Ya existe; no montar nada encima |
| `apiSend(path, 'PUT', body)` (02-06) | El `PUT` del día | Ya desenvuelve `message` del error del servidor |
| `CONCEPT_COLOR` de `i18n.ts` | Color del chip de concepto | Decoración, permitida por el guarda-rail. **Las etiquetas** vienen de `GET /api/catalogs` |

### Alternatives Considered

| En vez de | Se podría usar | Por qué NO aquí |
|---|---|---|
| `localStorage` | IndexedDB | Misma política de expulsión en WebKit (ITP borra **IndexedDB, localStorage, SessionStorage y Service Workers** tras 7 días sin interacción), así que no compra durabilidad. Y es asíncrono: una escritura en `pagehide` puede no completarse. Su ventaja (blobs, >5 MB, índices) no aplica a 7 filas de texto |
| `upsert` de Prisma | `$executeRaw` con `INSERT … ON CONFLICT` | El `upsert` **ya** compila a eso en esta forma (verificado bajo concurrencia). El raw solo sería necesario si el `create`/`update` llevara escrituras anidadas — que rompen la ruta rápida y devuelven la carrera |
| Tabla `idempotency_keys` + cabecera | Clave natural `(técnico, fecha)` | Ver § Don't Hand-Roll. La clave natural no caduca nunca; una tabla de claves tiene ventana de validez, TTL y un job de limpieza |
| `class-transformer` + `@Expose({ groups })` | Dos constantes `select` | Dependencia nueva, y la doctrina del repo ya es «**el `select` ES el contrato**» (02-05). Un `@Exclude` mal puesto filtra en silencio; un `select` que no nombra la columna, no |
| `vitest` + `jsdom` para el frontend | `node --test` + `tsx` sobre un módulo puro | 3 dependencias y un entorno DOM simulado para probar lógica que no necesita DOM. Si el borrador es un módulo puro, el DOM sobra |
| Endpoint batch `PUT /api/daily-entries/week` | `PUT /api/daily-entries/:date` (7 peticiones) | Ver § Batch vs. por día |

**Instalación:**
```bash
# Ninguna. `git diff package.json package-lock.json` debe salir vacío al cerrar la fase.
```

---

## Architecture Patterns

### API mínima de la fase

```
GET    /api/daily-entries?from=YYYY-MM-DD&to=YYYY-MM-DD    T·A·S   la semana del propio técnico
PUT    /api/daily-entries/:date                            T       upsert del día (idempotente)
DELETE /api/daily-entries/:date                            T       vaciar un día en borrador  [discrecional]
GET    /api/projects                                       +T      @Roles relajado + proyección reducida
```

**Reglas no negociables del contrato:**

1. **La fecha viaja en la URL, nunca en el cuerpo.** Un `PUT /api/daily-entries/2026-07-14` con `{ date: '2026-07-15' }` en el body es una fuente de verdad doble y un bug esperando. Si el body trae `date`, es un `400 FECHA_EN_EL_CUERPO` (mismo criterio que `RECURSO_APARTE` en 02-05).
2. **`technicianId` no se acepta jamás del cliente.** Sale de `req.user.technicianId`, que es de donde sale la GUC `app.technician_id` (02-04). Aceptarlo sería invitar al `403` de RLS o, peor, a un técnico escribiendo por otro si algún día la política se relaja.
3. **Sin vínculo usuario↔técnico, error explícito.** `req.user.technicianId == null` → la GUC vale `''`, `NULLIF(…,'')::uuid` es `NULL`, y la política `de_self` **filtra silenciosamente**: el `GET` devuelve `[]` y el `INSERT` devuelve `42501`. Hay que cortar antes con `409 USUARIO_SIN_TECNICO` — 02-04 lo dejó anotado literalmente («conviene que la pantalla lo diga en vez de mostrar una lista vacía»).
4. **La respuesta del `PUT` es una fila igual a las del `GET`.** Precedente exacto: el `PUT` de sold-days devuelve el `delta` recalculado para que el cliente no reste. Aquí, para que la grilla sustituya la fila sin refetch.
5. **Cada fila lleva `projectName` y `machineCode` denormalizados.** No es comodidad: la decisión bloqueada dice que un proyecto **cerrado no aparece en la lista** pero **los días ya registrados contra él se ven**. Sin el nombre en la fila, esos días se pintan con el proyecto en blanco.

### Pattern 1: El contrato de fecha — dos reglas OPUESTAS

**Lo que hace peligroso a esto no es la dificultad, es la simetría rota:** la conversión correcta en el cliente es exactamente la incorrecta en el servidor.

| Frontera | Correcto | Incorrecto | Verificado |
|---|---|---|---|
| Navegador → string | componentes **locales** (`getFullYear/getMonth/getDate`) o `toLocaleDateString('sv-SE')` | `toISOString().slice(0,10)` | Con `TZ=Europe/Rome`, `new Date(2026,6,14,0,30)` (= 14 jul 00:30 local) da **`2026-07-13`** por `toISOString`. `sv-SE`, `en-CA` y los getters locales dan `2026-07-14` en los 4 husos probados |
| Servidor: string → Postgres | `new Date('YYYY-MM-DD')` (ISO date-only ⇒ **se parsea como UTC** por especificación) | `new Date(y, m-1, d)` | La columna queda en `2026-07-14` con el proceso en Bogotá, Midway, Kiritimati, Roma y São Paulo. Con `new Date(y,m-1,d)`: **`2026-07-13` en Roma y Kiritimati** |
| Servidor: Postgres → string | `d.toISOString().slice(0,10)` **o** `to_char(date,'YYYY-MM-DD')` en SQL | `.getDate()`, `.toLocaleDateString()`, cualquier formateo local | Prisma devuelve el `DATE` como `Date` a **medianoche UTC**. `getUTCDate()` = 14 siempre; `getDate()` = **13 en Bogotá y São Paulo, 14 en Roma** |

**Consecuencia estructural (el hallazgo 3):** `new Date(y, m-1, d)` es correcto en Bogotá (offset +5, la máquina del dev) **y** en UTC (Railway). El bug no aparece en ninguno de los dos entornos donde alguien lo miraría.

**Cómo cerrarlo, no cómo esquivarlo:** que el objeto `Date` no exista fuera de un módulo. Un `fecha.ts` de 8 líneas en el backend con `aDate(s: string): Date` y `aTexto(d: Date): string`, y un `fecha.ts` en el frontend con `hoyLocal(): string` y `sumarDias(s, n): string` que operan **sobre strings**. Todo lo demás del módulo trata `YYYY-MM-DD` como lo que es: un string.

```ts
// backend/src/modules/daily-entries/fecha.ts
// Las DOS unicas conversiones del repo entre 'YYYY-MM-DD' y el Date que Prisma
// necesita para una columna @db.Date. Fuera de aqui, la fecha es un string.
//
// VERIFICADO contra el motor con TZ = Bogota | Midway | Kiritimati | Roma | Sao Paulo:
//   new Date('2026-07-14')      -> columna 2026-07-14 en los cinco
//   new Date(2026, 6, 14)       -> columna 2026-07-13 en Roma y Kiritimati  <<< el bug
//   fila.date.toISOString()     -> 2026-07-14T00:00:00.000Z en los cinco
//   fila.date.getDate()         -> 13 o 14 segun el huso del proceso        <<< el bug
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function aDate(s: string): Date {
  if (!ISO.test(s)) throw new BadRequestException('FECHA_INVALIDA');
  const d = new Date(s);                       // date-only ISO => UTC por especificacion
  if (Number.isNaN(d.getTime())) throw new BadRequestException('FECHA_INVALIDA');
  // '2026-02-30' pasa el regex y Prisma lo normalizaria a marzo en silencio.
  if (d.toISOString().slice(0, 10) !== s) throw new BadRequestException('FECHA_INVALIDA');
  return d;
}

export const aTexto = (d: Date): string => d.toISOString().slice(0, 10);
```

```ts
// frontend/src/lib/fecha.ts
// REGLA OPUESTA A LA DEL BACKEND, y es a proposito: aqui el dia que importa es el
// del CALENDARIO DEL DISPOSITIVO. toISOString() daria el dia anterior al este de UTC
// (verificado: 14/07 00:30 en Roma -> '2026-07-13').
export const hoyLocal = (ahora = new Date()): string =>
  [ahora.getFullYear(), String(ahora.getMonth() + 1).padStart(2, '0'),
   String(ahora.getDate()).padStart(2, '0')].join('-');

/** Aritmetica de calendario SOBRE STRINGS: Date solo aparece dentro y en UTC. */
export const sumarDias = (s: string, n: number): string => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Lunes de la semana ISO de `s`. Sobre UTC: inmune al huso y al DST. */
export const lunesDe = (s: string): string => {
  const d = new Date(s + 'T00:00:00Z');
  return sumarDias(s, -((d.getUTCDay() + 6) % 7));
};
```

### Pattern 2: Idempotencia por clave natural (no por cabecera)

`PUT /api/daily-entries/:date` es idempotente **por partida triple**:

1. **Semántica HTTP.** `PUT` con el estado completo del recurso: repetirlo converge.
2. **Motor.** `UNIQUE(technician_id, date)` existe desde `20260725220221_init` como índice único; una segunda fila para la misma fecha es imposible aunque el código falle.
3. **Ejecución.** Verificado: 8 `upsert` concurrentes de Prisma 7 sobre esa clave con la fila inexistente → **8 respuestas OK, 1 fila, ningún P2002**. Prisma emite la ruta rápida `INSERT … ON CONFLICT`.

⚠️ **La ruta rápida se pierde en silencio** si el `create` o el `update` llevan escrituras anidadas (`{ project: { connect: … } }`). Con escalares planos (`projectId`, `machineModelId`, …) se conserva. Escribir el `upsert` con IDs planos no es estilo: es lo que mantiene la garantía.

⚠️ **No se puede «capturar P2002 y reintentar» en este repo.** Verificado: dentro de una `$transaction`, un P2002 deja la transacción abortada y el `SELECT` siguiente ya falla (`P2039` al cerrar). Como `RlsInterceptor` envuelve **toda** la petición en una transacción, cualquier plan que dependa de recuperarse de un P2002 dentro del handler está roto de nacimiento. Es la misma doctrina que 02-03 («el duplicado se detecta con un `findUnique` PREVIO»), y aquí ni siquiera hace falta: el `upsert` no lanza.

### Pattern 3: Proyección por rol de `GET /api/projects`

Una ruta, **dos constantes `select`**, un `if` por rol. Nada de un segundo endpoint (lo prohíbe el CONTEXT) y nada de filtrar campos después de leerlos.

```ts
// projects.service.ts — junto a LISTA y DETALLE, que ya son «el contrato».
/**
 * Lo que ve un TECNICO. Es un `select` propio y no un subconjunto calculado de LISTA:
 * asi una columna nueva del esquema (o de LISTA) NO puede aparecer aqui sin que
 * alguien la escriba. contractValue / oaNumber / normalHours / currencyCode /
 * clientName son informacion comercial: la decision bloqueada dice «solo nombre y
 * maquinas».
 */
const LISTA_TECNICO = {
  id: true,
  name: true,
  machines: { select: { machineModel: { select: { id: true, code: true, description: true } } } },
} as const;

/** Solo ACTIVOS: «proyectos cerrados no aparecen en la lista» (decision bloqueada). */
async listarParaTecnico() {
  const filas = await this.prisma.client.project.findMany({
    where: { isActive: true },
    select: LISTA_TECNICO,
    orderBy: { name: 'asc' },
  });
  return filas.map(({ machines, ...p }) => ({
    ...p,
    machines: machines
      .map((m) => ({ machineModelId: m.machineModel.id, code: m.machineModel.code,
                     description: m.machineModel.description }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));
}
```

```ts
// projects.controller.ts — @Roles('A','S') sigue en la CLASE; solo el GET se relaja,
// igual que hizo 02-03 con GET /api/catalogs (el guard hace getAllAndOverride).
@Get()
@Roles('T', 'A', 'S')
listar(@CurrentUser() actor: UserModel) {
  const admin = actor.roles.some((r) => r === 'A' || r === 'S');
  return admin ? this.service.listar() : this.service.listarParaTecnico();
}
```

**Por qué el `if` va por `roles` y no por RLS:** la política `proj_read` es `USING (TRUE)` — RLS **no** oculta ni una columna ni un proyecto al técnico. El aislamiento comercial es de capa de servicio y hay que probarlo como tal.

**Cómo se prueba que no filtra** (§ Validation Architecture lo detalla): conjunto de claves exacto + una sonda sobre el JSON serializado completo. Las dos, porque cada una caza lo que la otra no.

### Pattern 4: El borrador local, como módulo puro

La lógica del borrador **no puede vivir dentro del componente**: sería la única parte del criterio 4 sin forma de probarse. Extraída a `frontend/src/lib/draft.ts`, sin React y sin tocar `window` directamente (recibe un `Storage`), es un módulo que `node --import tsx --test` ejecuta hoy mismo.

```ts
// frontend/src/lib/draft.ts
export interface Borrador { entries: Record<string, FilaDia>; savedAt: number }

/** Una clave por (tecnico, semana): dos semanas abiertas no se pisan. */
export const claveBorrador = (technicianId: string, lunes: string) =>
  `fava_draft_${technicianId}_${lunes}`;

/**
 * ponytail: try/catch en las dos direcciones. localStorage lanza en modo privado de
 * Safari y al pasarse de cuota; un borrador que no se puede guardar no puede tumbar
 * la pantalla de captura.
 */
export function guardar(st: Storage, clave: string, b: Borrador): boolean {
  try { st.setItem(clave, JSON.stringify({ ...b, savedAt: Date.now() })); return true; }
  catch { return false; }
}

export function leer(st: Storage, clave: string): Borrador | null {
  try { const raw = st.getItem(clave); return raw ? (JSON.parse(raw) as Borrador) : null; }
  catch { return null; }   // JSON corrupto de una version anterior: se ignora, no se explota
}

/**
 * Deteccion de conflicto BARATA: no compara campo a campo, compara la marca de tiempo
 * del servidor contra la del borrador. `updatedAt` del servidor > `savedAt` del
 * borrador significa que ese dia se escribio desde otro sitio DESPUES de que este
 * dispositivo guardara: hay dos versiones y decide el tecnico (decision bloqueada).
 */
export function enConflicto(b: Borrador, servidor: { date: string; updatedAt: string }[]): string[] {
  return servidor
    .filter((f) => b.entries[f.date] && Date.parse(f.updatedAt) > b.savedAt)
    .map((f) => f.date);
}
```

Consecuencia de contrato: **el `GET` de la semana tiene que devolver `updatedAt`**. Sin él, detectar el conflicto exige comparar los 5 campos de los 7 días, que es más código y da falsos positivos con espacios en blanco.

### Pattern 5: La ventana temporal — no es duplicación, son dos trabajos

Cliente y servidor calculan la ventana con reglas distintas **a propósito**:

| | Referencia de «hoy» | Fórmula | Trabajo |
|---|---|---|---|
| **Cliente** | su fecha local (`hoyLocal()`) | `max = hoy`; `min = primer día del mes anterior a hoy` | UX: `min`/`max` del `<input type="date">`, deshabilitar filas fuera de ventana, cortar la navegación de semanas |
| **Servidor** | UTC ± tolerancia de huso | `max = fecha(ahora + 14 h)`; `min = primer día del mes anterior a fecha(ahora − 12 h)` | Autoridad: rechaza |

**Por qué la tolerancia y no `America/Bogota`.** Si el servidor usara la fecha UTC a secas, un técnico en Turquía (UTC+3) a las 01:00 del día 1 mandaría una fecha que para el servidor todavía es «mañana» → `FECHA_FUTURA` con el técnico teniendo razón. Los offsets reales van de UTC−12 a UTC+14; con `+14 h` para el techo y `−12 h` para el suelo, **la ventana del servidor contiene siempre a la del cliente**, sin configuración, sin tabla de husos y sin `projects.timezone`. El coste es que un cliente malicioso puede escribir 1 día en el futuro — irrelevante frente al bloqueo de un técnico legítimo.

**La regla vive en una función pura del backend** (`ventana(ahora: Date): { min: string; max: string }`) que consumen la validación y —esto es lo que evita la deriva— **la respuesta del `GET` de la semana**, que devuelve `{ minDate, maxDate, entries }`. El cliente puede usar su propio cálculo para el `min`/`max` inmediato del input y **debe** usar el del servidor para decidir qué filas pinta bloqueadas. Si algún día las dos divergen, diverge en el lado seguro.

**Comportamiento en el límite de mes (hay que diseñarlo, no descubrirlo):**
- El 1 de septiembre la ventana es `2026-08-01 … 2026-09-01`. La semana del **27 de julio al 2 de agosto** queda **partida**: 5 días irregistrables y 2 registrables.
- La grilla tiene que pintar esos días **deshabilitados con motivo visible** («fuera de la ventana de registro; pídelo a un administrador»), no dejar que el técnico escriba y le reviente el guardado.
- Ese es también el peor día del mes para la adopción: conviene que el mensaje sea concreto y no un código de error crudo.

### Batch vs. por día: **por día**, y no está reñido con la mala señal

| | `PUT /:date` × 7 | `PUT /week` (batch) |
|---|---|---|
| Idempotencia | Gratis (clave natural por fila) | Hay que inventarla: la semana no tiene clave natural → **aquí sí haría falta `Idempotency-Key`** |
| Fallo parcial con señal intermitente | Los días que llegaron **se quedan**; el cliente reintenta solo los que faltan | Todo o nada: 6 días buenos se pierden porque el 7.º es inválido; o se inventa un formato de error por fila |
| Transacción-por-petición + RLS | 7 transacciones cortas | 1 transacción reteniendo una conexión de las 10 durante 7 escrituras (PITFALLS §2) |
| Forma de la UI | El drawer **edita un día**. 1 pantalla = 1 recurso | Obliga a acumular estado de la semana entera antes de poder guardar nada |
| Precedente del repo | `PUT /api/projects/:id/sold-days` es **una celda** por petición, con autoguardado | El propio 02-05 declara que no existe endpoint que reciba la matriz entera |

El lado batch que sí conviene es la **lectura**: `GET /api/daily-entries?from&to` devuelve los 7 días en una petición.

### Anti-Patterns to Avoid

- **`new Date()` en el servidor para la fecha de trabajo.** Prohibido por el CONTEXT y por PITFALLS §4. El único `new Date()` legítimo del backend en esta fase es el `ahora` de la ventana temporal, y su resultado nunca se escribe en `daily_entries.date`.
- **`.toISOString().split('T')[0]` en el frontend.** PITFALLS §4 lo lista como *warning sign* y esta investigación lo confirma con números. En el **backend**, sobre un `Date` que vino de una columna `@db.Date`, es correcto — y esa asimetría es justo por lo que las dos conversiones tienen que estar encerradas en un módulo con el porqué escrito al lado.
- **Filtrar campos comerciales después de leerlos** (`delete p.contractValue`, `omit`). El `select` es el contrato: lo que no se pide no se puede filtrar por error.
- **Un segundo endpoint `GET /api/projects/for-technician`.** Prohibido explícitamente por el CONTEXT y por 02-06.
- **Guardar el borrador en el `state` global de `state.tsx`.** Ese provider no persiste nada y ya se decidió que ninguna lista de dominio vive ahí. El borrador es de la pantalla y del `localStorage`.
- **Debounce por tecla que dispare el `PUT`.** El retardo es para el **borrador local** (decisión bloqueada). El `PUT` al servidor va cuando el técnico lo pide o al cerrar el drawer; escribir en la BD cada 300 ms es ruido en `updated_at` y, desde la Fase 4, en `audit_log`.
- **Escribir `role_type_id` inventándose un selector de rol.** BIT-01 no lo pide, y `ejecutados()` ya hace `COALESCE(de.role_type_id, t.role_type_id)`: dejarlo `NULL` es correcto y el maestro responde.

---

## Don't Hand-Roll

| Problema | No construyas | Usa | Por qué |
|---|---|---|---|
| Doble toque con señal intermitente | Tabla `idempotency_keys` + cabecera + TTL + job de limpieza | `PUT` sobre `UNIQUE(technician_id, date)` con `upsert` | La clave natural **no caduca**; la cabecera sí (el propio CONTEXT pregunta por «su ventana de validez»). Y ya está verificada bajo concurrencia. PITFALLS §14 lo dice con todas las letras: *«es la solución perezosa correcta — sin tabla de idempotency keys»* |
| «Un registro por técnico por día» | Comprobación en el servicio antes de escribir | El índice único que ya existe | Una comprobación previa tiene carrera; el índice no. Y el `upsert` no necesita ninguna de las dos |
| Aritmética de semanas ISO | `date-fns` / `dayjs` / `luxon` | 3 funciones sobre strings (`lunesDe`, `sumarDias`, `hoyLocal`) | Una librería de fechas es la forma más rápida de reintroducir objetos `Date` con huso local en un dominio que es puro calendario. 12 líneas, cero dependencias, y `setUTCDate` ya resuelve fin de mes y años bisiestos |
| Persistencia del borrador | Motor offline, service worker, cola de sync | `localStorage` + un módulo puro de ~40 líneas | Declarado **anti-feature** en FEATURES §F y en «Out of Scope». `UNIQUE(técnico,fecha)` + RLS hacen los conflictos de escritura estructuralmente imposibles salvo dos dispositivos del mismo técnico |
| Detección del conflicto local↔servidor | Diff campo a campo con normalización | `servidor.updatedAt > borrador.savedAt` | Una comparación de enteros contra cinco de strings con `trim`. Y responde la pregunta correcta («¿alguien escribió después que yo?»), no una aproximada |
| Proyección por rol | `class-transformer` + grupos | Dos `select` | Ver Alternatives |
| Bloquear fechas futuras en la UI | Validación a mano + máscara | `<input type="date" max={hoyLocal()}>` | El picker nativo deshabilita las fechas fuera de rango. El servidor valida igual — el `min`/`max` es UX, no seguridad |

**Key insight:** en este dominio la clave natural `(técnico, fecha)` es un regalo. Todo lo que en otras apps exige infraestructura (idempotencia, deduplicación, resolución de conflictos) aquí lo resuelve un índice único de la Fase 1. La tentación es construir la infraestructura igualmente porque el requisito escribió la palabra «Idempotency-Key».

---

## Common Pitfalls

### Pitfall 1: El test de husos que no prueba nada (el más probable de esta fase)

**Qué sale mal:** se escribe `TZ=Pacific/Kiritimati npm -w backend run test:e2e`, sale verde, se declara cerrado el criterio 2.
**Por qué pasa:** **verificado en este entorno** — el prefijo del shell no llega al proceso: `process.env.TZ` es `undefined` y `new Date().getTimezoneOffset()` sigue devolviendo `300` (Bogotá). Con `export TZ=…` tampoco. El test corrió **en Bogotá las cuatro veces**.
**Cómo evitarlo:** fijar `process.env.TZ` **en tiempo de ejecución**. Verificado que funciona y —esto es lo bueno— que **se puede cambiar varias veces dentro del mismo proceso**: `Intl` y `getTimezoneOffset()` responden al cambio inmediatamente. Un `it.each(['America/Bogota','Europe/Rome','America/Sao_Paulo','Pacific/Kiritimati'])` en **una sola suite** cubre el criterio entero.
**Señal de alarma:** el test de husos pasa a la primera y nadie sabe decir qué offset tenía el proceso. Añadir la aserción `expect(new Date().getTimezoneOffset()).toBe(<esperado>)` **dentro** del caso: si el huso no cambió, el test se cae por el motivo correcto.

### Pitfall 2: El corrimiento de un día que no se ve ni en dev ni en producción

**Qué sale mal:** `daily_entries.date` queda un día atrás para los técnicos en Italia, Grecia o Turquía. La Nota Semanal sale con un día menos, el KPI mensual mueve días de mes, y el `UNIQUE` deja de proteger la regla de negocio núcleo.
**Por qué pasa:** el dev está en Bogotá (UTC−5) y Railway en UTC. `new Date(y, m-1, d)` es **correcto en los dos** y solo falla al este de UTC. Nadie lo ve hasta que un italiano reclama.
**Cómo evitarlo:** las dos conversiones encerradas en `fecha.ts` + el test de husos del Pitfall 1 + un guarda-rail de repo al estilo de `check-no-free-text.mjs` que rechace `new Date(` con más de un argumento y `new Date()` sin argumentos dentro de `src/modules/daily-entries/`. Ese guarda-rail es la única red que funciona sin ejecutar nada.
**Coste de recuperación si llega a producción:** PITFALLS lo clasifica **HIGH** — *«regenerar las notas afectadas es imposible si ya están firmadas → requiere reapertura y re-firma con el cliente»*.

### Pitfall 3: El técnico sin vínculo ve una semana vacía y cree que perdió su trabajo

**Qué sale mal:** un usuario con rol T pero `users.technician_id = NULL` recibe `[]` en el `GET` y `42501` en el `PUT`. Sin mensaje, parece que la app le borró los días.
**Por qué pasa:** la GUC `app.technician_id` vale `''`, `NULLIF(…, '')::uuid` es `NULL`, y `technician_id = NULL` es `NULL` → la política filtra. **Es el comportamiento correcto de RLS y no produce ningún error.** 02-04 lo dejó probado y anotado.
**Cómo evitarlo:** cortar en el controlador con `409 USUARIO_SIN_TECNICO` y un texto ES/IT explícito. Un caso e2e con un usuario T sin vínculo.

### Pitfall 4: El `CHECK` de BIT-03 bloquea la migración de la Fase 6

**Qué sale mal:** se añade el `CHECK` estricto, la Fase 6 intenta insertar las **1.438 filas** que el Excel marca con el centinela «Sin Proyecto» y algunas llevan un concepto que exige proyecto → la migración del histórico se cae a mitad.
**Por qué pasa:** no se ha analizado qué conceptos llevan esas 1.438 filas y no hay extracto del Excel en el repo para comprobarlo.
**Cómo evitarlo:** Open Question 1 lo desarrolla. Sea cual sea la salida, el `CHECK` **no puede exigir `phase`**: todo el histórico entra con `phase = NULL` (está escrito en el propio `schema.prisma`). La fase se exige en la capa de servicio para las jornadas nuevas, nunca en el motor.

### Pitfall 5: El guarda-rail `check:no-free-text` no cubre las dos pantallas nuevas

**Qué sale mal:** `LogDayDrawer.tsx` importa hoy `CONCEPTS` de `i18n` y `MACHINES`/`LOG_PROJECTS` de `data.ts`. Esos son exactamente los dos `IMPORTS_VETADOS` del script — pero el script solo escanea las **7 pantallas del cutover de la Fase 2**. La fase puede cerrarse con el mock dentro y el build en verde.
**Cómo evitarlo:** añadir `screens/Week.tsx` y `components/LogDayDrawer.tsx` al array `ARCHIVOS` de `scripts/check-no-free-text.mjs` **en la misma tarea** que hace el cutover. Convierte «retiramos los mocks» en algo que el build de Railway comprueba.
**Agujero que queda abierto y hay que cerrar a mano:** `ConceptPill` (en `ui.tsx`) resuelve la etiqueta con `CONCEPTS.find(...)` de `i18n`, y `ui.tsx` no está —ni puede estar— en la lista (importa de `'./i18n'`, no de `'../i18n'`). `Week.tsx` heredaría las etiquetas cableadas sin que el script se entere. **Solución:** `ConceptPill` recibe `label` por prop y conserva solo el color de `CONCEPT_COLOR`.

### Pitfall 6: WebKit borra el borrador «sin caducidad»

**Qué sale mal:** la decisión bloqueada dice «sin caducidad», y en un iPhone el borrador desaparece.
**Por qué pasa:** ITP de WebKit borra **todo el almacenamiento escribible por script** (localStorage, IndexedDB, SessionStorage, Service Workers) tras **7 días de Safari en uso sin interacción con el sitio**. Cada visita reinicia el contador, y una app añadida a la pantalla de inicio lleva su propio contador.
**Impacto real:** bajo — un técnico que abre la app cada semana nunca lo alcanza, y **IndexedDB no lo evita** (está en la misma lista), así que tampoco es un argumento para cambiar de tecnología.
**Cómo tratarlo:** honestidad en el texto. «Sin caducidad» significa *nuestro código no lo borra*; el navegador puede. No prometer en la UI que el borrador es eterno.

### Pitfall 7: El `upsert` pierde su atomicidad al añadirle una escritura anidada

**Qué sale mal:** alguien cambia `{ projectId }` por `{ project: { connect: { id } } }` «porque es más Prisma». La ruta rápida `INSERT … ON CONFLICT` deja de aplicarse, vuelve el `find`-then-`write`, y el doble toque simultáneo produce un `P2002` que —verificado— **aborta la transacción de la petición** y ya no se puede recuperar.
**Cómo evitarlo:** el `upsert` con IDs escalares planos, con el comentario que dice por qué. El test de concurrencia (§ Validation Architecture) se pone rojo si alguien lo cambia.

---

## Code Examples

### Upsert del día (idempotente, verificado bajo concurrencia)

```ts
// daily-entries.service.ts
/**
 * PUT del dia. Idempotente por CLAVE NATURAL, no por cabecera:
 *  - `UNIQUE(technician_id, date)` existe desde 20260725220221_init
 *  - VERIFICADO: 8 upserts concurrentes sobre esta clave con la fila inexistente ->
 *    8 respuestas OK, 1 fila, cero P2002 (Prisma emite INSERT ... ON CONFLICT).
 *
 * OJO: la ruta rapida se pierde si `create`/`update` llevan escrituras ANIDADAS.
 * Por eso van IDs escalares planos y no `{ project: { connect: ... } }`. Y no hay
 * salida: un P2002 dentro de la $transaction del RlsInterceptor la deja abortada
 * (verificado: P2039 al cerrar), asi que no se puede capturar y reintentar aqui.
 */
async guardarDia(technicianId: string, fecha: string, d: DatosJornada) {
  const date = aDate(fecha);
  const fila = await this.prisma.client.dailyEntry.upsert({
    where: { technicianId_date: { technicianId, date } },
    create: { technicianId, date, status: 'draft', ...d },
    update: { ...d },
    select: FILA,
  });
  return this.plana(fila);
}
```

### La suite de husos que no puede pasar por el motivo equivocado

```ts
// test/daily-entries-fecha.e2e-spec.ts
/**
 * Criterio 2. `TZ=x jest` NO funciona en este repo (verificado: process.env.TZ llega
 * `undefined` y el offset sigue siendo el de Bogota). Se fija en tiempo de ejecucion,
 * que si funciona y ademas admite cambiarlo varias veces en el mismo proceso.
 */
const HUSOS: [zona: string, offsetEsperado: number][] = [
  ['America/Bogota', 300], ['Europe/Rome', -120],
  ['America/Sao_Paulo', 180], ['Pacific/Kiritimati', -840],
];

describe.each(HUSOS)('servidor en %s', (zona, offsetEsperado) => {
  beforeAll(() => { process.env.TZ = zona; });
  afterAll(() => { process.env.TZ = 'America/Bogota'; });

  it('el huso del proceso cambio de verdad', () => {
    // Sin esto, los 4 casos correrian en Bogota y pasarian sin probar nada.
    expect(new Date().getTimezoneOffset()).toBe(offsetEsperado);
  });

  it('PUT 2026-07-14 deja EXACTAMENTE 2026-07-14 en la columna', async () => {
    await request(app.getHttpServer())
      .put('/api/daily-entries/2026-07-14')
      .set('authorization', `Bearer ${tokenTecnico}`)
      .send({ conceptCode: 'LR', description: 'Descanso' })
      .expect(200);

    // Se lee con to_char, NO con el objeto Date: un Date leido con getDate() da 13 o
    // 14 segun el huso y el test estaria comprobando el formateador, no la columna.
    const [{ s }] = await ownerClient.$queryRaw<{ s: string }[]>`
      SELECT to_char(date,'YYYY-MM-DD') AS s FROM daily_entries
       WHERE technician_id = ${TEC_A}::uuid`;
    expect(s).toBe('2026-07-14');
  });
});
```

**Verificación en rojo obligatoria** (el plan debe registrarla): sustituir `new Date(s)` por `new Date(y, m-1, d)` en `fecha.ts`. Medido contra el motor — tumba **los casos de Roma y Kiritimati** (columna `2026-07-13`) y deja verdes los de Bogotá y São Paulo. Si tumba los cuatro o ninguno, el test está mal.

### El test de fuga comercial (dos aserciones, cada una caza lo que la otra no)

```ts
it('un tecnico NO ve dato comercial en GET /api/projects', async () => {
  await ownerClient.project.update({
    where: { id: proyecto.id },
    data: { contractValue: 4150000.5, oaNumber: 'OA-SECRETO', normalHours: 9 },
  });

  const res = await request(app.getHttpServer())
    .get('/api/projects').set('authorization', `Bearer ${tokenTecnico}`).expect(200);

  // 1. Conjunto EXACTO de claves: una columna nueva en el select se ve aqui.
  expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'machines', 'name']);

  // 2. Sonda sobre el JSON entero: caza la fuga ANIDADA que el conjunto de claves de
  //    primer nivel no ve (p. ej. dentro de `machines`).
  const cuerpo = JSON.stringify(res.body);
  for (const secreto of ['4150000', 'OA-SECRETO', 'contractValue', 'soldDays'])
    expect(cuerpo).not.toContain(secreto);
});
```

### CHECK de BIT-03 (migración SQL a mano)

```sql
-- BIT-03. Prisma no modela CHECK: migracion a mano y versionada, como las de RLS.
-- Idempotente porque migrate dev la reejecuta contra la shadow database.
--
-- Los 5 conceptos de trabajo exigen proyecto; LR/NR/IL quedan LIBRES (pueden llevarlo
-- o no) — es lo que dice FEATURES §H. concept_code IS NULL se admite porque la columna
-- es nullable por diseno (Fase 6).
-- NO se exige `phase`: TODO el historico del Excel entra con phase = NULL. La fase se
-- valida en la capa de servicio para las jornadas nuevas.
ALTER TABLE "daily_entries" DROP CONSTRAINT IF EXISTS de_proyecto_por_concepto;
ALTER TABLE "daily_entries" ADD CONSTRAINT de_proyecto_por_concepto CHECK (
  concept_code IS NULL
  OR concept_code IN ('LR','NR','IL')
  OR project_id IS NOT NULL
);
```

### Autoguardado con retardo (el patrón que ya usa el repo)

```tsx
// El retardo es del BORRADOR LOCAL, no del PUT al servidor: escribir en la BD cada
// 300 ms envenena updated_at y, desde la Fase 4, el audit_log append-only.
const t = useRef<number | undefined>(undefined);
useEffect(() => {
  clearTimeout(t.current);
  t.current = window.setTimeout(() => guardar(localStorage, clave, { entries, savedAt: 0 }), 400);
  return () => clearTimeout(t.current);
}, [entries, clave]);

// Cierre brusco de la pestana: pagehide dispara donde beforeunload no (Safari iOS).
// localStorage es SINCRONO, asi que la escritura se completa; IndexedDB no lo garantiza.
useEffect(() => {
  const flush = () => guardar(localStorage, clave, { entries, savedAt: 0 });
  window.addEventListener('pagehide', flush);
  return () => window.removeEventListener('pagehide', flush);
}, [entries, clave]);
```

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Qué significa aquí |
|---|---|---|---|
| `Idempotency-Key` + tabla de claves para todo POST repetible | `PUT` idempotente sobre la clave natural cuando existe | Es la práctica de siempre; la cabecera (borrador IETF) se popularizó con las pasarelas de pago, donde **no hay** clave natural | BIT-04 se cumple mejor sin la cabecera. La clave natural no tiene ventana de validez |
| Réplica offline + resolución de conflictos | Borrador local + escritura idempotente | Dynamics 365 FS sigue resolviendo conflictos **a nivel de registro, no de campo**, con «gana el técnico» y un panel de errores de sync que un admin cura | Ya declarado anti-feature. Confirmado |
| `TZ=... npm test` para probar husos | `process.env.TZ` en runtime | Node ≥16 reacciona al cambio de `process.env.TZ` en caliente | **En este entorno la primera forma no funciona en absoluto.** No es una preferencia |
| `date-fns`/`moment` para todo lo que huela a fecha | Strings `YYYY-MM-DD` + `setUTCDate` cuando el dominio es calendario | — | Una librería de fechas aquí es la vía más corta a reintroducir husos en un dominio que no los tiene |
| Sin runner de tests en el frontend (decisión Fase 1) | `node --test` + `tsx` sobre módulos puros | `node:test` es estable desde Node 20 | **Verificado ejecutándose en este repo.** Cero dependencias nuevas y el criterio 4 deja de depender de una prueba manual |

**Deprecado / a retirar en esta fase:**
- `data.ts`: `MACHINES`, `LOG_PROJECTS`, `WEEK`, `CURRENT_TECH` (los cuatro llevan «Fase 3» escrito en la tabla de `data.ts`). Quedan `NOTES`, `EXPENSES`, `AUDIT` para la Fase 4.
- `ConceptPill` resolviendo la etiqueta desde `i18n` (Pitfall 5).
- `Week.tsx` actual: el bloque de firma y el de gastos que tiene hoy son **de la Fase 4/5**, no de esta. Cablear la grilla no obliga a cablearlos; conviene decidir explícitamente si se quedan como maqueta o se retiran del render mientras tanto.

---

## Open Questions

1. **¿Qué conceptos llevan las 1.438 filas del centinela «Sin Proyecto»?**
   - *Lo que sabemos:* el Excel usa «Sin Proyecto» en 1.438 filas (02-RESEARCH §calidad de datos) y `project_id` es nullable justamente por eso. LR/NR/IL están exentos del CHECK propuesto.
   - *Lo que no sabemos:* si alguna de esas filas lleva DC/MD/DFD/DVSF/DVRC. Si las lleva, el CHECK estricto **bloquea la migración de la Fase 6**, que corre en paralelo con las Fases 3-5.
   - *Recomendación:* poner el CHECK **estricto** ahora (es lo que BIT-03 pide y lo que el criterio 3 del roadmap prueba) y dejar anotado en `deferred-items.md` para la Fase 6 que su cuarentena `migration_rejects` tiene que contemplar este caso. Si en la Fase 6 aparecen filas irreconciliables, la salida honesta es la cuarentena (PITFALLS §6: *«nada se inventa»*), **no** relajar el CHECK bajo presión. La alternativa —eximir el histórico con `OR source_row IS NOT NULL`— está disponible pero convierte la garantía en condicional y no debe tomarse por adelantado.

2. **¿Puede un `MD` repartirse entre 2 proyectos?** (bloqueante declarado para esta fase en STATE.md)
   - *Lo que sabemos:* pendiente de FAVA. La recomendación de FEATURES §D es **no** en v1.
   - *Lo que no sabemos:* si ocurre en la operación real.
   - *Recomendación:* construir sobre `UNIQUE(técnico, fecha)` sin condicionales. Toda la idempotencia de esta fase descansa en esa clave; si FAVA dice que sí, cambia el modelo, y es más barato cambiarlo con la fase cerrada que construir hoy una abstracción para una regla hipotética.

3. **¿Puede el técnico *vaciar* un día ya registrado?**
   - *Lo que sabemos:* «editable libremente mientras esté en borrador». La grilla hace imposible el duplicado, pero un día registrado por error solo se puede *cambiar*, no *quitar*.
   - *Recomendación:* incluir `DELETE /api/daily-entries/:date` restringido a `status = 'draft'` y a la ventana temporal. Son ~10 líneas, cae dentro de la libertad de edición que la decisión bloqueada concede, y sin él la única salida del técnico es dejar un día falso. Marcado como discrecional: si el plan lo omite, que lo omita **diciéndolo**.

4. **¿Se rechaza escribir contra un proyecto desactivado?**
   - *Lo que sabemos:* «proyectos cerrados no aparecen en la lista» y «los días ya registrados se conservan y se ven».
   - *Lo que no sabemos:* qué pasa al **editar** un día cuyo proyecto se cerró después.
   - *Recomendación:* rechazar en la escritura (`400 PROYECTO_INACTIVO`) y permitir la lectura. Consecuencia que hay que aceptar y que la UI debe explicar: para editar la descripción de ese día, el técnico tiene que cambiar de proyecto o pedir al admin que reabra el proyecto. Alternativa más blanda: permitir si el `projectId` **no cambia**. Es una línea más y evita un callejón sin salida; la decisión es de producto.

5. **`created_at` / `updated_at` son `timestamp without time zone`, no `timestamptz`.**
   - *Lo que sabemos:* verificado en `information_schema`. Es el default de Prisma. PITFALLS §4 pide `timestamptz` para los instantes.
   - *Impacto en esta fase:* ninguno — la detección de conflicto compara dos marcas producidas por el mismo servidor. Sí importa para el expediente de firma de la Fase 5 (*«timestamp de servidor»* como evidencia).
   - *Recomendación:* **no tocarlo aquí.** Anotarlo en `deferred-items.md` con dueño = el plan de la Fase 5.

---

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|---|---|
| Framework backend | Jest 30 + supertest 7 (`test/jest-e2e.json`, `--runInBand`) |
| Framework frontend | **Ninguno hoy.** Wave 0 lo resuelve con `node --test` + `tsx` (ya instalados) — **verificado ejecutándose** |
| Config | `backend/test/jest-e2e.json` (e2e) · `backend/package.json > jest` (unit, `rootDir: src`) |
| Comando rápido | `npm -w backend run test:e2e -- daily-entries` (< 30 s) |
| Suite completa | `npm -w backend run test:e2e` (hoy 14 suites / 269 tests) + `npm run build` en la raíz (incluye `check:no-free-text`) |
| Precondición | Postgres local en 55432 con `db:bootstrap` corrido. **Las suites no se pueden paralelizar entre procesos** (`truncateAll()` es global) — riesgo abierto conocido |

### Phase Requirements → Test Map

| Req | Comportamiento | Tipo | Comando automatizado | ¿Existe? |
|---|---|---|---|---|
| BIT-01 | Los 5 campos del día se guardan y se releen idénticos (`description` incluida) | e2e | `npm -w backend run test:e2e -- daily-entries` | ❌ Wave 0 |
| BIT-01 | La máquina tiene que ser **del proyecto**: una del catálogo global no asociada → 400 | e2e | ídem | ❌ Wave 0 |
| BIT-01 | Un técnico ve `GET /api/projects` con exactamente `{id, name, machines}` y **cero** dato comercial | e2e | `… -- projects` | ❌ Wave 0 |
| BIT-02 | Dos `PUT` a la misma fecha → **1 fila** (segundo edita, no duplica) | e2e | `… -- daily-entries` | ❌ Wave 0 |
| BIT-02 | La columna contiene **exactamente** el string enviado, con el proceso en 4 husos | e2e | `… -- daily-entries-fecha` | ❌ Wave 0 |
| BIT-02 | Ningún `new Date()` sin argumentos ni `new Date(y,m,d)` en el módulo de bitácora | script | `node scripts/check-fecha-servidor.mjs` | ❌ Wave 0 |
| BIT-03 | `LR`/`NR`/`IL` sin proyecto → 201/200; `DC` sin proyecto → **rechazado por el motor** (23514) | e2e | `… -- daily-entries` | ❌ Wave 0 |
| BIT-03 | El `CHECK` existe en `pg_constraint` (introspección, no endpoint) | e2e | `… -- no-free-text` (ampliar) | ⚠️ suite existe, falta el caso |
| BIT-04 | 8 `PUT` idénticos concurrentes → 8×200 y **1 fila** | e2e | `… -- daily-entries` | ❌ Wave 0 |
| BIT-04 | `draft.ts`: guardar → leer → detectar conflicto; cuota agotada no lanza | unit | `node --import tsx --test frontend/src/lib/draft.test.ts` | ❌ Wave 0 |
| BIT-04 | `fecha.ts` del cliente: `hoyLocal()` correcto en 4 husos | unit | `node --import tsx --test frontend/src/lib/fecha.test.ts` | ❌ Wave 0 |
| — | Ventana temporal: futuro → 400; mes−2 → 400; primer día del mes anterior → OK | e2e | `… -- daily-entries` | ❌ Wave 0 |
| — | Usuario T sin `technician_id` → 409 con código, no `[]` | e2e | `… -- daily-entries` | ❌ Wave 0 |
| — | `Week.tsx` y `LogDayDrawer.tsx` sin mocks ni catálogos cableados | script | `npm run check:no-free-text` (ampliar `ARCHIVOS`) | ⚠️ script existe, faltan los 2 ficheros |
| — | Criterio 5 (las pantallas contra el API real) | manual | Sonda documentada contra el backend local, como hizo 02-06 | manual-only: el frontend no tiene runner de integración y montar uno es una fase entera |

### Los dos criterios más fáciles de falsear, y cómo se cierran

**Criterio 2 (huso) — se falsea de tres formas distintas:**

| Falsificación | Por qué pasa desapercibida | Qué la impide |
|---|---|---|
| `TZ=x jest` | **Verificado: no cambia nada en este entorno.** El test corre en Bogotá y pasa | Fijar `process.env.TZ` en runtime **+ aserción del offset dentro del caso** |
| Leer la fecha con `fila.date` y compararla con el `Date` que mandó el test | Los dos objetos coinciden aunque la columna esté mal | Leer con `to_char(date,'YYYY-MM-DD')` por SQL crudo y comparar contra el **string** original |
| Probar solo Bogotá y UTC | Son precisamente los dos husos donde el bug **no** se manifiesta | Los 4 husos, con Roma o Kiritimati obligatorios |

**Verificación en rojo exigible al plan:** mutar `aDate` a `new Date(y, m-1, d)` debe tumbar **exactamente los casos de Roma y Kiritimati**. Está medido contra el motor: Bogotá y São Paulo siguen verdes. Un test que tumbe los 4 (o ninguno) no está probando el huso.

**Criterio 4 (borrador + idempotencia) — se falsea de dos formas:**

| Falsificación | Qué la impide |
|---|---|
| «El doble toque no duplica» probado con dos peticiones **secuenciales** — que pasa trivialmente por el `upsert` | `Promise.all` de **8 peticiones simultáneas** con la fila inexistente, contando filas al final. Es la única forma en que la carrera aparece, y ya está medida: 8×OK, 1 fila |
| «El borrador persiste» comprobado a ojo en el navegador | La lógica en un módulo puro con `Storage` inyectable + `node --test`. Un test que no puede tocar `window` no puede mentir sobre `window` |

Añadir un caso de **cuota agotada** (un `Storage` falso cuyo `setItem` lanza `QuotaExceededError`): `guardar()` devuelve `false` y no propaga. Es el modo de fallo real de Safari en modo privado y es el que dejaría la pantalla de captura en blanco.

### Sampling Rate

- **Por commit de tarea:** `npm -w backend run test:e2e -- <suite de la tarea>` + `npx tsc --noEmit` en el workspace tocado.
- **Por merge de wave:** `npm -w backend run test:e2e` completo (`--runInBand`; **no paralelizar entre procesos**) + `npm run build` en la raíz (arrastra `check:no-free-text`) + los tests de `node --test` del frontend.
- **Puerta de fase:** suite completa verde + los dos guarda-raíles de repo en verde + `npm -w backend run db:seed` para reponer al Super Admin que `truncateAll()` se lleva.

### Wave 0 Gaps

- [ ] `backend/prisma/migrations/<ts>_bitacora/migration.sql` — `description` + `CHECK` + `GRANT` a `fava_app`. **Sin ella BIT-01 y BIT-03 no se pueden ni intentar.** Receta del repo: `prisma migrate diff --from-config-datasource --to-schema … --script -o …` y luego `migrate deploy` (**`migrate dev` aborta en entorno no interactivo**)
- [ ] `backend/test/daily-entries.e2e-spec.ts` — BIT-01, BIT-02 (unicidad), BIT-03, BIT-04 (concurrencia), ventana temporal, usuario sin técnico
- [ ] `backend/test/daily-entries-fecha.e2e-spec.ts` — suite de husos aparte, porque manipula `process.env.TZ` global y no debe contaminar a las demás
- [ ] Ampliar `backend/test/projects.e2e-spec.ts` — los dos casos de proyección de técnico
- [ ] Ampliar `backend/test/no-free-text.e2e-spec.ts` — `de_proyecto_por_concepto` en `pg_constraint`
- [ ] `frontend/src/lib/draft.ts` + `draft.test.ts` y `frontend/src/lib/fecha.ts` + `fecha.test.ts` — módulos puros
- [ ] `frontend/package.json` (o raíz): script `test` = `node --import tsx --test src/lib/*.test.ts`, enganchado al `npm run build` de la raíz igual que `check:no-free-text`
- [ ] `scripts/check-fecha-servidor.mjs` — el guarda-rail del Pitfall 2 (única red que funciona sin ejecutar nada, porque el bug no aparece ni en dev ni en Railway)
- [ ] `scripts/check-no-free-text.mjs` — añadir `screens/Week.tsx` y `components/LogDayDrawer.tsx` a `ARCHIVOS`
- [ ] Instalación de framework: **ninguna**. `node --test` y `tsx` ya están

---

## Sources

### Primary (HIGH confidence) — verificado contra el motor y el runtime de ESTE repo

Probes ejecutados el 2026-07-26 contra el Postgres local (puerto 55432) y Node 22.17, retirados después (`git status` limpio):

- **Columnas y constraints reales de `daily_entries`** — `information_schema.columns` (14 columnas, ninguna `description`) y `pg_constraint` (5 filas: PK + 4 FKs, **cero CHECK**)
- **Round-trip de `@db.Date`** con `TZ` = Bogotá / Midway / Kiritimati / Roma / São Paulo: `new Date('YYYY-MM-DD')` → columna correcta en los 5; `new Date(y,m-1,d)` → **un día menos en Roma y Kiritimati**; `.toISOString()` correcto en los 5; `.getDate()` incorrecto en 2 de 5
- **`process.env.TZ`**: el prefijo del shell **no llega** (`undefined`, offset 300); asignado en runtime **sí** funciona y admite varios cambios en el mismo proceso
- **Concurrencia del `upsert`**: 8 simultáneos sobre `(technician_id, date)` inexistente → 8×OK, 1 fila, 0 errores. Mismo resultado con `INSERT … ON CONFLICT` crudo
- **P2002 dentro de `$transaction`**: deja la transacción abortada (`P2039` al cerrar); el `SELECT` posterior ya no se puede ejecutar
- **`node --import tsx --test <fichero>.ts`**: pasa (TAP 13, 1/1), con `tsx` hoisted por los workspaces
- **Formateo de fecha local en cliente**: `toISOString()` falla en Roma y Kiritimati; `sv-SE`, `en-CA` y los getters locales aciertan en los 4 husos

Fuentes internas del repo (HIGH):
- `backend/prisma/migrations/{20260725220221_init,20260725221504_rls,20260726122455_maestros,20260726123024_rls_maestros}/migration.sql`
- `backend/src/common/prisma/rls.interceptor.ts` · `src/modules/projects/{projects,sold-days}.{controller,service}.ts` · `src/modules/catalogs/catalogs.controller.ts`
- `backend/test/helpers/{db,fixtures,app}.ts` · `test/jest-e2e.json` · `scripts/check-no-free-text.mjs`
- `frontend/src/{state.tsx,data.ts,ui.tsx,types.ts}` · `src/lib/api/{client,useApiData}.ts` · `src/screens/Week.tsx` · `src/components/LogDayDrawer.tsx`
- `.planning/phases/01-*/01-02-SUMMARY.md` · `.planning/phases/02-*/02-0{1,4,5,6}-SUMMARY.md` · `.planning/research/{FEATURES,PITFALLS}.md`

Documentación oficial (HIGH):
- MDN — `<input type="date">`: el `value` es `yyyy-mm-dd`, *«includes the year, month, and day, but not the time»*; `min`/`max` invalidan y bloquean el envío nativo — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date
- PostgreSQL — Row Security Policies (bypass del dueño, `FORCE ROW LEVEL SECURITY`) — https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Prisma — Transactions (defaults `maxWait 2000ms` / `timeout 5000ms`) — https://www.prisma.io/docs/orm/prisma-client/queries/transactions

### Secondary (MEDIUM confidence) — WebSearch contrastado con fuente primaria

- WebKit ITP: borrado de **todo el almacenamiento escribible por script** (localStorage, IndexedDB, SessionStorage, Service Workers) tras 7 días de Safari en uso sin interacción; el contador se reinicia en cada visita; las apps en pantalla de inicio llevan contador propio — https://support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage · https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519 · https://www.theregister.com/2020/03/26/apple_relax_were_not_totally/
- Dynamics 365 Field Service — conflictos offline a nivel de tabla, «gana el cliente» por defecto (vía PITFALLS §Offline, fuente oficial Microsoft Learn act. 2026-07-22)

### Tertiary (LOW confidence) — marcado para validación

- **La ruta rápida `INSERT … ON CONFLICT` del `upsert` de Prisma no está documentada como contrato estable.** Está *verificada empíricamente* en Prisma 7.9.0 con `@prisma/adapter-pg`, con la forma exacta que usará esta fase. Se degrada a `find`-then-`write` con escrituras anidadas. **Mitigación:** el test de 8 peticiones concurrentes es la regresión permanente; si una actualización de Prisma cambia el comportamiento, se pone rojo.
- **El reparto de conceptos de las 1.438 filas «Sin Proyecto»** no se ha podido verificar (no hay extracto del Excel en el repo). Es la única incógnita que puede obligar a revisar la forma del CHECK — ver Open Question 1.

---

## Metadata

**Confidence breakdown:**

| Área | Nivel | Razón |
|---|---|---|
| Contrato de fecha (BIT-02) | **HIGH** | 5 husos × escritura y lectura, contra el Postgres real. Se conocen las dos formas correctas, las tres incorrectas y **exactamente qué casos deben caer** al mutar el código |
| Estado real del esquema | **HIGH** | Introspección de `information_schema` y `pg_constraint` sobre la base, no lectura de `schema.prisma` |
| Idempotencia (BIT-04) | **HIGH** | Concurrencia medida (8 simultáneos) por las dos vías, más el comportamiento del P2002 dentro de la transacción del interceptor |
| Herramienta de test del huso | **HIGH** | El fallo del método estándar está reproducido; el que funciona, verificado incluso con cambios múltiples en el mismo proceso |
| Proyección por rol | **HIGH** | Patrón ya establecido en el repo (`@Roles` de clase relajado en el método, `select` como contrato); solo se aplica |
| Ventana temporal | **MEDIUM** | La aritmética es trivial y la tolerancia de ±14 h/−12 h es derivada del rango real de offsets UTC, no observada en un producto comparable. El comportamiento en el límite de mes es una consecuencia de diseño que conviene enseñar a FAVA antes de construirla |
| Borrador local | **MEDIUM-HIGH** | La elección (localStorage) es clara y las cuotas/expulsión están contrastadas; el diseño de la detección de conflicto por `updatedAt` es recomendación propia, no práctica observada |
| CHECK de BIT-03 vs. Fase 6 | **MEDIUM** | La forma del CHECK es HIGH; su compatibilidad con las 1.438 filas históricas no se puede verificar hoy (Open Question 1) |

**Research date:** 2026-07-26
**Valid until:** 2026-08-25 (30 días — stack estable y pineado). Los hallazgos verificados contra el motor no caducan mientras no cambie la versión de Prisma; el único que revisaría antes es la ruta rápida del `upsert` si se actualiza Prisma.
