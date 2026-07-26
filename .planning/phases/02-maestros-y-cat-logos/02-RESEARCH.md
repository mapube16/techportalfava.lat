# Phase 2: Maestros y catálogos — Research

**Researched:** 2026-07-25
**Domain:** Modelo de datos de maestros (Postgres/Prisma 7) · RLS sobre tablas de catálogo · CRUD NestJS 11 · cutover de 5 pantallas React 18 · autoguardado por celda
**Confidence:** HIGH en el modelo de datos, en el encabezado real de la Nota y en la evidencia del Excel (fuentes primarias leídas en esta sesión). HIGH en las reglas de RLS (doc de PostgreSQL citada textualmente). MEDIUM en dos puntos marcados: serialización de `Decimal` en Prisma 7 y comportamiento del diff de Prisma frente a índices parciales escritos a mano.

> Convención: encabezados en inglés (plantilla GSD), contenido en español — igual que `01-RESEARCH.md`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Matriz de días vendidos (rol × fase)**
- **Autoguardado por celda**: cada celda persiste al salir del campo, sin botón Guardar. Implica indicador visual de guardado y manejo de error por celda (revertir + avisar si falla).
- **Bajar vendidos por debajo de lo ejecutado se permite**, y el delta se muestra en negativo. Es un hecho real del negocio (el proyecto se pasó de lo vendido); ocultarlo falsearía el KPI que justifica el proyecto.
- **Editable por Admin y Super Admin**, coherente con la matriz §6 del documento de requerimientos ("crear y editar proyectos (y días vendidos)" es capacidad de Admin).
- **Las tres columnas existen desde esta fase**: vendido (editable), ejecutado (calculado, sale 0 hasta que exista bitácora en Fase 3) y delta (calculado, nunca digitable). Evita rehacer la pantalla después.

**Catálogos**
- **Conceptos de jornada (DC/MD/DFD/DVSF/DVRC/LR/NR/IL): códigos y semántica FIJOS**; el Super Admin solo puede editar las **etiquetas visibles** en ES/IT. No se pueden añadir ni eliminar conceptos — la lógica de KPIs, la Nota y la migración dependen de esos códigos exactos.
- **Roles técnicos: ABM completo** por Super Admin. El Excel tenía 11 variantes reales y FAVA puede necesitar más especialidades. Consecuencia de diseño: **las filas de la matriz vendido/ejecutado se generan desde este catálogo**, no están cableadas.
- **Monedas: ABM simple** (código y símbolo). Sin tasas de cambio — fuera de alcance.
- **Regla transversal: desactivar, nunca borrar.** Un elemento de catálogo en uso deja de ofrecerse en formularios nuevos, pero los registros históricos lo siguen mostrando. Misma regla ya aplicada a técnicos y usuarios en Fase 1.

**Máquinas**
- **Catálogo global de modelos + selección por proyecto.** El Super Admin mantiene la lista de modelos que FAVA fabrica; cada proyecto elige cuáles se instalan. Habilita el KPI "días por máquina" del documento §07 y elimina la causa raíz del Excel (texto libre con separadores mixtos).
- **Cada máquina lleva código + descripción libre**, siguiendo la tabla `machines` del CONTEXTO §10.
- **Selección con botones tipo chip** (marcar/desmarcar), como el prototipo actual: cómodo en móvil y suficiente con pocos modelos.
- **Quitar una máquina de un proyecto con jornadas registradas: se avisa y se permite.** Deja de ofrecerse en capturas nuevas; las jornadas históricas conservan su máquina.

### Claude's Discretion

No discutido — aplicar por coherencia con lo anterior y decidir durante planning:

- **Borrado vs. desactivación de proyectos y técnicos**: misma regla que catálogos — desactivar siempre, nunca borrado físico ni cascade delete. Un proyecto sin ningún registro asociado puede ofrecer borrado real, pero no es obligatorio.
- Diseño del indicador de autoguardado, textos de error, validaciones de formato (NIT, n° de contrato), paginación/búsqueda en las listas.
- Orden de retirada de los mocks de `data.ts` pantalla por pantalla.

### Specific Ideas

- El campo **"Cargo durante la semana"** de la Nota real varía por semana y NO pertenece al maestro de técnicos. En esta fase el técnico lleva su rol por defecto; el override semanal se implementa en la Fase 4 (NOTA-09).
- Los campos de encabezado del proyecto deben ser **exactamente** los que imprime la Nota: cliente, NIT, localidad, suministro, n° de contrato, maquinaria, país.

### Deferred Ideas (OUT OF SCOPE)

- Override del "cargo durante la semana" en la nota — Fase 4 (NOTA-09).
- Número de serie / línea de la máquina instalada — solo si FAVA lo pide; hoy modelo + descripción basta.
- Tasas de cambio entre monedas — fuera de alcance del proyecto.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Soporte de esta investigación |
|----|-------------|-------------------------------|
| **CAT-01** | Catálogos cerrados: 8 conceptos, roles técnicos, monedas — sin texto libre | § Pattern 1 (enum de Postgres + tabla de etiquetas); § Pattern 2 (RLS: `concepts` sin política de INSERT/DELETE = el enum no puede derivar); § Validation Architecture (cómo se **demuestra** «sin texto libre»); Pitfalls 1 y 5 |
| **CAT-02** | Admin crea/edita técnicos (interno/externo, activo) sin cuenta Entra | § Data Model (`technicians` desacoplada de `users`; FK `users.technician_id`); § Pattern 6 (desactivar nunca borrar); Pitfall 3 (los UUID de test tienen que existir como técnicos); § Open Question 4 (vínculo usuario↔técnico es precondición de la Fase 3) |
| **CAT-03** | Proyectos con datos comerciales y de encabezado de Nota + máquinas asociadas | § Nota Semanal — encabezado real (mapa campo a campo extraído del PDF); § Data Model (`projects`, `project_machines`); § Pattern 5 (catálogo global de modelos); Pitfall 6 (el NIT del encabezado es el de FAVA) |
| **CAT-04** | Días vendidos por rol×fase; el delta nunca se digita | § Pattern 3 (filas generadas del catálogo); § Pattern 4 (autoguardado por celda con rollback); § Evidencia del Excel (delta = vendido − ejecutado, con negativos reales); Code Examples 3-5; Pitfall 4 (el prototipo tiene el signo invertido) |
| **CAT-05** | Admin gestiona usuarios (invitar, roles, activar/desactivar) | § API Surface (falta `POST /api/users`: Fase 1 solo dejó GET + los dos PATCH); reglas de escalada y anti-lockout ya resueltas en `users.service.ts` — reutilizar, no reescribir; § Open Question 4 (`PATCH /api/users/:id/technician`) |
</phase_requirements>

## Summary

Esta fase tiene poco riesgo tecnológico y mucho riesgo de **modelo**. No hay librerías nuevas que evaluar: el stack quedó fijado en la Fase 1 y todo lo que esta fase necesita (Prisma 7, Nest 11, `apiFetch`, el interceptor RLS, los primitivos de UI) ya existe y funciona. Lo que sí puede costar una migración doble o un KPI indefendible son cuatro decisiones de datos, y las cuatro se pueden cerrar hoy porque **las fuentes primarias están en el repo y las leí**: el PDF real de la Nota y el Excel de 14 hojas.

Los cuatro hallazgos que cambian el plan respecto de lo que asumen `CONTEXTO §10` y el prototipo:

1. **El «NIT» que imprime la Nota es el de FAVA, no el del cliente.** En el PDF, `NIT: 901137532-4` está en la columna del membrete (x≈103, y≈98), pegado a «FAVA LATINO AMERICA S.A.S.» y a la dirección de Bogotá; el bloque del cliente empieza en x≈257 con «Cliente:». El proyecto sí debe guardar un NIT (CAT-03 lo pide y los clientes colombianos lo tienen), pero la Fase 5 **no** puede enchufar `project.nit` en esa casilla o el documento saldría mal a un cliente.
2. **El delta es `vendido − ejecutado`, y el prototipo lo calcula al revés.** `ProjectDetail.tsx:35` hace `dn - s` y pinta rojo cuando sale negativo; el Excel real (hoja Resoconto, fila 39) tiene `20 | 332 | -312`, es decir vendido − ejecutado, negativo cuando el proyecto se pasó. La decisión bloqueada («el delta se muestra en negativo») solo es coherente con la convención del Excel.
3. **El rol técnico es dato de la jornada, no solo del maestro.** En el Excel, 5 de los 14 técnicos aparecen con más de un `Tipo`: Ivan Cortés trabaja como `Software` (652 filas) y como `Capo Elettricista` (78); Felipe Sena acumula `Auto Meccanico`, `Electtricista`, `Electrico` y `Aiuto`. Dos de esos casos son grafías (`Elettrico`/`Eletrico`), pero los otros son especialidades distintas de verdad. Si `daily_entries` no lleva `role_type_id`, la migración (Fase 6) pierde información y la matriz rol×fase de la Fase 7 no puede cuadrar contra el Resoconto. Es una columna, y es ahora o migrar dos veces.
4. **Las hojas diarias del Excel no tienen columna de fase.** `Montaggio`/`Collaudo` solo existen en las hojas de proyecto (el lado *vendido*). Todo el histórico entrará con `phase = NULL`, así que la columna debe ser nullable y la agregación de ejecutados necesita un bucket «sin fase» o el tablero mentirá por omisión.

