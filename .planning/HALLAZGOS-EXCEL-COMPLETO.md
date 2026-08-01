# Hallazgos: lectura completa de las 14 hojas del Excel

**Fichero:** `docs/2026_Control Técnico_VF .xls` (BIFF antiguo, leído con `xlrd`).
**Fecha:** 2026-08-01.
**Alcance:** las 14 hojas, volcadas y verificadas aritméticamente. Sustituye y corrige a
`.planning/HALLAZGOS-EXCEL-HOJAS-PROYECTO.md`, que se escribió mirando solo dos hojas.
**Impacto:** Fase 2 (esquema y maestros), Fase 3 (bitácora), Fase 6 (migración),
Fase 7 (KPI-07 y KPI-08).

> Regla de este documento: cada afirmación lleva hoja, celda y cuenta. Lo que es
> inferencia va marcado como inferencia.

---

## 1. Qué es cada una de las 14 hojas

| # | Hoja | Tamaño | Qué es |
|---|---|---|---|
| 1 | `Resoconto` | 51×16 | Cuadro de mando de **J MACEDO**: un pivot de días por Tipo (izq., filas 9-14), otro pivot por Proyecto×Tipo desactualizado (I8:O20), y **tres bloques VENDUTO/ESEGUITO/DELTA**, uno por línea de máquina, más un roll-up `GENERALE` (H37+). Es la hoja con más fórmulas rotas del libro: 20 celdas `#REF!`. |
| 2 | `2025` | 2.845×12 | **Bitácora diaria de 2025.** Una fila por técnico y día. 10 técnicos, 2.844 filas de datos. Es fuente de verdad. |
| 3 | `Dettaglio anno 2025` | 50×6 | Tabla dinámica de 2025 filtrada a **JMACEDO**: filas proyecto→técnico→mes, columnas DC/DFD/DV/LR, total general 748. Es el prototipo de KPI-07. |
| 4 | `Parametros` | 10×3 | Catálogo maestro de conceptos: `(id, sigla, descripción)`. Ocho filas, ids 1,2,3,6,4,5,8,9 (no hay 7). |
| 5 | `Calendar` | 30×9 | Pivot de **días de viaje al detalle de día**: filas Proyecto→Técnico→Dato→Novedad, columnas los días concretos del mes. Dos bloques (mayo y junio 2026), 4 y 5 días. Es un informe puntual, no un maestro. |
| 6 | `2026` | 4.746×12 | **Bitácora diaria de 2026.** 13 técnicos × 365 días = 4.745 filas exactas: la rejilla del año entero está **pregenerada**, con 1.009 filas sin concepto. Fuente de verdad. |
| 7 | `Dettaglio anno 2026` | 115×7 | La misma dinámica que la #3 pero de 2026 y **sin filtrar por proyecto**: 11 proyectos, columnas DC/DFD/MD/DVSF/DVRC, total general **1.373**. Es literalmente el KPI-07 que hay que reproducir. |
| 8 | `Viaggi` | 42×6 | Informe de **días de viaje por proyecto y técnico** con dos columnas tecleadas a mano al lado: `Fatturato FAVA SpA` (nº de factura `A-6xx`) y `Euros`. 19 filas de datos, 24 días, 18 importes, 18.008,61 € en total. Al pie, una lista de facturas con «ok» (607, 614, 615, 640, 642, 645 ok; 649 sin marcar). |
| 9 | `Viaggi (2)` | 31×8 | La misma hoja con el pivot colapsado: solo queda la columna de euros. Confirma que factura e importe **no forman parte del pivot**: están pegados al lado. |
| 10 | `Lucchetti Chile ` | 27×12 | Hoja de proyecto. Izquierda: pivot del proyecto (A5:F27). Derecha: cabecera OA/commessa/valor y los dos bloques de días vendidos. Una sola línea de máquina. |
| 11 | `JAV Brasil` | 51×16 | Hoja de proyecto con **tres líneas de máquina** en la misma hoja, cada una con su OA, su commessa, su valor y su par de bloques montaje/collaudo. Es el contraejemplo que rompe el modelo actual. |
| 12 | `Cibao -Rep D` | 18×12 | Hoja de proyecto, una línea (`PL 4500 GLP 180`). Aquí aparecen las plazas sin cubrir escritas como `xxxxxx` (I8, I10). |
| 13 | `Pasta Sole - Ex Molino Fenix` | 23×12 | Hoja de proyecto, una línea. Su fila `TOTALE` está desplazada una columna y le falta el total vendido. |
| 14 | `J Macedo Brasil- final` | 37×16 | Hoja de proyecto **con dimensión económica**: además de VENDUTO/ESEGUITO/DELTA lleva `Coste Unit`, `Costo Totale`, una tarifa para el delta pendiente y un bloque `Gastos` roto. No tiene OA ni commessa. |

---

## 2. El modelo de datos que el Excel realmente implica

### 2.1 Entidades

```
CLIENTE / PROYECTO
   │ 1
   │ N
ORDEN (OA)  ── oa_number, commessa, valor de contrato, etiqueta de alcance
   │ 0..1                                (JAV: 3 órdenes; J Macedo: 0 órdenes)
   ├── MÁQUINA (modelo + serie)          (a veces 1 máquina + auxiliares)
   │ 1
   │ N (exactamente 2 en los datos: MONTAJE y COLLAUDO)
FASE
   │ 1
   │ N (5 renglones en montaje, 3 en collaudo)
RENGLÓN VENDIDO (partida)  ── etiqueta comercial, días vendidos
   │ 0..N
ASIGNACIÓN de técnico (informativa)
```

```
TÉCNICO ──< ESPECIALIDAD VIGENTE (Tipo, desde fecha) >──
   │ 1
   │ N
PARTE DIARIO (técnico, fecha)  ── proyecto?, máquina?, concepto
```

### 2.2 Relaciones y cardinalidades medidas

**Proyecto → orden (OA): 1:N, y N puede ser 0.**
`JAV Brasil` I1=`OA0159105` K1=`COMMESSA 342898` M1=182500; I19=`OA0159108`
K19=`COMMESSA 343098` M19=130000; I36=`OA0159107` K36=`COMMESSA 342998` M36=182500.
Tres OA en una sola hoja de proyecto. En cambio `J Macedo Brasil- final` **no tiene
ningún OA ni commessa**: su único importe es H8=`GENERALE`, M8=`Totale`, N8=425600.

