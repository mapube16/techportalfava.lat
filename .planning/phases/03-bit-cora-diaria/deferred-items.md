# Deferred items — Fase 3

Hallazgos que NO se arreglan en esta fase, con su dueño escrito. Que estén aquí
significa que se vieron y se decidió no tocarlos, no que se olvidaran.

---

## 1. El CHECK `de_proyecto_por_concepto` es ESTRICTO — dueño: **Fase 6 (migración del Excel)**

**Encontrado en:** 03-01 T1, al crear el CHECK.

El CHECK exige proyecto para los cinco conceptos de trabajo (`DC`, `MD`, `DFD`,
`DVSF`, `DVRC`). Verificado contra el motor: un `INSERT` de `DC` sin `project_id`
devuelve **SQLSTATE 23514**, venga de un endpoint, de un script de migración o de la
consola de la base.

El Excel marca **1.438 filas** con el centinela «Sin Proyecto» y **no se ha podido
comprobar qué conceptos llevan** (no hay extracto del Excel en el repo). Si alguna
lleva uno de los cinco de trabajo, la migración del histórico **se caerá contra este
CHECK a mitad**.

**La salida es la cuarentena** (`migration_rejects`: la fila se aparta con su motivo y
la migración continúa), **NO relajar el CHECK bajo presión**. La alternativa técnica
—añadir `OR source_row IS NOT NULL` para eximir a lo importado— existe, funcionaría, y
**no se toma por adelantado**: convierte una garantía del motor en una garantía
condicional a cambio de no escribir la tabla de cuarentena que la Fase 6 necesita de
todas formas para las grafías de técnico (MIG-01).

---

## 2. `created_at` / `updated_at` son `timestamp without time zone` — dueño: **Fase 5 (Nota Semanal / expediente de firma)**

**Encontrado en:** 03-01 T1, revisando `daily_entries` en `information_schema.columns`.

Las dos marcas son `timestamp` sin zona, no `timestamptz`. **Aquí es irrelevante:** las
produce el mismo servidor y solo se comparan entre sí (la detección de conflicto del
borrador de BIT-04 compara `updatedAt` del servidor con `savedAt` del navegador, y esa
sí cruza husos — pero el `updatedAt` viaja serializado por Prisma como ISO en UTC).

**Importa en la Fase 5:** si el expediente de firma imprime un «timestamp de servidor»
como prueba de cuándo se aprobó la nota, un `timestamp` sin zona es un instante sin
referencia — legible pero no defendible. Decidir allí si se migra a `timestamptz` o si
el expediente imprime explícitamente «hora UTC».

---

## 3. `roadmap update-plan-progress` corrompe el mapa de cutover de ROADMAP.md — dueño: **la verificación de fase / quien mantenga gsd-tools**

**Encontrado en:** 03-02, al cerrar el plan.

El comando busca la fila `| N |` para escribir el progreso y **acierta en la tabla
equivocada**: en vez de la tabla de progreso de fases toca «Frontend Cutover Map», cuya
primera columna también es el número de fase. Al ejecutar `update-plan-progress 3`
reescribió `| 3 | Week, LogDayDrawer |` como
`| 3 | 1/6 | In Progress|  | Inbox, Notes, ReturnModal, Audit, bandeja de Home |`,
**borrando de paso la fila entera de la Fase 4**. Se revirtió a mano en 03-02.

**Lo que queda diferido:** la fila `| 1 |` de esa misma tabla **sigue corrupta y ya está
commiteada** (`| 1 | 1/6 | In Progress|  | Projects, ProjectDetail, … |`), de una
ejecución anterior del mismo comando. No se toca desde aquí porque es dato de otra fase.
El contenido original, recuperable de git, es
`| 1 | Projects, ProjectDetail, Techs, Users, Config, NewProjectModal, InviteUserModal |`.

**Y lo importante para esta wave:** 03-01 y 03-03 corren en paralelo y **volverán a
ejecutar el mismo comando**, así que la fila de la Fase 3 puede aparecer rota otra vez al
cerrar la wave — conviene mirarla en la verificación de fase. Es el tercer fallo conocido
de estas herramientas en este repo, junto con `state advance-plan` (busca campos que este
STATE.md no usa) y el `update-plan-progress` que responde `updated: true` sin escribir la
fila de la tabla de progreso.

---

## 4. `BIT-02` y `BIT-04` NO se marcan «Complete» al cerrar 03-02 — dueño: **la verificación de fase**

**Encontrado en:** 03-02, al ejecutar `requirements mark-complete BIT-02 BIT-04` según el
frontmatter del plan.

La herramienta marcó los dos como `Complete` en REQUIREMENTS.md y **es falso**: BIT-02 lo
reclaman 5 de los 6 planes de la fase y BIT-04, 4 de 6. 03-02 entrega la **mitad cliente**
(`hoyLocal` en 4 husos, borrador local con su detección de conflicto); la columna `DATE`,
el `UNIQUE` y la idempotencia del `PUT` son 03-01 y 03-04. Revertidos a
`In Progress` con la mitad que falta escrita en la celda. **Quien cierre la fase es quien
los marca Complete**, y solo con los 6 planes ejecutados.