Lo demás es ejecución conocida: ocho tablas nuevas en una migración, una migración SQL a mano para RLS (leer todos / escribir admin, con `concepts` sin política de INSERT ni DELETE para que el enum no pueda derivar), ~18 endpoints con el patrón de `users`, y el cutover de cinco pantallas que ya están construidas. Cero dependencias nuevas: ni React Query, ni codegen de OpenAPI, ni `class-validator` — cada una añadiría más código del que ahorra a esta escala, y las tres tienen su punto de reconsideración documentado abajo.

**Primary recommendation:** cerrar el esquema completo en **una sola migración de Prisma + una migración SQL de RLS**, antes de escribir un solo controlador — incluidas las columnas nuevas de `daily_entries` (`project_id`, `machine_model_id`, `concept_code`, `phase`, `role_type_id`) y los dos FKs que hoy faltan (`daily_entries.technician_id`, `users.technician_id`). Con el esquema cerrado, los módulos y el cutover de pantallas son mecánicos y paralelizables; con el esquema abierto, cada pantalla negocia su propio contrato y la Fase 6 migra dos veces.

## Nota Semanal — encabezado real (fuente de verdad para `projects`)

Extraído de `docs/Reporte 02 - Ivan Cortés - Grupo Bocel - Santiago, Republica Dominicana (1).pdf` con coordenadas, no con lectura lineal (el orden del texto engaña: el membrete y el bloque del cliente están intercalados).

| Etiqueta impresa | Valor en el ejemplo | x | Origen en el modelo |
|---|---|---|---|
| `FAVA LATINO AMERICA S.A.S.` | — | 68 | **Constante del membrete** |
| `NIT:` | `901137532-4` | 103 | **Constante del membrete (NIT de FAVA)** — *no* es el del cliente |
| dirección + `www.favalatinoamerica.com` | Av. 15 # 93 A – 84, Bogotá | 56 / 79 | Constante del membrete |
| `Cliente:` | `MOLINOS DEL VALLE DEL CIBAO` | 257 | `projects.client_name` |
| `Localidad:` | `Santiago de los Caballeros, Republica Dominicana` | 252 | `projects.locality` + `projects.country` (se imprimen unidos por `, `) |
| `Suministro:` | `Instalación Eléctrica` | 41 | `projects.supply` |
| `Contrato:` | `345500` | 325 | `projects.contract_number` |
| `Maquinaria:` | `Linea Pasta Larga 4500 Kg/h` | 41 | modelos seleccionados del proyecto, `description ?? code`, unidos por `, ` |
| `Cargo durante esta semana:` | `Supervisor Eléctrico` | 41 | **NO es del proyecto ni del maestro** → Fase 4 (NOTA-09) |
| `Técnico:` | `IVAN CORTÉS` | 41 | `technicians.full_name` |
| columna `NOTA` (una por día) | `345500` en las 7 filas | 118-522 | **el mismo `contract_number`** — no es un campo aparte |

Consecuencias directas para esta fase:

- `locality` y `country` son **dos columnas**, no una: KPI-04 pide «días por cliente y país» y una cadena única lo impide. La Nota las imprime concatenadas.
- `contract_number` es texto, no número (`345500` hoy, pero es un identificador; el Excel usa `COMMESSA 345598` y `OA0163864` como cosas distintas). El proyecto lleva **ambos**: `contract_number` (lo que imprime la Nota) y `oa_number` (lo que usan las hojas comerciales).
- La descripción libre del modelo de máquina no es decorativa: es lo que hace que la línea «Maquinaria:» pueda decir «Linea Pasta Larga 4500 Kg/h» y no «PL6000».
- **CAT-03 pide NIT y el criterio 1 exige capturarlo y verlo**: se guarda como `projects.client_nit`, opcional, y se documenta en el propio schema que **no** alimenta la casilla `NIT:` del PDF.

## Evidencia del Excel (`docs/2026_Control Técnico_VF .xls`)

Leído en esta sesión con `xlrd`. Es la fuente que justifica las decisiones bloqueadas y la que la Fase 6 tendrá que migrar.

| Hallazgo | Evidencia | Qué implica en esta fase |
|---|---|---|
| **Delta = vendido − ejecutado** | Hoja `Cibao -Rep D`: `156 / 63 / 93`, `104 / 28 / 76`, `10 / 0 / 10`. Hoja `Resoconto` fila 39: `20 / 332 / -312` | Signo del delta y color de la celda. El prototipo lo tiene invertido (Pitfall 4) |
| **Los negativos existen en los datos reales** | La misma fila 39 | Nada de `CHECK (sold >= executed)`, nada de esconderlo |
| **~21 grafías de rol, 14 técnicos** | `Mecanico`, `Meccanico `, `Meccatronico`, `Software`, `Softwerista`, `Tecnologo`, `Elettrico`, `Eletrico`, `Electrico`, `Electtricista`, `Elettricista`, `Capo Elettricista`, `Técnico Eléctrico`, `Eléctrico Senior`, `ElectroMecanico`, `Auto Meccanico`, `Manager Cantiere`, `Supervisore`, `Aiuto`, `tecnico`, `Tecnico` | Cablear 3 roles (como hace hoy `types.ts`) es demostrablemente falso. El catálogo con ABM y las filas de la matriz generadas desde él son obligatorios |
| **5 de 14 técnicos con más de un rol** | Ivan Cortés: `Software` 652 + `Capo Elettricista` 78. Felipe Sena: `Auto Meccanico` 124, `Electtricista` 143, `Electrico` 98, `Aiuto` 365. Fredy Sarmiento: `ElectroMecanico` + `Meccatronico` | `daily_entries.role_type_id` (snapshot) o la Fase 6 pierde datos y la Fase 7 no cuadra |
| **Las hojas diarias no tienen fase** | Cabecera 2025/2026: `TÉCNICO, Tipo, Proyecto, Maquina, Año, Mes, Día, Concepto, Dato, Novedad, Giorno` | `daily_entries.phase` nullable + bucket «sin fase» en la agregación |
| **`Parametros` asigna `LR` a dos códigos (4 y 5)** | fila 6: `4 | LR | No Remunerado (Sólo EXTERNOS)`; fila 7: `5 | LR | Libre Remunerado (Sólo internos)` | Confirma por qué los 8 códigos deben quedar fijos por tipo y no por texto: el código 4 es `NR` |
| **Máquina en texto libre con separadores mixtos** | `CTA1000,PC4500`, `CTA1000/PL6000`, `PL 6000 PC 4500`, `Reemplazo de tapetes`, `Sin Maquina` | Justifica el catálogo global + selección por proyecto |
| **Vendidos asignados a un técnico con nombre** | `Meccanico | Giuliano Lodi | 156 | 63 | 93`, y filas placeholder `Meccanico | xxxxxx` | Nuestro modelo es rol×fase (decisión bloqueada). Riesgo de conciliación anotado en Open Questions |
| **`Sin Proyecto` / `Sin Maquina` como centinelas** | 1.438 + 3.372 filas | BIT-03 ya prohíbe centinelas: `project_id` nullable. Confirma la decisión |

## Standard Stack

### Dependencias nuevas: **ninguna**

Todo lo que esta fase necesita ya está instalado y probado. Escribirlo explícitamente evita que un plan «aproveche para meter» una librería:

| Necesidad | Lo que ya hay | Dónde |
|---|---|---|
| Cliente HTTP tipado con Bearer y 401 centralizado | `apiFetch<T>` | `frontend/src/lib/api/client.ts` |
| Tablas, chips, inputs, error de campo, filtro | `th`/`td`/`chip()`/`inputStyle`/`inputError`/`FieldError`/`filterBy` | `frontend/src/ui.tsx` |
| Transacción por petición + contexto RLS | `RlsInterceptor` + `PrismaService.client` | `backend/src/common/prisma/` |
| RBAC por endpoint y reglas condicionales | `@Roles`, `@CurrentUser`, `users.service.ts` | `backend/src/common/auth/` |
| Test e2e autenticado en 3 líneas | `createTestApp()`, `crearUsuario()`, `signTestToken` | `backend/test/helpers/` |
| Validación de body | 3 líneas a mano + `ParseUUIDPipe` (precedente 01-03) | — |

### Alternatives Considered (y por qué NO entran ahora)