Los seis OA del libro forman una serie correlativa que **cruza clientes y países**:
0159103 (Lucchetti, Chile), 0159104 (Pasta Sole, Argentina), 0159105/0159107/0159108
(JAV, Brasil), 0163864 (Cibao, RD). Falta el 0159106. Un contador global compartido
entre tres clientes es un documento de FAVA, no un número que pertenezca a la máquina.

Las seis commesse terminan en **98** sin excepción: 342898, 343098, 342998, 343298,
345598, 343498. Y en JAV el prefijo es exactamente el serial de la máquina:
`PL 6000 KG - 1-3428` → 3428·100+98 = 342898; `PC 4000 -3430 + 4 SILOS` → 343098;
`PL 6000 KG - 2-3429` → 342998. En la bitácora 2026 aparece la máquina
`Pasta Corta 340300 / Pasta Larga 340200 / Nidos 340400` (56 filas): los mismos
números de job con sufijo `00`. **Inferencia:** el sufijo codifica el departamento
(00 fabricación, 98 asistencia). Hay que confirmarlo con FAVA.

**Orden → máquina: no es 1:1.** `OA0159108` cubre `PC 4000 -3430 + 4 SILOS`
(JAV Brasil I18/P21): una máquina más cuatro silos. Y `OA0159103` (Lucchetti) y
`OA0159104` (Pasta Sole) **no nombran máquina en toda la hoja**, aunque la bitácora
2026 sí registra `Pasta Lunga 4000 kg` en 118 filas de Lucchetti.

**Orden → fase → renglón vendido.** Cada línea tiene dos bloques con nombre literal:
`SUPERVISIONE MECCANICA ELETTRICA ` (montaje) y
`SUPERVISIONE SOFTWARE - ELECT - MECCANICO -COLLADO` (collaudo; `COLLADO` es errata de
COLLAUDO). En `J Macedo Brasil- final` los mismos dos bloques se llaman H9=`Fase
Montaggio ` y H16=`Fase Collaudo`. **Esto valida `phase = MONTAJE | COLLAUDO`.**

La plantilla es fija:

- Montaje, 5 renglones: `Supervisore`, `Meccanico`, `Meccanico`, `Elettricista`,
  `Elettricista`. Los renglones repetidos son **plazas**, no roles distintos.
- Collaudo, 3 renglones: `Test - `, `Sofware `, `Meccanico`.

El vendido se escribe **solo en la primera fila de cada grupo de etiqueta**, y el
delta también. El ejecutado se escribe en todas.

**Los días vendidos cuelgan de la orden, no del proyecto.** En JAV la combinación
(proyecto, `Meccanico`, MONTAJE) vale 182, 98 y 182 según la línea; (proyecto,
`Elettricista`, MONTAJE) vale 130, 92 y 130. Con la clave actual
`(project_id, role_type_id, phase)` esas tres filas colisionan.

**Técnico → parte diario: 1 fila por técnico y día, sin excepción.** Verificado
recorriendo las dos hojas en orden: la fecha es estrictamente creciente dentro de cada
bloque de técnico en 2025 y en 2026. `UNIQUE(technician_id, date)` es seguro. Corolario:
**un técnico no puede imputar a dos proyectos el mismo día** en este modelo.

**Parte diario → proyecto: opcional.** `Sin Proyecto` es 1.438/2.844 (50,6 %) en 2025 y
3.372/4.745 (71,1 %) en 2026.

**Parte diario → máquina: prácticamente inexistente y multivaluado.** En 2026 solo 267
de 4.745 filas tienen máquina (5,6 %), y las 536 de JAV están **todas vacías**. Los
valores traen dos y tres máquinas en una celda con tres separadores distintos:
`PL 6000 PC 4500` (290 filas de 2025), `Pasta Corta 340300 / Pasta Larga 340200 /
Nidos 340400` (56), `CTA1000,PC4500` (7), `CTA1000/PL6000` (6). Y hay basura semántica:
`Auto Meccanico - PL 6000` (14 filas: un Tipo metido en la columna de máquina) y
`Reemplazo de tapetes ` (10 filas: un servicio).

### 2.3 Las dos reglas de cálculo, verificadas

**EJECUTADO = COUNT de filas diarias del proyecto.** No es una suma ponderada: cada fila
vale 1, sea día completo, festivo, viaje o medio día. Contando la hoja `2026` agrupada
por (proyecto, técnico, concepto) reproduzco `Dettaglio anno 2026` celda a celda; el
total general 1.373 = 1.109 DC + 185 DFD + 4 MD + 60 DVSF + 15 DVRC = **exactamente el
número de filas de 2026 que llevan proyecto**. Comprobado también que en 2026 **ninguna
fila con proyecto lleva LR/NR**: los conceptos que aparecen con proyecto son solo
DC/DFD/DVSF/DVRC/MD. En 2025 sí hay 5 filas LR y 5 NR con proyecto, y el pivot las
cuenta (`Dettaglio anno 2025` fila 13: Felipe Sena 99+16+4+**5**=124).

**DELTA = vendido del grupo − Σ ejecutado de todas las filas del grupo.** 26 celdas de
delta en las cinco hojas, 26 correctas:

```
Lucchetti f12  Meccanico     144 − (62 + 56) = 26   ✓ (L12=26)
Lucchetti f14  Elettricista  104 − (69 + 29) =  6   ✓ (L14=6)
JAV f6         Meccanico     182 − (120 + 56) = 6   ✓
JAV f41        Meccanico     182 − (87 + 76) = 19   ✓
JAV f43        Elettricista  130 − (20 + 48) = 62   ✓
Cibao f7       Meccanico     156 − (63 + 0) = 93    ✓
Pasta f11      Meccanico     156 − (96 + 0) = 60    ✓
```

`J Macedo Brasil- final` usa otra regla: una fila por etiqueta, delta = venduto −
eseguito **de la misma fila**, y admite negativos (L13 = 120 − 154 = −34).