**Reincidencia en 03-03:** `requirements mark-complete BIT-01` marcó BIT-01 como
`Complete` con el mismo criterio equivocado. 03-03 solo sirve el **selector** (la lista de
proyectos activos con sus máquinas); la grilla, el drawer y la escritura son 03-04 y
03-05, y la columna `description` es 03-01. Revertido a `In Progress` con las tres mitades
que faltan escritas en la celda. Es el mismo fallo, la tercera vez: **el frontmatter
`requirements:` de un plan dice qué requisito TOCA, no cuál CIERRA**.

---

## 5. Dos suites de la Fase 2 caen contra el CHECK nuevo — dueño: **03-01** (o la verificación de fase)

**Encontrado en:** 03-03, al correr la suite completa (`14 suites, 278 tests → 276 verdes`).

`crearJornadaAprobada()` (`test/helpers/fixtures.ts`) tiene `conceptCode: 'DC'` fijo y
`projectId` **opcional**. Desde que 03-01 aplicó `20260726150806_bitacora`, llamarla sin
`projectId` es un **23514** (`de_proyecto_por_concepto`). Caen exactamente dos casos, los
dos de suites de la Fase 2 y los dos por la misma línea:

| Suite | Caso |
|---|---|
| `technicians.e2e-spec.ts` | `desactivar a un tecnico lo deja en la lista y sus jornadas siguen legibles` |
| `sold-days.e2e-spec.ts` | `la matriz no cuenta las jornadas de otro proyecto ni las de ninguno` |

No es interferencia entre procesos (no se arregla re-ejecutando): es la consecuencia
esperada del CHECK, y el fallo es **legítimo** — esas dos jornadas «sin proyecto» con
concepto `DC` ya no son estado posible en la base. Ojo con el segundo: su enunciado es
justamente «ni las de ninguno», así que el arreglo no es meterle un `projectId` sino usar
un concepto **sin proyecto** (`LR`/`NR`/`IL`), que es lo que el CHECK permite.

**03-03 no lo toca a propósito:** `fixtures.ts` es contrato cerrado (02-01) y las dos
suites son de otros planes. Se deja escrito aquí para que quien cierre la wave no lo lea
como flakiness de `truncateAll()`.

---

## 6. Móvil: lo que 03-07 midió y NO arregló — dueños repartidos

**Encontrado en:** 03-07 (fundación móvil), sonda estática sobre las 12 pantallas.

03-07 arregla los **primitivos compartidos** (`ui.tsx`), los tokens (`index.css`), la
barra lateral, `Login.tsx` y las 6 pantallas de admin que ya traían rama de tarjetas.
Estas tres cosas quedan fuera **a propósito** — ninguna se arregla con un token:

### 6.1 `screens/Inbox.tsx` desborda a 390px — dueño: el plan que reescriba la bandeja

La bandeja es un maestro-detalle de dos paneles y el maestro es `width: 340, flex: 'none'`
(`Inbox.tsx:13`). A 390px de viewport quedan **362px útiles** (390 − 28 de `--gap-page`),
así que el panel de detalle se queda con 22px y la página desborda en horizontal.

No se arregla desde 03-07: pasar de dos paneles a uno exige decidir la **navegación**
(lista → detalle con botón de volver), que es diseño, no un breakpoint. Inbox no está
entre las 6 pantallas que el plan nombra y no tiene rama de tarjetas que activar.

### 6.2 Tres inputs se saltan `inputStyle` y siguen por debajo de 16px

`inputStyle` ya consume `var(--fs-input)` (16px en móvil), pero estos tres lo pisan con un
literal y **seguirán provocando zoom al enfocar en iOS**:

| Fichero | Línea aprox. | Qué hace |
|---|---|---|
| `screens/Users.tsx` | 151 | `{ ...inputStyle, padding: '7px 9px', fontSize: 13 }` |
| `screens/ProjectDetail.tsx` | 89 | input numérico propio, `fontSize: 13`, `width: 44` |
| `components/ReturnModal.tsx` | 21 | `<textarea>` con estilo propio, `fontSize: 14` |

Los tres son de otros planes. El arreglo es una línea en cada uno (`fontSize:
'var(--fs-input)'`), pero el de `ProjectDetail` además es una celda de tabla de 44px de
ancho: subirle la fuente cambia el ancho de la columna y eso ya es decisión de esa
pantalla.

### 6.3 `--text-3` sobre `--surface-3` se queda en 4.20:1 (claro) y 4.30:1 (oscuro)

Los valores nuevos pasan 4.5:1 sobre `--surface` y `--surface-2`, que son los fondos
sobre los que `--text-3` hace de **texto**. Sobre `--surface-3` no llega, y se deja así:
esa pareja aparece en un solo sitio, el icono de 64px de `Empty` (`ui.tsx`), que es
gráfico y su umbral es 3:1. Si algún día alguien pinta texto normal sobre `--surface-3`,
hay que volver aquí — el test de contraste cubre `surface` y `surface-2`, no este.