| En vez de | Se podría usar | Veredicto |
|---|---|---|
| `useEffect` + `useState` por pantalla (patrón ya usado en `Users.tsx:AccessRequests`) | `@tanstack/react-query@5.101.4` (peer `react: ^18 \|\| ^19` — **verificado**, compatible) | **No en Fase 2.** Su valor real (caché compartida, invalidación) aparece en la **Fase 7 con RT-01**, que literalmente describe «SSE como bus de invalidación + refetch». Aquí serían 5 pantallas con una lista cada una. Recomendación: extraer un hook `useApiList` de ~15 líneas (Code Example 6) y reevaluar Query cuando llegue el bus SSE, momento en el que `queryClient.invalidateQueries` sí paga su peso |
| Tipos de API a mano (`lib/api/client.ts`) | `@nestjs/swagger` (ya instalado) + `openapi-typescript@7.13.0` | **No.** Para que el esquema generado sea fiel harían falta clases DTO con `@ApiProperty` en ~60 campos: más código del que genera. La Fase 1 aplazó el codegen «a Fase 2 con ~20 endpoints»; con los endpoints delante, el cálculo sigue saliendo en contra. Reevaluar si el contrato empieza a divergir de verdad (síntoma: un bug de campo mal escrito llega a `main`) |
| Validación de body a mano | `class-validator` + `ValidationPipe` global | **No.** Precedente 01-03. Los bodies de esta fase son de 2-8 campos escalares; `zod` (ya instalado por `env.ts`) es la alternativa si algún plan quiere esquemas, sin instalar nada |
| `CHECK` en SQL crudo para los 8 conceptos | **Enum de Postgres declarado en `schema.prisma`** | **Usar el enum.** Prisma no modela `CHECK` (verificado: no aparece en la referencia del schema), así que iría en SQL a mano, y el motor de diff de Prisma sí modela tipos enum: el enum queda versionado, tipado en TypeScript y no puede derivar. Es la solución **más** estricta y **menos** código |
| Índice único parcial (`WHERE is_active`) para permitir reutilizar un nombre desactivado | `@@unique([...], where: raw(...))` — existe pero exige el preview feature `partialIndexes` | **No.** `@unique` normal: desactivar un rol **no** libera su nombre, y la UI ofrece reactivarlo. Es el comportamiento correcto y cuesta cero |
| Tabla `clients` separada (como `CONTEXTO §10`) | `client_name`/`client_nit`/`country` en `projects` + `<datalist>` nativo con los nombres ya usados | **Sin tabla `clients` en v1.** Ni el prototipo ni el CONTEXT tienen pantalla de clientes, y crearla es un CRUD entero por un beneficio que hoy no se cobra. Ceiling declarado: KPI-04 agrupa por texto, así que dos grafías del mismo cliente serían dos filas — el `<datalist>` (rung nativo, cero dependencias) lo mitiga. Si FAVA acaba pidiendo maestro de clientes, la extracción es mecánica |

## Data Model

Propuesta concreta para `backend/prisma/schema.prisma`. Ocho tablas nuevas, dos enums nuevos, cinco columnas + tres FKs sobre lo existente.

```prisma
/// Los 8 códigos son FIJOS (decisión bloqueada). Enum de Postgres = el catálogo no
/// puede derivar ni por bug ni por SQL suelto; las etiquetas visibles viven en la tabla.
enum ConceptCode { DC MD DFD DVSF DVRC LR NR IL  @@map("concept_code") }
enum Phase       { MONTAJE COLLAUDO              @@map("phase") }
enum EmploymentType { INTERNO EXTERNO            @@map("employment_type") }

model Concept {                      // 8 filas, sembradas por la MIGRACIÓN (no por seed.ts)
  code      ConceptCode @id
  labelEs   String   @map("label_es")
  labelIt   String   @map("label_it")
  sortOrder Int      @map("sort_order")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("concepts")
}

model RoleType {                     // ABM completo (Super Admin). Genera las filas de la matriz.
  id       String  @id @default(uuid()) @db.Uuid
  name     String  @unique
  isActive Boolean @default(true) @map("is_active")
  @@map("role_types")
}

model Currency {
  code     String  @id            // ISO-4217, 3 letras, mayúsculas
  symbol   String
  isActive Boolean @default(true) @map("is_active")
  @@map("currencies")
}

model MachineModel {                 // catálogo GLOBAL; la selección por proyecto va aparte
  id          String  @id @default(uuid()) @db.Uuid
  code        String  @unique       // CTA1000, PC4500, PL6000…
  description String?               // «Linea Pasta Larga 4500 Kg/h» → línea «Maquinaria:» de la Nota
  isActive    Boolean @default(true) @map("is_active")
  @@map("machine_models")
}

model Technician {                   // CAT-02: existe sin cuenta Entra (técnicos históricos)
  id             String         @id @default(uuid()) @db.Uuid
  fullName       String         @map("full_name")
  roleTypeId     String         @map("role_type_id") @db.Uuid
  employmentType EmploymentType @map("employment_type")
  aliases        String[]       @default([])   // «Leomar/Leomir Klein/Kleir» → Fase 6 (MIG-01)
  isActive       Boolean        @default(true) @map("is_active")
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")
  @@index([isActive])
  @@map("technicians")
}

model Project {
  id             String   @id @default(uuid()) @db.Uuid
  name           String                                   // nombre interno (listas, KPIs)
  // ── Encabezado literal de la Nota (ver § Nota Semanal) ──
  clientName     String   @map("client_name")             // «Cliente:»
  clientNit      String?  @map("client_nit")              // CAT-03. OJO: NO es el «NIT:» del PDF
  locality       String                                   // «Localidad:» (sin país)
  country        String                                   // KPI-04; se imprime tras la localidad
  supply         String                                   // «Suministro:»
  contractNumber String   @map("contract_number")         // «Contrato:» y columna NOTA de los 7 días
  // ── Comercial ──
  oaNumber       String?  @map("oa_number")
  contractValue  Decimal? @map("contract_value") @db.Decimal(14, 2)
  currencyCode   String?  @map("currency_code")
  normalHours    Int?     @map("normal_hours")            // el «nh» del prototipo
  isActive       Boolean  @default(true) @map("is_active")
  createdById    String?  @map("created_by_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@index([isActive])
  @@map("projects")
}

model ProjectMachine {               // selección pura; nada la referencia → se puede borrar de verdad
  projectId      String @map("project_id") @db.Uuid
  machineModelId String @map("machine_model_id") @db.Uuid
  @@id([projectId, machineModelId])
  @@map("project_machines")
}

model ProjectSoldDays {
  id          String   @id @default(uuid()) @db.Uuid
  projectId   String   @map("project_id") @db.Uuid
  roleTypeId  String   @map("role_type_id") @db.Uuid
  phase       Phase
  soldDays    Int      @map("sold_days")                  // >= 0 validado en el servicio
  updatedById String?  @map("updated_by_id") @db.Uuid
  updatedAt   DateTime @updatedAt @map("updated_at")
  @@unique([projectId, roleTypeId, phase])                // clave natural del upsert por celda
  @@map("project_sold_days")
}
```

**Cambios sobre lo que ya existe** (una sola migración, la tabla está vacía en producción):

| Tabla | Cambio | Por qué **ahora** |
|---|---|---|
| `daily_entries` | `+ project_id` (FK, **nullable** — BIT-03) | Sin él no hay agregación de ejecutados y el criterio 3 no se puede verificar |
| `daily_entries` | `+ machine_model_id` (FK a `machine_models`, nullable) | Apuntar al **modelo global**, no a la selección del proyecto: así quitar una máquina de un proyecto nunca rompe el histórico |
| `daily_entries` | `+ concept_code` (`ConceptCode?`) | El «sin texto libre» del criterio 4 se demuestra a nivel de tipo |
| `daily_entries` | `+ phase` (`Phase?`, **nullable**) | El histórico del Excel no tiene fase |
| `daily_entries` | `+ role_type_id` (FK, nullable) | 5 de 14 técnicos tienen más de un rol en los datos reales |
| `daily_entries` | `technician_id` → FK real a `technicians` | Hoy es un uuid suelto («Sin FK: la tabla technicians llega en Fase 2») |
| `users` | `technician_id` → FK real + `@unique` | Precondición de la Fase 3: `app.technician_id` sale de aquí |

`description` de la jornada **no** se añade aquí: no es FK, no participa de ninguna agregación y añadirla después no obliga a migrar nada. Es de la Fase 3.

## Architecture Patterns

### Pattern 1: Enum fijo + tabla de etiquetas editables

**Qué:** el código del concepto es un **enum de Postgres** (`ConceptCode`) declarado en `schema.prisma`; la tabla `concepts` guarda solo lo mutable (`label_es`, `label_it`, `sort_order`) y su PK es el enum.

**Por qué así y no con `code String @unique` + `CHECK`:** el enum lo modela Prisma (queda versionado en la migración, tipado en `src/generated/prisma/enums`, y el frontend puede escribir la unión a mano), mientras que un `CHECK` tendría que ir en SQL crudo, no aparece en el schema y su supervivencia frente al diff de Prisma no está documentada. Con el enum, **insertar un concepto inventado es un error de tipo en TypeScript y un error de tipo en Postgres**: eso es CAT-01 demostrado, no prometido.

**El color se queda en el frontend.** `i18n.ts:CONCEPTS` lleva hoy `{c, es, it, color}`; se reduce a un mapa `código → color` (los códigos son fijos, así que el mapa nunca se desincroniza) y las etiquetas pasan a venir del API. `ConceptPill`/`ConceptCode` en `ui.tsx` toman la etiqueta del estado de catálogos en vez de la constante.

**Siembra en la migración, no en `seed.ts`.** Las 8 filas son estructura, no datos de ejemplo: si un deploy olvida `db:seed`, el catálogo vacío rompe la captura de la Fase 3 y la pantalla Config. `INSERT ... ON CONFLICT DO NOTHING` dentro de la migración garantiza que cualquier entorno (incluidos CI y la shadow database) las tenga. Roles y monedas sí pueden ir en `seed.ts` (son ABM del usuario).

### Pattern 2: RLS en las tablas nuevas — leer todos, escribir admin

**Qué:** cada tabla nueva lleva `ENABLE` + `FORCE ROW LEVEL SECURITY` y **dos** políticas: una `FOR SELECT USING (true)` y otra `FOR ALL USING (current_setting('app.is_admin', TRUE) = 'on')`. `concepts` es la excepción: su política de escritura es `FOR UPDATE`, y al **no existir** política de INSERT ni de DELETE, el default-deny de Postgres las bloquea a nivel de motor.

**Cómo componen** (doc de PostgreSQL, citada): *«When multiple policies apply to a given query, they are combined using OR (for permissive policies, which are the default)»*. Para `SELECT` aplican las dos → `true OR is_admin` = todos leen. Para `UPDATE`/`INSERT`/`DELETE` solo aplica la de escritura, y en `FOR ALL` *«the policy implicitly provides a WITH CHECK clause identical to its USING clause»*. Dos políticas cubren los cuatro comandos.