**Todos los totales son derivados, y algunos ya están mal.** `J Macedo` fila 20 declara
K20=943 días ejecutados, pero sus propias filas suman 45+338+154+132+0+166+118 = **953**.
El delta declarado L20=130 frente a la suma real de deltas 0+25−34+39+0+21+69 = **120**.
La fila de totales es coherente consigo misma (1073−943=130) y desconectada de las filas
de arriba. Diez días de error, congelados.

Y hay **dos roll-ups del mismo proyecto que no coinciden**: `Resoconto` J49=1349
(= 385 de CTA 1000 + 401 de PC 4500 + 563 del tercer bloque, verificado) frente a
`J Macedo` J20=1073. La diferencia son exactamente dos filas: Manager Cantiere 20 vs 45
y Auto Meccanico 301 vs 0 → −301+25 = −276 = 1073−1349.

---

## 3. Contradicciones con lo ya construido

| Qué tiene la app hoy | Qué dice el Excel | Qué hay que cambiar | Fase |
|---|---|---|---|
| `projects.oa_number`, `commessa`, `contract_value` (uno por proyecto) | `JAV Brasil` tiene 3 OA / 3 commesse / 3 valores (182.500, 130.000, 182.500) en una hoja | Entidad intermedia `orders(project_id, oa_number, commessa, contract_value, currency_code, scope_label, machine_id NULL)`. **No borrar** `projects.contract_value`: J Macedo no tiene OA y su importe (425.600) vive a nivel proyecto | 2, 6, 7 |
| Decisión previa: «OA y valor mueven a `machines`» | El OA numera correlativo cruzando 3 clientes (0159103 Chile, 0159104 Argentina, 0159105/107/108 Brasil) y uno cubre «PC 4000 + 4 SILOS» | El dueño es la **orden**, no la máquina. La máquina es un atributo de la orden, nullable | 2, 6 |
| `project_sold_days(project_id, role_type_id, phase, sold_days)` | En JAV la clave (proyecto, `Meccanico`, MONTAJE) se repite 3 veces con 182 / 98 / 182 | Colgar de la orden: `order_sold_days(order_id, phase, slot_label, slot_index, sold_days)` | 2, 6, 7 |
| `project_sold_days.role_type_id` = un rol del catálogo | Las etiquetas vendidas (`Supervisore`, `Test - `, `Sofware `, `Meccanico`, `Elettricista`) son un vocabulario **distinto** del `Tipo` de los técnicos. De 27 pares etiqueta↔técnico, solo 9 coinciden literalmente | Catálogo propio de **partidas vendibles por fase**, separado de `role_types` | 2, 7 |
| `project_sold_days` con una fila por rol | El bloque de montaje tiene **dos** renglones `Meccanico` y **dos** `Elettricista` (plazas); el vendido va solo en el primero | Hace falta `slot_index` o una tabla de plazas. Con la PK actual las dos plazas no son representables | 2, 7 |
| Decisión previa: `project_sold_days` gana `technician_id` (titular) | 16 de 43 filas con vendido **no tienen ningún nombre**; Cibao I8/I10 ponen `xxxxxx`; `J Macedo` I12 pone **dos** personas en una celda (`Leomar / Camilo`) | El vendido no se ata a una persona. `technician_id` nullable como asignación informativa, nunca como clave de agregación | 2, 7 |
| `role_types` = {Mecánico, Meccatronico, Eléctrico} | La columna `Tipo` tiene 10 valores en 2025 y 10 en 2026, 17 distintos en total. El catálogo actual cubre el 47 % de 2025 y el 38 % de 2026 | Ampliar a los Tipo reales, normalizando grafías. Faltan `Manager Cantiere`, `Tecnologo`, `Software`, `Aiuto`, `Tecnico`, `Capo Elettricista`, `Auto Meccanico`, `ElectroMecanico` | 2, 6 |
| `technicians.role_type_id` fijo | En 2025 tres técnicos cambian de Tipo dentro del año (7 transiciones), siempre en tramos de fechas contiguos | `role_type_id` pasa a ser **especialidad vigente**: tabla `technician_specialties(technician_id, role_type_id, valid_from)` | 2, 3, 6 |
| `daily_entries.role_type_id?` opcional | El Tipo nunca varía dentro de un mismo día y siempre es el del técnico en esa fecha | **Eliminarlo del parte diario.** Se deriva de la especialidad vigente. Ver §5 | 3, 6 |
| `daily_entries.phase` | **No existe columna de fase en ninguna de las 7.589 filas diarias.** En J Macedo la fase se infiere del año natural (montaje = 2025, collaudo = 2026) | O se captura desde ya en el parte, o se define un corte de fase por orden (`collaudo_desde`). No inventar el dato en la migración | 3, 6, 7 |
| `daily_entries.machine_id` (FK escalar, opcional) | 536/536 filas de JAV sin máquina; 373 filas históricas con **dos o tres** máquinas en la misma celda | Si se quiere el desglose por línea, o `machine_id` obligatorio en la captura, o una asignación técnico↔orden por rango de fechas (que es lo que hacen hoy a mano) | 3, 6, 7 |
| `concept_code` enum con `LR` y `NR` | `Parametros` define **dos** conceptos con la misma sigla `LR`: id 4 «No Remunerado (Sólo EXTERNOS)» e id 5 «Libre Remunerado (Sólo internos)». En 2026 las 2.363 filas `LR` son 1.021 del id 4 y 1.342 del id 5 | Migrar por el **id numérico**, no por la sigla. El enum de la app es correcto (separa NR de LR) siempre que 4→NR y 5→LR | 3, 6 |
| `concept_code` sin `DV` | 2025 usa `DV` (id 3, 71 filas) donde 2026 usa `DVSF`/`DVRC` | Si se migra 2025 hay que decidir el destino de esas 71 filas. No hay dato para desdoblarlas | 6 |
| `IL` en el enum | 0 filas en 2025 y 0 en 2026 | Se queda como código previsto. No dimensionar nada por él | 6 |
| Delta y TOTALE como dato | Ya están desactualizados en el propio Excel (J Macedo 943 vs 953) | Siempre calculados, nunca persistidos | 7 |
| No hay coste ni tarifas | `J Macedo` M/N/O/P: `Coste Unit` × ESEGUITO = `Costo Totale` (6/6 filas exactas) y una segunda tarifa para el delta pendiente | Decidir si la capa económica entra. Hoy no cabe en el esquema | 2, 7 |
| No hay facturación de viajes | `Viaggi`: nº de factura `A-6xx` y euros por técnico/mes/proyecto, 18.008,61 € | Decidir si entra. Hoy se perdería entero | 6, 7 |

---

## 4. Veredicto de las cuatro afirmaciones ya decididas

Las cuatro salieron de `.planning/HALLAZGOS-EXCEL-HOJAS-PROYECTO.md` (2026-07-26).
Dos hay que revertirlas.

### 4.1 «El contrato pertenece a la línea de máquina, no al proyecto» — **MATIZADA**

Correcta en cardinalidad, equivocada en el dueño. Es cierto que `projects.oa_number`,
`commessa` y `contract_value` están en el nivel equivocado: JAV necesita tres juegos.
Pero el dueño no es la máquina, es la **orden (OA)**:

- la numeración es correlativa y cruza clientes y países (0159103 Chile → 0159104
  Argentina → 0159105/107/108 Brasil);
- `OA0159108` cubre «PC 4000 -3430 **+ 4 SILOS**», más de un objeto físico;
- `OA0159105` y `OA0159107` comparten modelo (`PL 6000 KG`) y valor (182.500) y solo se
  distinguen por serie (1-3428 / 2-3429);
- Lucchetti y Pasta Sole tienen OA **sin ninguna máquina nombrada** en su hoja;
- J Macedo tiene dos líneas de máquina y **cero** OA, con el importe a nivel proyecto.

**Acción:** mover los campos a `orders`, con `machine_id` nullable y `scope_label` libre.
Dejar `projects.contract_value` como respaldo para el caso J Macedo.

### 4.2 «El vendido lleva un técnico titular; el ejecutado agrega los técnicos del mismo rol» — **REFUTADA**

La aritmética que sostenía la decisión es correcta (26/26 deltas cuadran), pero las dos
afirmaciones causales son falsas y se tomaron como decisión de esquema.

*No hay titular.* De las 43 filas con vendido, **16 no tienen nombre** (JAV f14/f15/f16,
f26, f32-f34, f49-f51; Cibao f16-f18; Pasta f21-f23). Dos llevan `xxxxxx` (Cibao I8, I10).
Una lleva dos personas en la misma celda (`J Macedo` I12 = `Leomar / Camilo`, 363 días
vendidos). El día vendido no se ata a una persona: se ata a una **plaza**.

*No agrega por rol.* La agregación es por **renglón contiguo de la misma etiqueta dentro
del bloque**, no por `role_type`. Contraejemplo que lo cierra: en `Cibao -Rep D` el
renglón f9 `Elettricista ` está ocupado por **Ivan Cortes**, cuyo Tipo es `Software`, y la
misma hoja tiene un renglón f17 `Sofware ` con ejecutado **0**. Si la regla fuera «por
rol», los 28 días de Ivan caerían en f17. Caen en f9.

**Acción:** revertir «`project_sold_days` gana `technician_id` (titular)» como concepto de
agregación. El campo puede quedarse como asignación informativa nullable, pero el delta
**no** se calcula por rol ni por persona: se calcula por renglón vendido.

### 4.3 «Los roles reales son cinco: añadir Supervisore, Software y Test a `role_types`» — **REFUTADA**

El usuario acertó al frenarla, aunque no por el motivo que dio.

- `Supervisore` aparece **0 veces** en la columna `Tipo` de las 7.589 filas diarias. Solo
  existe en hojas de proyecto. Su equivalente diario es `Manager Cantiere` (Luca Carraro,
  365 filas de 2026) y en `Resoconto` A20 se llama `Manager Cantiere FLA`.
- `Test` aparece **0 veces** en `Tipo`. No es la especialidad de nadie: el único día
  ejecutado en un renglón `Test - ` de todo el libro es `Lucchetti` K22=1, de Andrea
  Scapin, cuyo Tipo es `Eletrico`, y es un DVSF. En sus otras 5 apariciones el renglón
  está sin nombre y con ejecutado 0.
- `Software` **sí** existe en `Tipo`: Ivan Cortes, 287 filas en 2025 y 365 en 2026.

O sea: la corrección del usuario («dependen del técnico, el técnico está especializado en
eso») es correcta para `Software`, aproximadamente correcta para `Supervisore`
(=`Manager Cantiere`) e **incorrecta para `Test`**. Y el mecanismo que propone no es el
real: las etiquetas de la hoja de proyecto no son valores de `Tipo`, son un **vocabulario
comercial distinto** (§5).

**Acción:** no crear los tres como `role_types`. Crear un catálogo aparte de **partidas
vendibles por fase** con seis entradas: montaje {`Supervisore`, `Meccanico`,
`Elettricista`}, collaudo {`Test`, `Sofware`, `Meccanico`}. Y ampliar `role_types` con los
Tipo que sí faltan y hoy no están: `Manager Cantiere`, `Tecnologo`, `Software`, `Aiuto`,
`Tecnico`, `Capo Elettricista`, `Auto Meccanico`, `ElectroMecanico`.

### 4.4 «Los dos bloques son nuestras dos fases (Montaje / Collaudo)» — **CONFIRMADA con un matiz**

Prueba textual en las cinco hojas: `SUPERVISIONE MECCANICA ELETTRICA ` (Lucchetti H9,
JAV I3/I21/I38, Cibao H4, Pasta H8) y `SUPERVISIONE SOFTWARE - ELECT - MECCANICO
-COLLADO` (Lucchetti H20, JAV I12/I30/I47, Cibao H14, Pasta H19); en J Macedo,
H9=`Fase  Montaggio ` y H16=`Fase Collaudo`. `phase = MONTAJE | COLLAUDO` se sostiene.

Dos matices que no estaban en la decisión original:

1. **Las etiquetas de collaudo no son las de montaje.** Aparecen `Test` y `Sofware`, que
   no existen en montaje. Es un catálogo de partidas **por fase**, no el mismo catálogo
   aplicado dos veces.
2. **El bloque de collaudo es una plantilla copiada, no un dato negociado.** Solo hay dos
   variantes en todo el libro: (21, 35, 56) en Lucchetti, Cibao, Pasta y JAV-línea2, y
   (23, 35, 58) en JAV-línea1 y JAV-línea3. Ejecutado 0 en las 18 filas salvo el
   único día de Lucchetti K22. Conviene un valor por defecto en el catálogo.