**Por qué lectura abierta:** en la Fase 3 el técnico necesita leer proyectos, máquinas y conceptos para registrar su día. Cerrar la lectura aquí obliga a reabrirla en la fase siguiente y a inventar un cuarto GUC. El aislamiento que exige AUTH-03 es sobre **registros**, no sobre catálogos.

**Por qué escritura por RLS y no solo `@Roles`:** es la misma doctrina de defensa en profundidad de AUTH-03, cuesta seis líneas por tabla en una migración que se escribe una vez, y hace que un endpoint mal decorado en cualquier fase futura no pueda escribir maestros. La alternativa barata (no habilitar RLS en maestros y confiar en `@Roles('A','S')`) es defendible; **recomiendo la política** porque esta fase fija el precedente para todas las tablas que vienen.

**El Super Admin no tiene GUC.** Las tres GUC actuales son `app.user_id`, `app.technician_id`, `app.is_admin`. La restricción «solo Super Admin edita catálogos» vive en `@Roles('S')`, igual que la regla de escalada de roles de la Fase 1. Añadir `app.is_super` tocaría `rls.interceptor.ts` (archivo compartido) para una garantía que la capa de servicio ya da; **no hacerlo**.

**El FK no se ve afectado por RLS** — doc de PostgreSQL: *«Referential integrity checks, such as unique or primary key constraints and foreign key references, always bypass row security»*. Es decir: que un técnico no pueda escribir en `projects` no impide que su `daily_entry` referencie un proyecto.

### Pattern 3: Las filas de la matriz salen del catálogo, no del código

**Qué:** `GET /api/projects/:id` devuelve, además del proyecto, una matriz cuyas **filas son los `role_types` activos** (más cualquier rol inactivo que ya tenga días vendidos o ejecutados en ese proyecto — si no, un rol desactivado con 30 días vendidos desaparecería de la pantalla y de la suma).

**Forma del payload recomendada** — plana, no anidada: una lista `{ roleTypeId, roleTypeName, phase, sold, executed }`. La forma anidada actual (`Record<Phase, Record<RoleType, number>>` en `types.ts:11`) solo es escribible con claves conocidas en tiempo de compilación, que es exactamente lo que deja de ser cierto.

**Consecuencia en el frontend:** `types.ts` (`RoleType`, `PhaseMatrix`, `Project`) deja de describir la realidad. `Kpis.tsx` los usa (líneas 7-11 y 127-128) y **el build es `tsc && vite build`**, así que un cambio de tipo rompe la compilación de una pantalla que esta fase no toca. Salida limpia: `Kpis.tsx` deja de leer `state.projects` y pasa a importar `PROJECTS` directamente de `data.ts` (una línea, línea 31), quedándose 100 % mock hasta la Fase 7; los tipos nuevos del API viven en `lib/api/`.

### Pattern 4: Autoguardado por celda con revert (sin librería)

**Qué:** cada celda es un componente con tres estados locales: `value` (lo que se ve), `saved` (último valor confirmado por el servidor) y `status: 'idle' | 'saving' | 'error'`. En `onBlur`, si `value === saved` no se hace nada; si difiere, `PUT` y, según el resultado, `saved = value` o `value = saved` + toast.

**Qué NO usar:** `useOptimistic` **no existe en React 18** (es de React 19; el frontend está en `react@^18.3.1`). Cualquier plan que lo mencione está mirando docs de otra versión.

**Sin debounce.** La decisión bloqueada es «persiste al salir del campo»: el disparador es `onBlur`, no la escritura. Un debounce añadiría carreras sin ahorrar peticiones.

**Idempotencia y último-que-escribe-gana.** El endpoint es un `PUT` con el valor absoluto sobre la clave natural `(project, role_type, phase)`: reintentar es seguro y dos admins concurrentes convergen al último. Es correcto para dos administradores; **techo declarado** en un comentario, no en una capa de bloqueo.

**Respuestas fuera de orden:** dos ediciones rápidas de la misma celda pueden resolverse al revés. Se resuelve con un contador monótono por celda y descartando respuestas viejas (4 líneas, Code Example 4). Sin él, el fallo es raro pero indistinguible de una corrupción de datos.

**Ruido de auditoría:** `audit_log` no existe todavía (AUD-01 es Fase 4). Lo que esta fase debe hacer para no envenenarla: **no escribir cuando el valor no cambia** (comparar dentro de la misma transacción y salir); eso elimina el 90 % del ruido, que son blurs sin edición, y de paso evita mover `updated_at`. Cuando llegue la Fase 4, agrupar visualmente los cambios por (actor, celda, ventana de tiempo) es cosa del visor: `audit_log` es append-only por requisito y no se puede «resumir» al escribir.

### Pattern 5: Modelo global de máquina + selección por proyecto

```
machine_models  (catálogo global, ABM del Super Admin, desactivar nunca borrar)
      ▲                                   ▲
      │ FK                                │ FK
project_machines (proyecto ↔ modelo)   daily_entries.machine_model_id
```

**La jornada apunta al modelo global, no a la selección.** Es lo que hace posible la decisión bloqueada «quitar una máquina de un proyecto con jornadas registradas: se avisa y se permite»: la fila de `project_machines` se borra de verdad (nada la referencia) y las jornadas históricas siguen resolviendo su máquina. Si la jornada apuntara a `project_machines`, quitar la máquina sería un FK roto o un borrado en cascada de bitácora.

**El aviso necesita un dato del servidor.** `GET /api/projects/:id` devuelve, por máquina seleccionada, `entryCount` (jornadas de ese proyecto con ese modelo). La UI enseña el diálogo solo si `entryCount > 0`. En Fase 2 siempre es 0 y el camino queda probado.

### Pattern 6: Desactivar, nunca borrar — cómo se hace cumplir

- **No existe ningún endpoint `DELETE`** en toda la fase salvo el de quitar una máquina de un proyecto (que borra una fila de selección, no un maestro).
- La baja es `PATCH .../:id/active { isActive: false }`, replicando la forma que ya tiene `users`.
- **El listado por defecto incluye inactivos** (con estilo atenuado, como ya hace `Techs.tsx:35` con `opacity`); son los **selectores** los que filtran por `isActive`.
- `@unique` normal sobre `role_types.name`, `currencies.code`, `machine_models.code`: desactivar no libera el nombre. Si el admin intenta crear uno que existe inactivo, el servicio responde con un error específico y la UI ofrece reactivar. Es más honesto que un índice parcial y evita duplicados fantasma.

### Pattern 7: Dónde vive cada dato en el frontend

| Dato | Dónde | Por qué |
|---|---|---|
| Catálogos (conceptos, roles, monedas, modelos) | `state` global, un `GET /api/catalogs` tras `sessionStatus === 'ok'` | Los usan 6+ pantallas, cambian una vez al mes, y `ConceptPill` en `ui.tsx` los necesita sin prop-drilling |
| Listas (proyectos, técnicos, usuarios) | Hook `useApiList` por pantalla | Cada pantalla recarga lo suyo tras mutar; el provider no se convierte en una capa de datos |
| Detalle de proyecto | Fetch propio por `id` en `ProjectDetail` | Trae máquinas + matriz, que la lista no necesita |

`state.projects` y `state.users` (hoy mocks en `state.tsx:79-80`) desaparecen del provider. `addProject`/`addUser` dejan de mutar arrays locales y pasan a `POST` + recarga.

### Anti-Patterns to Avoid

- **Enviar `delta` desde el cliente, o guardarlo.** El criterio 3 dice «no existe ningún campo de delta digitable»: el servidor lo calcula y el endpoint **rechaza** un body que lo traiga (un test lo comprueba).
- **`Record<RoleType, number>` en cualquier tipo nuevo.** Es el bug de diseño que la decisión bloqueada de roles ABM elimina.
- **`ENABLE ROW LEVEL SECURITY` sin política de `SELECT`.** No da error: da listas vacías (Pitfall 1).
- **Borrado en cascada de proyectos o técnicos.** Un `onDelete: Cascade` en el FK a `daily_entries` convierte «desactivar por error» en pérdida de bitácora. Por defecto (`onDelete: Restrict` en Prisma para relaciones obligatorias) está bien; no cambiarlo.
- **Reusar `MACHINES`/`CURRENCIES` de `data.ts` en pantallas nuevas.** Son el mock que esta fase retira.
- **Un `PATCH /api/projects/:id` genérico que también toque días vendidos o máquinas.** Tres recursos, tres endpoints: el autoguardado por celda necesita un endpoint pequeño y aislado (mismo razonamiento que NOTA-02 con las transiciones).
- **Confiar en que el frontend ya no manda texto libre.** El criterio 4 se cumple en el servidor y en el motor; la UI es la tercera capa, no la primera.

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|---|---|---|---|
| Que un catálogo cerrado no pueda crecer por accidente | Validación en el servicio con una lista de strings | **Enum de Postgres + Prisma** | El servicio se salta con un script, un seed o una consola de BD; el tipo no |
| Que solo un admin escriba maestros | `if (user.roles...)` repetido en 8 servicios | `@Roles('A','S')` a nivel de clase **+ política RLS** | Precedente 01-03; y la política aguanta un controlador mal decorado |
| Upsert de la celda de la matriz | `findFirst` + `if` + `create`/`update` | `prisma.projectSoldDays.upsert({ where: { projectId_roleTypeId_phase: ... } })` | Una sola ida a la BD, atómico, y el `@@unique` ya está |
| Autocompletar el nombre de cliente | Combobox propio con lista filtrada | `<input list="clients">` + `<datalist>` nativo | Cero dependencias, accesible, funciona en móvil |
| Formato de moneda y miles | `Intl` a mano por pantalla | `money()`/`nf()` que ya existen en `data.ts` | Se quedan aunque los mocks se vayan (son helpers, no datos) |
| Fetch + loading + error por pantalla | Copiar el `useEffect` de `Users.tsx` cinco veces | Un `useApiList` de 15 líneas | La quinta copia diverge; es la ley |
| Búsqueda en las listas | Endpoint con paginación y `ILIKE` | `filterBy()` en cliente (`ui.tsx:104`) | 4 proyectos, 14 técnicos, ~30 usuarios. Paginación de servidor cuando alguna lista pase de ~500 filas |