Corrección adicional a la nota antigua: «en ambas hojas el bloque de collaudo tiene
ejecutado 0» era cierto para JAV y Cibao, pero **no** para Lucchetti (K22=1).

---

## 5. La columna `Tipo`

### 5.1 Qué es

Es la **especialidad con la que el técnico está fichado en esa fecha**. No es un rol por
proyecto y no es la etiqueta de la partida vendida.

### 5.2 Qué valores tiene

Contados sobre las 7.589 filas de datos:

| Hoja `2025` (10 técnicos) | Filas | Hoja `2026` (13 técnicos) | Filas |
|---|---|---|---|
| `Mecanico` (Camilo, Giuliano, Leomar, Leomir) | 1.133 | `Mecanico` (Leomar, Leomir, Giuliano, Camilo) | 1.460 |
| `Tecnologo` (Marco Bosi) | 365 | `Software` (Ivan Cortes) | 365 |
| `Software ` (Ivan Cortes) | 287 | `Meccatronico` (Fredy) | 365 |
| `Meccatronico` (Fredy) | 206 | `Manager Cantiere` (Luca Carraro) | 365 |
| `Elettrico` (Andrea Scapin) | 171 | `Eletrico` (Andrea Scapin) | 365 |
| `ElectroMecanico` (Fredy) | 159 | `Tecnico` (Vito Accini) | 365 |
| `Electtricista` (Felipe Sena) | 143 | `Tecnologo` (Marco Bosi) | 365 |
| `Auto Meccanico` (Felipe Sena) | 124 | `Técnico Eléctrico` (Diego Bautista) | 365 |
| `Electrico ` (Felipe Sena) | 98 | `Eléctrico Senior ` (Felice Ruocco) | 365 |
| `tecnico` (Vito Accini) | 80 | `Aiuto` (Felipe Sena) | 365 |
| `Capo Elettricista` (Ivan Cortes) | 78 | | |

17 grafías distintas. `Elettrico`/`Eletrico`/`Electrico `/`Electtricista`/`Técnico
Eléctrico`/`Eléctrico Senior ` son seis escrituras que probablemente colapsan en dos o
tres roles reales. `Auto Meccanico` es casi seguro errata de **`Aiuto` Meccanico**:
Felipe Sena es `Auto Meccanico` en 2025 y `Aiuto` en 2026.

### 5.3 ¿Es del técnico o del parte diario? — medido

- **En 2026 es constante por técnico:** 13 técnicos × 365 filas, un único Tipo cada uno.
  Cero excepciones.
- **En 2025 no:** tres de diez técnicos cambian. Ivan Cortes {`Software `287,
  `Capo Elettricista` 78}; Fredy Sarmiento {`ElectroMecanico` 159, `Meccatronico` 206};
  Felipe Sena {`Electrico ` 98, `Auto Meccanico` 124, `Electtricista` 143}.
- **Pero los cambios son por tramos de fechas contiguos, siete en total**, y verifiqué que
  las filas están en orden cronológico estricto dentro de cada técnico en ambas hojas:

  ```
  fila 1262  Ivan Cortes      → Capo Elettricista   desde 15/06/2025
  fila 1340  Ivan Cortes      → Software            desde 01/09/2025
  fila 1621  Fredy Sarmiento  → Meccatronico        desde 09/06/2025
  fila 1909  Felipe Sena      → Auto Meccanico      desde 24/03/2025
  fila 1970  Felipe Sena      → Electrico           desde 24/05/2025
  fila 1986  Felipe Sena      → Auto Meccanico      desde 09/06/2025
  fila 2049  Felipe Sena      → Electtricista       desde 11/08/2025
  ```

**Conclusión: `Tipo` es un atributo del técnico con vigencia temporal.** Con una tabla
`technician_specialties(technician_id, role_type_id, valid_from)` de 10 + 13 + 7 filas se
reproduce el 100 % de las 7.589 filas, incluidos los pivots por Tipo de `Resoconto`
(A9:G14). No hace falta pedirle el rol al técnico en cada parte diario.

Dos lectores discrepan aquí y conviene decirlo: uno concluyó «es atributo del técnico»
mirando solo 2026, otro concluyó «es de la entrada, hay que capturarlo por fila» mirando
2025. **Ninguno de los dos tiene razón del todo.** La evidencia decisiva es que los
cambios de 2025 caen en **tramos de fechas contiguos**, no fila a fila: eso descarta el
campo por-entrada (sería pedirle al técnico un dato que él ya tiene fijo durante meses) y
descarta también el campo único e inmutable en `technicians`.

Un aviso: uno de los verificadores atribuyó a Giuliano Lodi el Tipo `Tecnologo`. Es falso.
En 2026 Giuliano Lodi es `Mecanico` (365/365); `Tecnologo` es Marco Bosi.

### 5.4 Relación con las etiquetas de las hojas de proyecto

**No hay relación fiable.** Crucé los 27 pares (etiqueta del renglón, técnico escrito al
lado) de las cinco hojas contra el Tipo de 2026:

- **9 coinciden** tras normalizar (`Meccanico`↔`Mecanico`, `Sofware`↔`Software`):
  Lucchetti f12/f23/f24, JAV f6/f8/f24/f41/f43, Cibao f7.
- **3 coinciden por familia**: `Elettricista ` con `Técnico Eléctrico` (Lucchetti f14),
  con `Eléctrico Senior ` (Lucchetti f15, Pasta f13).
- **15 no coinciden** (55 %): los 5 `Supervisore `→`Manager Cantiere`; `Meccanico`→Vito
  Accini (`Tecnico`) ×2; `Meccanico`→Felipe Sena (`Aiuto`) ×3;
  `Elettricista `→Fredy Sarmiento (`Meccatronico`) ×2; `Elettricista `→Ivan Cortes
  (`Software`); `Test - `→Andrea Scapin (`Eletrico`).

Y el mismo Ivan Cortes ocupa cuatro etiquetas distintas según dónde se mire:
`Elettricista ` (Cibao I9), `Sofware ` (Lucchetti I23), `Capo Elettricista`
(J Macedo H13) y `Softwerista` (J Macedo H18).