**Key insight:** en esta fase «no lo construyas a mano» significa casi siempre «déjaselo al motor de la base de datos». Enum, FK, `@@unique` y política RLS convierten cuatro reglas de negocio en invariantes que ningún bug de aplicación puede violar — y son exactamente las cuatro reglas que el Excel demostró que se violan cuando dependen de la disciplina humana.

## Common Pitfalls

### Pitfall 1: RLS activado sin política de `SELECT` = listas vacías, cero errores

**Qué sale mal:** se añade `ENABLE`/`FORCE ROW LEVEL SECURITY` a las tablas nuevas copiando la migración de la Fase 1 y se escribe solo la política de escritura. La doc de PostgreSQL: *«If no policy exists for the table, a default-deny policy is used, meaning that no rows are visible or can be modified»*. La API responde `200 []`, la pantalla dice «Sin resultados», los logs están limpios y el bug parece del frontend.

**Cómo evitarlo:** la política de `SELECT` se escribe **primero** y cada tabla nueva lleva su caso en el test de RLS. La verificación que no miente: sembrar como owner, leer como `fava_app` y comprobar que el conteo coincide, más la aserción sobre `pg_class` (`relrowsecurity`, `relforcerowsecurity`) — el patrón anti-mentira que 01-02 ya dejó montado.

**Señales de alarma:** una lista vacía justo después de sembrar; un test de RLS que solo comprueba que el técnico **no** ve algo, y nunca que el admin **sí**.

---

### Pitfall 2: `truncateAll()` tiene la lista de tablas cableada

**Qué sale mal:** `test/helpers/db.ts:28` declara `const TABLAS = ['daily_entries','weekly_notes','access_requests','users']`. Las ocho tablas nuevas no se limpian entre suites: los proyectos de una suite aparecen en la siguiente y los fallos son de orden de ejecución. Y si alguien añade los catálogos a esa lista, el `TRUNCATE ... CASCADE` se lleva los 8 conceptos sembrados por la migración.

**Cómo evitarlo:** dos listas. Transaccionales (se truncan): `daily_entries`, `weekly_notes`, `project_sold_days`, `project_machines`, `projects`, `technicians`, `access_requests`, `users`. Catálogos (**nunca** se truncan): `concepts`, `role_types`, `currencies`, `machine_models`, con un helper idempotente `seedCatalogos()` para los tests que necesiten un rol extra.

**Señales de alarma:** un test que pasa solo, falla en la suite; `npm run db:seed` como parte de la receta para arreglar tests.

---

### Pitfall 3: los técnicos de prueba de la Fase 1 no existen como filas

**Qué sale mal:** `TEC_A`/`TEC_B` son UUID literales que las suites `rls-isolation` y `rls-transaction` insertan en `daily_entries.technician_id`. En el momento en que esa columna recibe su FK a `technicians`, **las dos suites verdes de la Fase 1 se ponen rojas** con un error de FK, y parecerá que la migración rompió RLS.

**Cómo evitarlo:** la tarea que añade el FK incluye, en el mismo commit, la siembra de los dos técnicos (con su `role_type_id`) en los `beforeEach` de esas suites o en un helper compartido. Es trabajo de Wave 0, no un imprevisto.

**Señales de alarma:** un plan que añade FKs a `daily_entries` sin tocar `test/helpers/`.

---

### Pitfall 4: el prototipo calcula el delta al revés

**Qué sale mal:** `ProjectDetail.tsx:35-37` hace `const dl = dn - s` (ejecutado − vendido) y pinta `warn` si `dl < 0`. Con esa convención, pasarse de lo vendido sale **positivo y verde**, que es justo lo contrario de la decisión bloqueada y de lo que hace el Excel (`Resoconto` fila 39: `20 | 332 | -312`).

**Cómo evitarlo:** `delta = sold − executed` en el **servidor**, una sola vez; el frontend solo pinta. Negativo = sobreejecución = color de alerta. El criterio 3 del roadmap lo llama «disponible», que es exactamente `sold − executed`.

**Señales de alarma:** cualquier resta de estas dos cantidades fuera del servicio de proyectos; un test que solo prueba el caso positivo.

---

### Pitfall 5: `Decimal` de Prisma se serializa como string y el frontend lo formatea como NaN

**Qué sale mal:** `contract_value` es `@db.Decimal(14,2)`; Prisma Client lo representa con el `Decimal` de decimal.js (confirmado en la referencia del schema de Prisma). Al devolverlo tal cual en la respuesta JSON de Nest, lo más probable es que salga como **string**, y `money(p.value, p.cur)` (`data.ts:85`, hace `v.toLocaleString`) reventará o imprimirá basura. El fallo aparece en la pantalla, no en el compilador, porque el tipo del frontend está escrito a mano.

**Cómo evitarlo:** no depender de la serialización. El controlador mapea explícitamente (`contractValue: p.contractValue === null ? null : Number(p.contractValue)`) y un test e2e afirma `typeof body.contractValue === 'number'`. Los valores de contrato reales (~4,15 M con 2 decimales) están muy por debajo de `2^53`, así que `Number` es exacto; el comentario que lo dice va al lado de la conversión.

**Confianza:** MEDIUM. Que Prisma use `Decimal` de decimal.js está verificado; que Nest lo emita como string es deducción de `Decimal.prototype.toJSON`. **Verificar con un `curl` en la primera tarea**, no darlo por hecho en ninguna dirección — la conversión explícita hace que la respuesta correcta sea la misma en los dos casos.

---

### Pitfall 6: el «NIT:» del PDF es el de FAVA

**Qué sale mal:** CAT-03 y el criterio 1 dicen «NIT», el modelo gana un `client_nit`, y en la Fase 5 alguien lo enchufa a la casilla `NIT:` del encabezado. El resultado es un documento que se entrega firmado a un cliente con el identificador fiscal equivocado.

**Cómo evitarlo:** el comentario va en el propio `schema.prisma`, junto a la columna (donde lo lee quien vaya a usarla), y en el mapa de la § Nota Semanal de este documento. La casilla `NIT:` es constante del membrete, como la dirección y la web.

**Señales de alarma:** una plantilla de PDF con `{{project.nit}}` cerca de la palabra NIT.

---

### Pitfall 7: `ALTER DEFAULT PRIVILEGES` es por rol, y ocho tablas nuevas lo estrenan

**Qué sale mal:** los privilegios por defecto que dejó el bootstrap de la Fase 1 se aplican a los objetos creados **por el mismo rol que corrió el `ALTER`**. Si en Railway las migraciones acaban corriendo con un usuario distinto del que corrió `db:bootstrap`, las ocho tablas nuevas nacen sin permisos para `fava_app` y la app responde `permission denied for table projects` inmediatamente después de un `migrate deploy` exitoso. En local no pasa nada porque ahí es el mismo rol.

**Cómo evitarlo:** el smoke post-deploy de esta fase incluye un `GET /api/projects` autenticado. Y si aparece, la reparación es re-ejecutar `db:bootstrap` (idempotente) + un `GRANT ... ON ALL TABLES`; conviene que el script ya lo haga.

**Señales de alarma:** todo verde en local y `permission denied` en Railway; un plan que da por trivial el primer deploy con tablas nuevas.

---

### Pitfall 8: el revert del autoguardado pisa lo que el usuario acaba de escribir

**Qué sale mal:** la celda falla, la respuesta tarda 3 s, y para entonces el admin ya escribió otro número. El `catch` restaura el valor viejo encima de la edición nueva, y el admin ve cómo la pantalla le deshace lo que acaba de teclear.

**Cómo evitarlo:** el revert solo se aplica si la celda no ha cambiado desde que se lanzó la petición (comparación por el contador monótono, Code Example 4). Si cambió, se descarta la respuesta vieja y manda la nueva.

**Señales de alarma:** un `setValue(saved)` dentro de un `catch` sin ninguna condición.

---

### Pitfall 9: índices parciales y otros objetos escritos a mano

**Qué sale mal:** las políticas RLS sobreviven a `prisma migrate dev` porque Prisma no modela políticas — está comprobado empíricamente en este repo desde 01-02. Los **índices sí** los modela, así que un `CREATE UNIQUE INDEX ... WHERE is_active` escrito a mano en una migración puede aparecer como diferencia y ser eliminado por la siguiente migración generada.

**Cómo evitarlo:** esta fase no necesita ningún índice parcial (ver § Alternatives). Si algún plan lo introduce, o se declara con el preview feature `partialIndexes` o se acepta el riesgo con una comprobación explícita.

**Confianza:** MEDIUM — deducido de que el motor de diff sí modela índices; no lo verifiqué contra este repo. La recomendación (no usarlos) hace que la duda no importe.

## Code Examples

### 1. Migración RLS de las tablas nuevas (SQL a mano, idempotente)

```sql
-- prisma/migrations/XXXX_rls_maestros/migration.sql
-- Mismo estilo que 20260725221504_rls: DROP POLICY IF EXISTS porque `migrate dev`
-- la corre también contra la shadow database.

-- ── Patrón para maestros y catálogos: leer todos, escribir solo admin ──
-- (repetir para: role_types, currencies, machine_models, technicians,
--  projects, project_machines, project_sold_days)
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proj_read  ON "projects";
DROP POLICY IF EXISTS proj_write ON "projects";

-- Sin ESTA política, la tabla no da error: da cero filas. (Pitfall 1)
CREATE POLICY proj_read  ON "projects" FOR SELECT TO fava_app USING (TRUE);
-- FOR ALL reutiliza USING como WITH CHECK: cubre INSERT, UPDATE y DELETE.
CREATE POLICY proj_write ON "projects" FOR ALL    TO fava_app
  USING (current_setting('app.is_admin', TRUE) = 'on');

-- ── concepts: el catálogo NO puede crecer ni encoger, ni siquiera desde SQL ──
ALTER TABLE "concepts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "concepts" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conc_read  ON "concepts";
DROP POLICY IF EXISTS conc_label ON "concepts";

CREATE POLICY conc_read  ON "concepts" FOR SELECT TO fava_app USING (TRUE);
-- Solo UPDATE. Al no existir política de INSERT ni de DELETE, el default-deny de
-- Postgres las bloquea: los 8 códigos son fijos por motor, no por convención.
CREATE POLICY conc_label ON "concepts" FOR UPDATE TO fava_app
  USING      (current_setting('app.is_admin', TRUE) = 'on')
  WITH CHECK (current_setting('app.is_admin', TRUE) = 'on');
```

### 2. Siembra estructural de los 8 conceptos (en la misma migración)

```sql
INSERT INTO "concepts" ("code","label_es","label_it","sort_order","updated_at") VALUES
  ('DC',  'Día completo',        'Giornata intera',     1, now()),
  ('MD',  'Medio día',           'Mezza giornata',      2, now()),
  ('DFD', 'Festivo / dominical', 'Festivo / domenicale',3, now()),
  ('DVSF','Viaje salida',        'Viaggio andata',      4, now()),
  ('DVRC','Viaje retorno',       'Viaggio ritorno',     5, now()),
  ('LR',  'Libre remunerado',    'Permesso retribuito', 6, now()),
  ('NR',  'No remunerado',       'Non retribuito',      7, now()),
  ('IL',  'Incapacidad',         'Malattia',            8, now())
ON CONFLICT ("code") DO NOTHING;   -- idempotente: shadow DB, CI y re-deploy
```

Los textos salen de `frontend/src/i18n.ts:10-19`, que ya tiene las ocho traducciones ES/IT revisadas.

### 3. Upsert de una celda (backend)

```ts
// modules/projects/sold-days.service.ts
async fijar(actorId: string, projectId: string, roleTypeId: string, phase: Phase, soldDays: number) {
  if (!Number.isInteger(soldDays) || soldDays < 0 || soldDays > 9999)
    throw new BadRequestException('DIAS_VENDIDOS_INVALIDOS');

  const clave = { projectId_roleTypeId_phase: { projectId, roleTypeId, phase } };

  // No escribir cuando no cambia: mata el ruido de auditoría de los blur sin edición
  // (AUD-01 llega en Fase 4 y es append-only: no se puede resumir al escribir).
  const actual = await this.prisma.client.projectSoldDays.findUnique({ where: clave });
  if (actual?.soldDays === soldDays) return actual;

  return this.prisma.client.projectSoldDays.upsert({
    where:  clave,
    create: { projectId, roleTypeId, phase, soldDays, updatedById: actorId },
    update: { soldDays, updatedById: actorId },
  });
}
```

### 4. Celda con autoguardado, revert y respuestas fuera de orden (frontend)

```tsx
// screens/ProjectDetail.tsx — sustituye al <input defaultValue={s}> actual
function SoldCell({ projectId, roleTypeId, phase, initial }: SoldCellProps) {
  const { showToast } = useApp();
  const [value, setValue] = useState(String(initial));
  const saved = useRef(String(initial));
  const seq = useRef(0);                          // descarta respuestas viejas
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const commit = async () => {
    if (value === saved.current) return;          // blur sin edición: ni una petición
    const mine = ++seq.current;
    const enviado = value;
    setStatus('saving');
    try {
      await putSoldDays(projectId, { roleTypeId, phase, soldDays: Number(enviado) });
      if (mine !== seq.current) return;           // ya hay una edición más nueva en vuelo
      saved.current = enviado;
      setStatus('idle');
    } catch {
      if (mine !== seq.current) return;           // no pisar lo que el usuario acaba de escribir
      setValue(saved.current);                    // revert al último valor confirmado
      setStatus('error');
      showToast('save_error');
    }
  };

  return (
    <input
      value={value}
      inputMode="numeric"
      onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      style={status === 'error' ? inputError : inputStyle}
      aria-busy={status === 'saving'}
    />
  );
}
```

`useOptimistic` no está disponible (React 18). El indicador de guardado es `status`; el diseño exacto es discreción del planner.

### 5. Agregación de ejecutados (una sola expresión, reutilizable en Fase 7)

```ts
// modules/projects/projects.service.ts — corre dentro de la tx del RlsInterceptor
const ejecutados = await this.prisma.client.$queryRaw<
  { role_type_id: string | null; phase: Phase | null; days: number }[]
>`
  SELECT COALESCE(de.role_type_id, t.role_type_id) AS role_type_id,
         de.phase,
         COUNT(*)::int AS days
    FROM daily_entries de
    JOIN technicians  t ON t.id = de.technician_id
   WHERE de.project_id = ${projectId}::uuid
     AND de.status = 'approved'          -- coherente con KPI-01: solo datos aprobados
   GROUP BY 1, 2
`;
```

Tres decisiones que van con comentario al lado, porque las tres son preguntas abiertas con FAVA:

1. `COALESCE(de.role_type_id, t.role_type_id)` — el rol de la jornada manda; el del maestro es el respaldo. Es lo que hace que Ivan Cortés cuente como `Software` unos días y como `Capo Elettricista` otros, tal y como está en el Excel.
2. `COUNT(*)` cuenta `MD` como un día completo. Es lo que hace el Excel (`Cuenta de Concepto`), así que la conciliación de MIG-03 cuadra. Si FAVA pide medio día, se cambia **aquí y solo aquí**.
3. `de.phase` puede ser `NULL` (histórico sin fase): la agregación **no** los descarta; el servicio devuelve el bucket sin fase y la UI lo muestra solo si es > 0. Descartarlos sería una mentira silenciosa en el tablero.

### 6. `useApiList` — el React Query que no hace falta todavía

```ts
// frontend/src/lib/api/useApiList.ts
export function useApiList<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    fetcher()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e as Error));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading: data === null && !error, reload: () => setNonce((n) => n + 1) };
}
```

`reload()` es lo que llaman las pantallas tras crear o desactivar algo — y es también el punto exacto donde la Fase 7 engancha el bus SSE de RT-01.

## API Surface

Rutas completas en el `@Controller` (no hay `setGlobalPrefix`). `@Roles` a nivel de clase; las reglas condicionales, en el servicio.

| Método | Ruta | Rol | Notas |
|---|---|:--:|---|
| GET | `/api/catalogs` | T A S | Un solo fetch: `{ concepts, roleTypes, currencies, machineModels }`. Abierto a T desde ya: la Fase 3 lo necesita y así no se toca dos veces |
| PATCH | `/api/catalogs/concepts/:code` | **S** | Solo `labelEs`/`labelIt`. Sin POST ni DELETE — **no existen**, y la BD tampoco los permite |
| POST · PATCH | `/api/catalogs/role-types` · `/:id` | **S** | PATCH incluye `isActive`. Sin DELETE |
| POST · PATCH | `/api/catalogs/currencies` · `/:code` | **S** | `code` = 3 letras mayúsculas, validado |
| POST · PATCH | `/api/catalogs/machine-models` · `/:id` | **S** | `code` + `description` |
| GET · POST | `/api/technicians` | A S | Lista incluye inactivos; el selector filtra |
| PATCH | `/api/technicians/:id` · `/:id/active` | A S | Sin DELETE |
| GET | `/api/projects` | A S | Lista para `Projects.tsx` + códigos de máquina para los chips |
| GET | `/api/projects/:id` | A S | Detalle + máquinas (`entryCount` por máquina) + matriz (vendido, ejecutado, delta) |
| POST · PATCH | `/api/projects` · `/:id` | A S | Encabezado + comercial. Las máquinas y los días vendidos **no** entran aquí |
| PUT | `/api/projects/:id/machines` | A S | Reemplaza la selección completa (idempotente) |
| PUT | `/api/projects/:id/sold-days` | A S | Una celda: `{ roleTypeId, phase, soldDays }`. **Rechaza** un body con `delta` |
| PATCH | `/api/projects/:id/active` | A S | Desactivar, nunca borrar |
| POST | `/api/users` | A S | **No existe** (Fase 1 solo dejó GET + los dos PATCH). Invitación = fila con `entra_oid` null; la escalada la aplica `users.service` |
| PATCH | `/api/users/:id/technician` | A S | Vincula usuario ↔ técnico. **Sin esto la Fase 3 no funciona** (ver Open Question 4) |