**Lo que une informe y bitácora es el nombre de la persona, no la etiqueta.** Prueba
aritmética: `J Macedo` f13, renglón `Capo Elettricista`, ESEGUITO=154 = **todos** los días
de Ivan Cortes en JMACEDO 2025 (58 con Tipo `Capo Elettricista` + 96 con Tipo `Software `).
La etiqueta ignora el Tipo. Y f12, renglón `Meccatronico`, ESEGUITO=338 = todos los
`Mecanico` de JMACEDO 2025 (Camilo 130 + Leomar 160 + Leomir 27 + Giuliano 21), aunque
Giuliano no figura en el `Leomar / Camilo` de la celda de al lado.

### 5.5 Qué implica para el esquema

| Campo | Veredicto |
|---|---|
| `technicians.role_type_id` | Se queda, pero como **especialidad vigente**. Necesita historia: `technician_specialties(technician_id, role_type_id, valid_from)`. Sin ella se pierden los 78 días de Ivan Cortes como `Capo Elettricista` y los 124 de Felipe Sena como `Auto Meccanico`. |
| `daily_entries.role_type_id?` | **Sobra.** En las 7.589 filas históricas es 100 % derivable de (técnico, fecha). Guardarlo es duplicar un dato que ya tiene dueño y abrir la puerta a que diverja. Si se conserva, que sea columna calculada al cerrar el parte, no un campo que el técnico elige. |
| `project_sold_days.role_type_id` | **Mal tipado.** La etiqueta vendida no es un `role_type`: `Test` no es la especialidad de nadie y `Supervisore` tampoco existe como Tipo. Catálogo propio de partidas por fase. |

---

## 6. Las dos cuadrículas de los tableros

### 6.1 KPI-07 — cuadrícula de días por concepto (reemplaza `Dettaglio anno …`)

**Fuente exacta:** `Dettaglio anno 2026` (115 filas) y su gemela de 2025. La misma
cuadrícula, filtrada a un proyecto, se repite en la esquina superior izquierda de las
cinco hojas de proyecto (p. ej. `Lucchetti Chile ` A5:F27).

**Filtro:** `Año` (celda B6 en la hoja 2026; B5 en las hojas de proyecto). En las hojas de
proyecto hay además un filtro implícito de proyecto.

**Filas — jerarquía de tres niveles, en este orden:**

1. Proyecto (`JMACEDO`, `LUCCHETTI CHILE SA`, …) — fila de subtotal.
2. Técnico dentro del proyecto — fila de subtotal.
3. Mes, con la etiqueta `NN_Mes` (`01_Enero `, `02_Febrero`, …) — fila de detalle.

Ejemplo literal (filas 10-14 de `Dettaglio anno 2026`):

```
JMACEDO                 243   47   —   11   1   302
  Fredy Sarmiento        50   11   —    2   —    63
    01_Enero              6    —   —    1   —     7
    02_Febrero           21    7   —    —   —    28
    03_Marzo             23    4   —    1   —    28
```

**Columnas:** una por concepto **presente ese año**, más `Total general`. En 2026 son
`DC, DFD, MD, DVSF, DVRC`; en 2025 son `DC, DFD, DV, LR`. El requisito KPI-07 dice «los 8
conceptos»: en el Excel las columnas vacías **no se dibujan**. Recomendación: mantener las
8 del enum y suprimir las que salgan a cero, para que la cuadrícula siga siendo legible.

**Celdas:** `COUNT` de partes diarios, no suma de días. Un medio día (`MD`) cuenta **1**,
igual que un día completo. Verificado en `Resoconto` fila 17 (GREECE: 17+3+3+4 = 27) y en
el total 2026 (1.109+185+4+60+15 = 1.373 = filas con proyecto).

**Totales:** columna `Total general` a la derecha de cada fila, y fila `Total general` al
pie (fila 115: 1.109 / 185 / 4 / 60 / 15 / 1.373). Los subtotales de proyecto y técnico son
sumas de sus hijos.

**Orden:** el del Excel es el de aparición en la bitácora (JMACEDO, LUCCHETTI, GREECE,
MOLINO CIBAO - RD, MAIZAL, JAV, MOLINOS 3 ARROYOS, Pasta Sole, MOLINO CIBAO, LUCCHETTI_Ch)
y **no** es alfabético. Es un artefacto de la tabla dinámica; la app debe fijar un orden
determinista propio (proyecto y técnico alfabéticos, mes ascendente) y decirlo.

**Variantes a considerar como filtros de la misma cuadrícula, no como tableros nuevos:**
`Calendar` es la misma cuadrícula con las columnas al nivel de **día del mes** y filtrada
a viajes; `Viaggi` es la misma filtrada a viajes con agregación por mes.

### 6.2 KPI-08 — cuadrícula comercial por línea (reemplaza `Resoconto` y el bloque derecho de las hojas de proyecto)

**Se repite una vez por orden (OA).** En JAV, tres veces en la misma hoja: filas 1-16,
18-34 y 35-51.

**Cabecera** (JAV línea 1, fila 1): `OA0159105` | `COMMESSA 342898` | `182500` |
`PL 6000 KG - 1-3428`. En Cibao la máquina va arriba (H1) y el OA debajo (H2). En Lucchetti
y Pasta Sole no hay etiqueta de máquina. En J Macedo no hay ni OA ni commessa: solo
`GENERALE` | `Totale` | `425600`.

**Dos bloques, en este orden fijo:**

**Bloque 1 — MONTAJE.** Título `SUPERVISIONE MECCANICA ELETTRICA `. Cabecera
`VENDIDO | EJECUTADO | Delta`. Cinco renglones fijos:

| # | Etiqueta | Técnico | Vendido | Ejecutado | Delta |
|---|---|---|---|---|---|
| 1 | `Supervisore ` | Luca Carraro | 10 (15 en JAV-1) | 0 | = vendido |
| 2 | `Meccanico` | técnico o vacío | sí | sí | vendido − Σ(ej. 2 y 3) |
| 3 | `Meccanico` | técnico, vacío o `xxxxxx` | **vacío** | sí | vacío |
| 4 | `Elettricista ` | técnico o vacío | sí | sí | vendido − Σ(ej. 4 y 5) |
| 5 | `Elettricista ` | técnico, vacío o `xxxxxx` | **vacío** | sí | vacío |