## Frontend Cutover Map

| Archivo | Qué cambia | Riesgo |
|---|---|---|
| `screens/Projects.tsx` | `state.projects` → `useApiList(listProjects)`. Columnas ya casan (`name`, `client`, `oa`, `country`, `value`, `nh`, `machines`) | Bajo |
| `screens/ProjectDetail.tsx` | Filas de la matriz desde el catálogo; celda → `SoldCell`; **el botón Guardar desaparece** (línea 83); delta con el signo corregido; cabecera con los campos de la Nota | **Alto** — es el corazón de la fase |
| `screens/Techs.tsx` | `TECHS` (import directo) → API; el modal «Nuevo técnico» hoy solo lanza un toast (línea 12): hay que construirlo | Medio |
| `screens/Users.tsx` | `state.users` → API; los chips de rol hoy **no tienen `onClick`** (línea 113): cablear a `PATCH /:id/roles`; añadir activar/desactivar y vínculo con técnico | Medio |
| `screens/Config.tsx` | Conceptos y monedas desde el API; edición de etiquetas ES/IT (los `Dots` de la línea 23 hoy no hacen nada); añadir tarjetas de roles técnicos y modelos de máquina | Medio |
| `components/NewProjectModal.tsx` | `CURRENCIES`/`MACHINES` → catálogos; campos nuevos del encabezado (cliente, NIT, localidad, suministro, contrato); `addProject` → `POST` | Medio |
| `components/InviteUserModal.tsx` | `addUser` → `POST /api/users`; selector de técnico | Bajo |
| `ui.tsx` (`ConceptPill`, `ConceptCode`) | Etiqueta desde el catálogo; `CONCEPTS` de `i18n.ts` se reduce a mapa código→color | Bajo, pero toca pantallas de Fase 3-5 |
| `types.ts` | `RoleType`/`PhaseMatrix`/`Project`/`Tech`/`User` dejan de ser el contrato; los tipos del API van a `lib/api/` | **Rompe el build** si no se hace con Kpis (abajo) |
| `screens/Kpis.tsx` | Una línea: `state.projects` → `import { PROJECTS } from '../data'`. Sigue 100 % mock hasta la Fase 7 | Bajo si se hace; **build roto** si se olvida |
| `state.tsx` | Fuera `projects`/`users` y `addProject`/`addUser`; dentro el slice de catálogos tras `sessionStatus === 'ok'` | Medio |
| `data.ts` | Salen `PROJECTS`(→ solo para Kpis), `TECHS`, `USERS`, `MACHINES`, `CURRENCIES`. **Se quedan** `money`, `nf`, `initials`, `CURRENT_TECH`, `WEEK`, `NOTES`, `EXPENSES`, `AUDIT` | Bajo |

El build del frontend es `tsc && vite build`: cualquier cambio de tipo que deje una pantalla no migrada sin compilar **rompe el deploy entero**, no solo esa pantalla.

## State of the Art

| Enfoque viejo | Enfoque actual | Impacto aquí |
|---|---|---|
| Catálogo como tabla con `code String` + validación en el servicio | Enum de Postgres para los códigos fijos + tabla solo para lo mutable | CAT-01 se vuelve estructural |
| `useState` + `try/catch` por formulario para optimismo | `useOptimistic` (React 19) | **No aplicable**: el frontend es React 18.3 |
| `Record<Enum, number>` para matrices | Lista plana `{rowId, colId, value}` | Obligatorio cuando las filas son datos |
| Máquina/rol como texto en la fila de trabajo | FK a catálogo + snapshot del rol en la jornada | Lo que el Excel demuestra que hace falta |
| Codegen de OpenAPI desde el primer endpoint | Tipos a mano hasta que el contrato duela | 5 pantallas no justifican la tubería |

## Open Questions

1. **¿`MD` cuenta medio día o un día en el ejecutado?**
   - Qué sabemos: el Excel cuenta filas (`Cuenta de Concepto`), así que ahí `MD` vale 1. Son 19 filas de 7.591 en todo el histórico.
   - Qué no está claro: si FAVA quiere que el tablero diga 0,5.
   - Recomendación: contar 1 en v1 (mantiene limpia la conciliación de MIG-03) y aislarlo en la única expresión SQL del Code Example 5. Cambiarlo después es una línea.

2. **¿Los días vendidos se asignan a un rol o a un técnico concreto?**
   - Qué sabemos: la decisión bloqueada y CAT-04 dicen rol×fase. Pero las hojas de proyecto del Excel los asignan a un **técnico con nombre** (`Meccanico | Giuliano Lodi | 156`), con filas placeholder `xxxxxx` para los que aún no se han asignado.
   - Qué no está claro: si al conciliar contra el Excel FAVA va a echar de menos el nombre.
   - Recomendación: rol×fase, como está decidido. Anotarlo como riesgo de conciliación de la Fase 6; añadir `technician_id` opcional a `project_sold_days` sería una columna, pero es especulación hasta que FAVA lo pida.

3. **Los vendidos del Excel se abren además por línea de máquina** (`Fase Montaggio | CTA 1000` y `Fase Montaggio | PC 4500 + SILOS` son bloques separados en `Resoconto`).
   - Qué sabemos: nuestro modelo es (proyecto, rol, fase), sin máquina.
   - Recomendación: mantenerlo. Si FAVA lo pide, la clave única pasa a incluir `machine_model_id` — es una migración, no un rediseño. Conviene que el planner lo sepa antes de que alguien «optimice» esa tabla.

4. **El vínculo usuario ↔ técnico no tiene ni endpoint ni UI, y la Fase 3 depende de él.**
   - Qué sabemos: `app.technician_id` (la GUC que aísla la bitácora) sale de `users.technician_id`. Hoy esa columna existe, nadie la escribe y la pantalla Usuarios no la muestra.
   - Recomendación: **no es opcional**. `PATCH /api/users/:id/technician` + selector en Usuarios y en el modal de invitación entran en esta fase, o la Fase 3 arranca con todos los técnicos viendo cero registros propios.

5. **¿Qué pasa con un `role_type` desactivado que tiene días vendidos?**
   - Recomendación: la matriz muestra la fila igual (marcada como inactiva) mientras `sold > 0` o `executed > 0`. Si desaparece del catálogo, desaparece de la suma y el total del proyecto cambia solo. Es una condición de tres líneas en la consulta, y sin ella el KPI se descuadra en silencio.

6. **Serialización de `Decimal`** — ver Pitfall 5. Se resuelve con una conversión explícita en la primera tarea; no merece un spike.

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|---|---|
| Framework | **Jest 30** + `@nestjs/testing` + `supertest` (ya configurado) |
| Config unit | `backend/package.json` → `jest` (`rootDir: src`, `*.spec.ts`) |
| Config e2e | `backend/test/jest-e2e.json` (`--runInBand`) |
| Base de datos | Postgres 17 local (`docker compose up -d db` o el cluster del puerto 55432), con `db:bootstrap` + `db:migrate` corridos |
| Comando rápido | `npm -w backend run test` |
| Suite completa | `npm -w backend run test && npm -w backend run test:e2e` |
| Frontend | **Sin runner** (decisión de la Fase 1). La verificación es `npm run build` (que incluye `tsc`) + los chequeos de repo de abajo |

### Phase Requirements → Test Map