Cierra con una fila `TOTALE ` que lleva **solo** vendido y ejecutado, sin delta
(Lucchetti J16=258 K16=216; Cibao J11=270 K11=91; JAV K10=327 L10=274, K28=200 L28=31,
K45=322 L45=231). Verificado: 258 = 10+144+104 y 216 = 62+56+69+29.

**Bloque 2 — COLLAUDO.** Título `SUPERVISIONE SOFTWARE - ELECT - MECCANICO -COLLADO`.
Misma cabecera. Tres renglones fijos: `Test - `, `Sofware `, `Meccanico`, con vendido
(21, 35, 56) o (23, 35, 58), ejecutado casi siempre 0 y delta = vendido. **No lleva fila
`TOTALE`** en ninguna de las cuatro hojas españolas.

**Reglas de cálculo de la cuadrícula:**

- `delta = vendido_del_renglón − Σ(ejecutado de todos los renglones de su grupo)`.
- El vendido y el delta se muestran **solo en el primer renglón de cada grupo de
  etiqueta**; los renglones siguientes son plazas del mismo cupo.
- `ejecutado` = COUNT de partes diarios de ese técnico en esa orden y fase.
- Los totales son derivados. El Excel tiene al menos uno mal (J Macedo K20=943 vs 953
  real) y otro que falta (Pasta Sole no tiene total de vendido; su `TOTALE ` está
  desplazado a la columna J y solo lleva K15=129).

**Variante J Macedo (a decidir si se soporta):** una fila por etiqueta (sin plazas),
delta por fila con negativos permitidos, y cuatro columnas más: `Coste Unit`,
`Costo Totale` (= coste unitario × **ejecutado**, verificado 45×550=24.750,
338×270=91.260, 154×368=56.672, 132×227=29.964, 166×368=61.088, 118×270=31.860) y, en
collaudo, tarifa y coste del **delta pendiente** (500×21=10.500 y 350×69=24.150).

**Roll-up de proyecto:** existe en `Resoconto` como bloque `GENERALE` que suma las líneas
(1349 = 385 + 401 + 563, verificado). Debe ser **calculado**: en el Excel las dos versiones
del mismo roll-up ya divergen (1.349 vs 1.073).

---

## 7. Datos que la app perdería

Todo lo siguiente está en el Excel y **no** se puede derivar de la bitácora diaria con el
modelo propuesto:

1. **El reparto del ejecutado entre líneas de máquina.** En JAV los 536 días se reparten
   120/31, 56/76, 55/20, 43/48, 87 entre tres OA, y la columna `Maquina` está vacía en las
   536 filas. El criterio real es un corte de mes anotado a mano (`Fino a Marzo`, celda
   N7). Sin capturar máquina u orden en el parte, este desglose desaparece.
2. **La fase de cada día.** No hay columna de fase en ninguna de las 7.589 filas. En
   J Macedo se deduce del año natural (montaje = 2025, collaudo = 2026), verificado:
   `Meccanico` collaudo 118 = Leomar 84 + Leomir 34 de 2026.
3. **La etiqueta de la partida contra la que se imputa el día.** `Test`, `Sofware`,
   `Supervisore`, `Softwerista` no existen en la bitácora.
4. **La capa económica de J Macedo:** tarifas por partida (550 Manager, 270 Mecánico/
   Meccatronico, 368 Eléctrico/Software, 227 el otro eléctrico), coste total 323.657, coste
   del delta pendiente (10.500 + 24.150), `Totale` 425.600 y el bloque `Gastos` (13.000 más
   cuatro celdas `#REF!`).
5. **La facturación de viajes** de la hoja `Viaggi`: 19 filas técnico/mes/proyecto, 24 días,
   números de factura `A-607/614/615/640/642/644/645/649` y 18 importes que suman
   18.008,61 €, más el control «ok» por factura. Y ojo: hay 18 importes para 19 filas y dos
   de ellos cuelgan de la fila `Total general` — la columna de euros está **pegada al lado
   del pivot**, no dentro, y ya no cuadra fila a fila. Es un dato que hay que recapturar,
   no migrar.
6. **Las plazas presupuestadas sin cubrir** (`xxxxxx`, celdas en blanco): 16 de 43 filas
   con vendido. Si el modelo exige técnico, hay que inventarlo.
7. **El historial de especialidad** si `technicians.role_type_id` se queda sin vigencia:
   78 días de Ivan Cortes como `Capo Elettricista`, 124 de Felipe Sena como
   `Auto Meccanico`, 159 de Fredy como `ElectroMecanico`.
8. **Cifras tecleadas que no se reconstruyen desde ningún dato.** No son pérdida, son
   basura que conviene no arrastrar, pero hay que avisar a FAVA de que desaparecerán:
   `J Macedo` K18=166 para Ivan Cortes (sus días reales son 154 en 2025 y 116 en 2026),
   K11=45 para Luca Carraro (tiene 5 días reales en JMACEDO 2026), N15=28.063 de coste con
   0 días y 0 de tarifa, `Resoconto` K40=332 para el mismo Luca Carraro.
9. **25 días de trabajo real que hoy quedan fuera de los informes por nombre duplicado:**
   `LUCCHETTI CHILE SA_Ch` (15 días de Marco Bosi) y `MOLINO CIBAO BOCEL ` (10 días de
   Giuliano Lodi, máquina `Reemplazo de tapetes `). Los pivots de Lucchetti (217) y Cibao
   (91) no los recogen. Aquí la app **gana**: con proyecto por FK esto no vuelve a pasar.
10. **Las notas sueltas al margen** (`Fino a Marzo`), que es donde vive el criterio de
    reparto.

---

## 8. Preguntas abiertas para FAVA

**Sobre el OA y el contrato**

1. ¿El OA es un pedido de asistencia de FAVA SpA (numeración correlativa global
   0159103-0159108 repartida entre Lucchetti, Pasta Sole y JAV) o un número del cliente?
2. ¿El sufijo `98` de la commessa significa «asistencia» y el `00` «fabricación»? Si es
   así, ¿basta con guardar el número de job de la máquina?
3. J Macedo tiene dos líneas de máquina y ningún OA. ¿Es un proyecto anterior a este
   régimen, o le falta emitir el OA?
4. `OA0159108` = «PC 4000 -3430 **+ 4 SILOS**». ¿Un OA puede cubrir varias máquinas?
5. ¿Qué es exactamente `N8 = 425.600` en la hoja de J Macedo? No cuadra con el coste
   calculado (323.657) ni con coste + pendientes (358.307).

**Sobre las partidas vendidas y las fases**

6. ¿Cuál es el catálogo oficial de partidas vendibles? Observado: montaje
   {Supervisore, Meccanico ×2, Elettricista ×2}, collaudo {Test, Sofware, Meccanico}.
   ¿Son siempre 5 + 3 renglones o depende del contrato?
7. ¿Qué es `Test` exactamente? No es la especialidad de nadie y tiene 0 días ejecutados en
   5 de sus 6 apariciones.
8. Los días vendidos de collaudo son siempre (21, 35, 56) o (23, 35, 58). ¿Estándar
   comercial (valor por defecto) o negociado por contrato?
9. ¿Cómo se decide a qué fase pertenece un día trabajado? ¿Sirve una fecha de inicio de
   collaudo por orden, o hay que preguntarlo en el parte diario?
10. ¿Los renglones sin técnico (`xxxxxx`, 16 de 43) son plazas presupuestadas pendientes de
    cubrir? ¿La app debe permitirlas vacías?

**Sobre el reparto por máquina**

11. En JAV los 536 días se reparten entre tres OA por corte de mes, hecho a mano. ¿Se va a
    pedir la máquina o el OA en el parte diario, o se prefiere asignar técnico→orden por
    rango de fechas (que es lo que hacen hoy)?
12. Hay filas cuya «máquina» son varias (`PL 6000 PC 4500`, 290 filas) o directamente un
    servicio (`Reemplazo de tapetes `, 10 filas). ¿Un día puede cargarse a más de una
    máquina?

**Sobre los técnicos y el Tipo**

13. ¿El `Tipo` es la especialidad del técnico con fecha de vigencia (que es lo que muestran
    los datos: 7 cambios en tramos contiguos en 2025, ninguno en 2026), o cambia por
    proyecto?
14. ¿`Aiuto` (2026, Felipe Sena) es lo mismo que `Auto Meccanico` (2025, el mismo Felipe) y
    en realidad es «Aiuto Meccanico»? ¿Es una especialidad o un nivel (ayudante)?
15. ¿`Leomar Klein`, `Leomir Klein ` (2026) y `Leomir Kleir` (2025) son dos personas o
    tres grafías de una? En 2026 los dos tienen 365 días completos y ambos imputan a
    JMACEDO (84 y 34 días). De la respuesta dependen 87 días de JAV y el reparto 84/34.
16. ¿Cuántos roles reales hay detrás de las seis grafías eléctricas (`Elettrico`,
    `Eletrico`, `Electrico `, `Electtricista`, `Técnico Eléctrico`, `Eléctrico Senior `)?
17. `Marco Bosi` (Tecnologo) tiene 365 filas en 2026 y cero días de proyecto salvo los 15
    de `LUCCHETTI CHILE SA_Ch`. ¿Sigue activo?

**Sobre conceptos y migración**

18. `Parametros` define dos conceptos con la sigla `LR` (id 4 «No Remunerado, solo
    EXTERNOS» e id 5 «Libre Remunerado, solo internos»). ¿Confirmamos que 4 → `NR` y
    5 → `LR` en el enum de la app? Son 1.021 filas de 2026 que hoy se leerían al revés.
19. Las 71 filas `DV` de 2025 (un solo concepto de viaje) ¿se migran como `DVSF`, como
    código legado, o se desambiguan a mano?
20. ¿`MD` (medio día) consume medio día vendido o uno entero? Todos los pivots lo cuentan
    como 1.
21. ¿Un día de viaje (`DVSF`/`DVRC`) y un festivo (`DFD`) consumen día vendido igual que un
    `DC`? Hoy sí.
22. ¿`LUCCHETTI CHILE SA_Ch` y `MOLINO CIBAO BOCEL ` (con máquina «Reemplazo de tapetes»)
    son proyectos aparte, sub-trabajos o postventa? Son 25 días hoy invisibles.
23. ¿Se migra el histórico 2025 o solo 2026? En 2025 hay que resolver `DV`, `NR`, los Tipo
    por tramos y los nombres de proyecto (`GRUPO BOCEL-RD` = `MOLINO CIBAO BOCEL - RD`,
    `MAIZAL FOOD GROUP CORP- Venezuela` = `MAIZAL GROUP - CUMANA`, `MOLINOS TRES ARROYOS` =
    `MOLINOS 3 ARROYOS ARGENTINA`, `Eurimac_ Grecia kilkis` = `GREECE - KILKIS EURIMAC `).
24. Los técnicos tienen la rejilla del año entero pregenerada y rellena de `LR` hasta el
    31 de diciembre (Diego Bautista: todo desde el 19 de julio; Marco Bosi: 350 de 365).
    ¿Se descarta ese relleno al migrar?

**Sobre la capa económica**

25. Las tarifas de J Macedo (550 / 270 / 368 / 227 €-día, más 500 y 350 para los días
    pendientes) ¿son por partida, por persona o por contrato? Dos eléctricos tienen 368 y
    227.
26. ¿La app debe llevar coste y margen, o solo días?
27. ¿Los viajes facturados (`Viaggi`: facturas `A-6xx`, 18.008,61 €) entran en la app o se
    quedan fuera?

**Sobre discrepancias que hay que arbitrar**

28. `J Macedo` fila 20 declara 943 días ejecutados; sus filas suman 953. ¿Cuál vale?
29. El mismo proyecto tiene dos roll-ups distintos: 1.073 días vendidos (`J Macedo` J20) y
    1.349 (`Resoconto` J49). ¿Cuál es el bueno? Difieren en Manager Cantiere (45 vs 20) y
    Auto Meccanico (0 vs 301).
30. ¿De dónde salen los 166 días de `Softwerista` y los 45 de `Manager Cantiere FLA` en
    J Macedo? No se reconstruyen desde 2025 ni desde 2026.
31. Hay 20 celdas `#REF!` en `Resoconto` (incluidos dos `TOTALE`) y 4 en `J Macedo`.
    ¿Existe una versión anterior del fichero de la que recuperarlas, o se dan por perdidas?