| Req | Comportamiento verificado | Tipo | Comando | ¿Existe? |
|---|---|---|---|---|
| CAT-01 | Los 8 conceptos existen tras `migrate deploy`, con etiquetas ES/IT | integración | `test:e2e -- catalogs` | ❌ Wave 0 |
| CAT-01 | `INSERT` de un 9º concepto como `fava_app` → **42501** (sin política de INSERT) | integración | `test:e2e -- rls-maestros` | ❌ Wave 0 |
| CAT-01 | `DELETE` de un concepto como `fava_app` → 0 filas afectadas / 42501 | integración | `test:e2e -- rls-maestros` | ❌ Wave 0 |
| CAT-01 | No existe endpoint `POST`/`DELETE` de conceptos → 404 | integración | `test:e2e -- catalogs` | ❌ Wave 0 |
| CAT-01 | `PATCH` de etiquetas: Admin → 403, Super Admin → 200 | integración | `test:e2e -- catalogs` | ❌ Wave 0 |
| CAT-01 | **«Sin texto libre», por introspección**: FKs presentes en `technicians.role_type_id`, `projects.currency_code`, `project_sold_days.role_type_id`; `daily_entries.concept_code` es el tipo enum `concept_code` | integración | `test:e2e -- no-free-text` | ❌ Wave 0 |
| CAT-01 | **«Sin texto libre», por API**: rol/moneda/modelo inexistentes → 400/404; `concept_code: 'XX'` → 400 | integración | `test:e2e -- no-free-text` | ❌ Wave 0 |
| CAT-01 | **«Sin texto libre», en la UI**: ninguna de las 7 pantallas del cutover tiene un `<input>` cuyo valor alimente concepto, rol o moneda | script de repo | `node scripts/check-no-free-text.mjs` | ❌ Wave 0 |
| CAT-01 | Rol desactivado no aparece en selectores pero sí en registros históricos | integración | `test:e2e -- catalogs` | ❌ Wave 0 |
| CAT-02 | Crear técnico sin usuario Entra → 201 y aparece en la lista | integración | `test:e2e -- technicians` | ❌ Wave 0 |
| CAT-02 | Desactivar técnico: sus `daily_entries` siguen siendo legibles y la lista lo muestra inactivo | integración | `test:e2e -- technicians` | ❌ Wave 0 |
| CAT-02 | No existe `DELETE /api/technicians/:id` → 404 | integración | `test:e2e -- technicians` | ❌ Wave 0 |
| CAT-03 | Crear proyecto con los 7 campos del encabezado y recuperarlos idénticos en el detalle | integración | `test:e2e -- projects` | ❌ Wave 0 |
| CAT-03 | `contractValue` sale como **number** en el JSON (Pitfall 5) | integración | `test:e2e -- projects` | ❌ Wave 0 |
| CAT-03 | Selección de máquinas: `PUT` reemplaza; quitar una con jornadas responde OK y la jornada conserva su modelo | integración | `test:e2e -- projects.machines` | ❌ Wave 0 |
| CAT-04 | `PUT` de una celda dos veces con el mismo valor → una sola escritura (`updated_at` no cambia) | integración | `test:e2e -- sold-days` | ❌ Wave 0 |
| CAT-04 | `sold=10`, una jornada aprobada de ese rol/fase → `executed=1`, `delta=9`; con `sold=0` → `delta=-1` | integración | `test:e2e -- sold-days` | ❌ Wave 0 |
| CAT-04 | Body con `delta` o `executed` → 400; ninguna columna `delta` existe en la BD | integración | `test:e2e -- sold-days` | ❌ Wave 0 |
| CAT-04 | Días negativos o no enteros → 400 | integración | `test:e2e -- sold-days` | ❌ Wave 0 |
| CAT-04 | Jornadas con `phase = NULL` aparecen en el bucket «sin fase», no se pierden | integración | `test:e2e -- sold-days` | ❌ Wave 0 |
| CAT-05 | `POST /api/users`: Admin invita Técnico → 201; Admin invita Admin → 403; Super Admin → 201 | integración | `test:e2e -- users-invite` | ❌ Wave 0 |
| CAT-05 | Vincular usuario ↔ técnico y comprobar que `/api/me` devuelve el `technicianId` | integración | `test:e2e -- users-invite` | ❌ Wave 0 |
| **RLS** | Técnico (`is_admin=off`) **lee** catálogos, proyectos y técnicos (no listas vacías) | integración | `test:e2e -- rls-maestros` | ❌ Wave 0 |
| **RLS** | Técnico **no puede** escribir en ninguna de las 8 tablas nuevas → 42501 / 0 filas | integración | `test:e2e -- rls-maestros` | ❌ Wave 0 |
| **RLS** | Anti-mentira: `relrowsecurity` y `relforcerowsecurity` = true en las 8 tablas; `current_user = fava_app` | integración | `test:e2e -- rls-maestros` | ❌ Wave 0 |
| **RLS** | Verificado en rojo: con `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` la suite cae | manual (una vez) | Documentar en el summary del plan | — |
| Regresión | Las suites de Fase 1 siguen verdes tras los FKs nuevos (Pitfall 3) | integración | `npm -w backend run test:e2e` | ✅ existen, hay que actualizarlas |
| Cutover | El frontend compila con los tipos nuevos y ninguna pantalla importa mocks retirados | build | `npm run build` + grep | ✅ el comando existe |
| Deploy | `GET /api/projects` autenticado responde 200 en Railway (Pitfall 7) | smoke | `npm -w backend run smoke -- <url>` | ✅ existe, hay que ampliarlo |
| Manual | Autoguardado: editar celda → indicador → recargar → persiste; con la red cortada → revierte y avisa | **manual** | Checklist en el summary | — |

### Sampling Rate

- **Por commit de tarea:** `npm -w backend run test` (unit, < 10 s) + `npm -w backend run build`
- **Por merge de wave:** `npm -w backend run test:e2e` (Postgres arriba) + `npm run build` en la raíz
- **Phase gate:** suite completa en verde + `check-no-free-text` + smoke desplegado + el checklist manual de autoguardado, antes de `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/test/helpers/db.ts` — dos listas (transaccionales vs. catálogos) y `seedCatalogos()` idempotente **(Pitfall 2)**
- [ ] `backend/test/helpers/fixtures.ts` — `crearTecnico()`, `crearProyecto()`, `crearJornadaAprobada()`; y `TEC_A`/`TEC_B` como técnicos reales **(Pitfall 3)**
- [ ] Actualizar `test/rls-isolation.e2e-spec.ts` y `test/rls-transaction.e2e-spec.ts` para sembrar técnicos antes de insertar jornadas
- [ ] `backend/test/rls-maestros.e2e-spec.ts` — el patrón de 01-02 replicado sobre las 8 tablas nuevas
- [ ] `backend/test/no-free-text.e2e-spec.ts` — introspección de `information_schema` / `pg_constraint` + rechazos del API
- [ ] `scripts/check-no-free-text.mjs` — ~20 líneas de grep sobre los archivos del cutover; es la única prueba automatizable del criterio 4 en el frontend sin runner
- [ ] Ampliar `scripts/smoke.ts` con `GET /api/catalogs` y `GET /api/projects` autenticados **(Pitfall 7)**

## Sources

### Primary (HIGH confidence)

- **`docs/Reporte 02 - Ivan Cortés - Grupo Bocel - Santiago, Republica Dominicana (1).pdf`** — extraído con PyMuPDF por coordenadas (bloques y palabras con `x`/`y`). Base de toda la § Nota Semanal, incluida la ubicación del NIT en el membrete.
- **`docs/2026_Control Técnico_VF .xls`** — leído con `xlrd`: hojas `Parametros`, `Resoconto`, `Cibao -Rep D`, `2025`, `2026`. Base de toda la § Evidencia del Excel (signo del delta, 21 grafías de rol, 5 técnicos multi-rol, ausencia de columna de fase, LR duplicado).
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — *«If no policy exists for the table, a default-deny policy is used»*; *«Referential integrity checks… always bypass row security»*; permissive policies combinadas con `OR`; `FOR ALL` reutiliza `USING` como `WITH CHECK`.
- [Prisma — Schema reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference) — `Decimal` se representa con el `Decimal` de decimal.js; `@db.Decimal(p,s)`; **no** hay soporte de `CHECK` en el schema.
- [Prisma — Indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes) — índices parciales con `where: raw(...)` bajo el preview feature `partialIndexes` (PostgreSQL, SQLite, SQL Server, CockroachDB).
- **Registro npm, consulta en vivo 2026-07-25** — `@tanstack/react-query@5.101.4` con peer `react: ^18 || ^19`; `openapi-typescript@7.13.0`.
- **Código del propio repo** — `backend/prisma/schema.prisma`, `prisma/migrations/20260725221504_rls/migration.sql`, `src/common/prisma/rls.interceptor.ts`, `src/modules/users/*`, `test/helpers/{db,app}.ts`, `frontend/src/{types,data,ui,state,i18n}.ts(x)`, `frontend/src/screens/{Projects,ProjectDetail,Techs,Users,Config,Kpis}.tsx`, `frontend/src/components/{NewProjectModal,InviteUserModal}.tsx`, `frontend/package.json`. Base de todas las afirmaciones sobre puntos de integración, líneas citadas y del mapa de cutover.
- `.planning/phases/01-*/01-0{1,2,3,5}-SUMMARY.md` y `01-RESEARCH.md` — patrones ya establecidos (sin `setGlobalPrefix`, `EnvService`, GUCs, anti-mentira de RLS, tipos a mano).

### Secondary (MEDIUM confidence)

- React 19 release notes / guías de `useOptimistic` (varias fuentes coincidentes) — el hook es exclusivo de React 19; el frontend es 18.3.1, verificado en `package.json`.
- Deducción propia sobre la serialización JSON de `Decimal` en respuestas de Nest (a partir de `Decimal.prototype.toJSON` de decimal.js). **Verificar con `curl` en la implementación**; la conversión explícita hace que la duda no importe.

### Tertiary (LOW confidence — validar si algún plan depende de ello)

- Comportamiento del motor de diff de Prisma frente a índices parciales escritos a mano en una migración. La recomendación (no usarlos) evita depender de esto.
- Que `prisma migrate dev` preserve `CHECK` escritos a mano: **no lo verifiqué**, y por eso la recomendación es enum de Postgres en vez de `CHECK`. Que preserva las **políticas RLS** sí está comprobado empíricamente en este repo desde 01-02.

## Metadata

**Desglose de confianza:**
- Encabezado real de la Nota (mapa de campos, NIT de FAVA): **HIGH** — PDF leído con coordenadas.
- Evidencia del Excel (delta, roles, fases, conceptos): **HIGH** — fuente primaria leída, cifras reproducibles.
- Modelo de datos propuesto: **HIGH** en la forma, **MEDIUM** en dos juicios marcados (sin tabla `clients`; `role_type_id` en la jornada — este último respaldado por los datos).
- Reglas de RLS y composición de políticas: **HIGH** — doc de PostgreSQL citada textualmente.
- Patrones de NestJS/Prisma/frontend: **HIGH** — replican lo que ya corre en este repo.
- Serialización de `Decimal`: **MEDIUM** — mitigado por diseño.
- Arquitectura de validación: **MEDIUM-HIGH** — los comandos existen; los archivos de test no.

**Research date:** 2026-07-25
**Valid until:** ~2026-09-25. Nada de esta fase depende de una librería que se mueva rápido: las fuentes que mandan (el PDF de la Nota, el Excel, la doc de PostgreSQL y el propio repo) son estables. Reverificar solo si se decide adoptar React Query o el codegen de OpenAPI.
