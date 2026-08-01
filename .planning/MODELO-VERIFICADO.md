# El modelo real, releído con la grabación de Andrea delante

Segunda lectura completa del Excel (14 hojas, 7.589 filas de bitácora), esta vez
con la explicación de Andrea del 2026-07-28 como guía. Todo lo que sigue está
**medido sobre los datos**, no inferido. Donde hay una cita, es literal de la grabación.

La primera lectura describió bien la forma de las hojas pero se equivocó al
interpretar tres cosas, porque leyó los datos sin saber qué proceso los produjo.

---

## 1. El problema de fondo, demostrado

Andrea explica que reparte los días de un técnico entre las máquinas del proyecto:

> *«este Camilo Cruz trabajó en dos máquinas el mismo día… entonces yo qué hago,
> yo decido agotar mis horas en la 34-28»*

Eso es exactamente lo que hacen los datos. En JAV Marata:

| Técnico | Días en la bitácora | Reparto por máquina en la hoja de proyecto |
|---|---|---|
| Camilo Cruz | 151 | 120 (PL 6000 №1 / 3428) + 31 (PC 4000 / 3430) |
| Felipe Sena | 132 | 56 (№1 / 3428) + 76 (PL 6000 №2 / 3429) |
| Andrea Scapin | 75 | 55 (№1 / 3428) + 20 (№2 / 3429) |
| Fredy Sarmiento | 91 | 43 (№1 / 3428) + 48 (№2 / 3429) |
| Leomir Klein | 87 | 87 (№2 / 3429) |

**Los cinco concilian al día exacto.** Y sin embargo:

> **De las 536 filas de bitácora de JAV, 0 dicen en qué máquina fue.**

El reparto 120/31 no sale de ningún dato: lo decide Andrea a mano. Ese es el
trabajo manual que la app elimina, y es la razón por la que la bitácora tiene que
capturar la commessa. No es un "nice to have" — es el único insumo que hoy no existe.

A escala del Excel entero: **1.766 de 2.774 jornadas trabajadas (64%) no dicen máquina.**

---

## 2. El vendido es por ROL, no por persona — confirmado al número

Andrea, sobre el resumen de cotización:

> *«pongo supervisor, mecánico —en este caso son dos mecánicos—, electricista…
> yo ya sé cuánto vendí. Mira: 10, 144 y 104»*

Hoja `Lucchetti Chile `, bloque de montaje. Son literalmente esos números:

| Rol | Vendido | Asignados | Ejecutado | Delta |
|---|---|---|---|---|
| Supervisore | **10** | Luca Carraro | 0 | 10 |
| Meccanico | **144** | Leomar Klein · Vito Antonio Accini | 62 + 56 = 118 | **26** |
| Elettricista | **104** | Diego Bautista · Felice Ruocco | 69 + 29 = 98 | **6** |

`144 − 62 − 56 = 26` ✓ y `104 − 69 − 29 = 6` ✓

El delta se calcula contra la **suma del grupo de rol**. El número aparece en la
fila del primer técnico solo por maquetación de la hoja — no es su cuota.
Esto cierra definitivamente lo del "técnico titular": no existe tal cosa.

En JAV hay bloques de rol **sin nadie asignado todavía** (vendido puesto, columna
de persona vacía). La asignación es opcional y posterior a la venta.

---

## 3. Cada máquina es una entidad con su propia orden

`JAV Brasil` — el ejemplo que usa Andrea (*«esta empresa que se llama YAP tiene
tres máquinas»*):

| Máquina | OA | Commessa | Valor |
|---|---|---|---|
| PL 6000 KG — №1 | OA0159105 | 342898 (`3428`) | 182.500 |
| PL 6000 KG — №2 | OA0159107 | 342998 (`3429`) | 182.500 |
| PC 4000 + 4 silos | OA0159108 | 343098 (`3430`) | 130.000 |

Dos máquinas **del mismo modelo**, distinguibles únicamente por la commessa. Es
palabra por palabra lo que Andrea dice: *«las máquinas se llaman igual pero tienen
una comesa diferente»*.

La commessa corta que ella pronuncia (`3428`) son los 4 primeros dígitos de la
commessa larga (`342898`). Los OA son correlativos **cruzando máquinas y clientes**
(Lucchetti es OA0159103), lo que confirma que el dueño del contrato es la orden.

---

## 4. Dos fases por máquina, y una precede a la otra

Cada máquina lleva dos bloques de vendido:

1. `SUPERVISIONE MECCANICA ELETTRICA` → **montaje**
2. `SUPERVISIONE SOFTWARE - ELECT - MECCANICO -COLLADO` → **collaudo**

> *«la parte del collaudo… quiere decir pruebas, la traducción es eso»*
> *«para que haya supervisión y pruebas, yo tengo que tener toda esta primera parte montada»*

El segundo bloque incluye roles que el primero no tiene: `Test -` y `Sofware`.
En Lucchetti el collaudo está vendido (21 + 35 + 56) y **ejecutado casi en cero** —
el proyecto aún no llegó a pruebas. El delta enorme no es una desviación, es una
fase que no ha empezado. La app no debe pintarlo como alarma.

---

## 5. El rol SÍ va por jornada — y ahora hay prueba

La lectura anterior concluyó que `role_type_id` sobraba porque el `Tipo` cambia en
tramos contiguos. La medición era correcta:

```
Iván Cortés · JMACEDO 2025
  Capo Elettricista   2025-06-16 → 2025-08-31
  Software            2025-09-01 → 2025-12-20
```

Dos tramos limpios. Pero la conclusión era falsa, y la razón está en la estructura:

> **En 7.589 filas hay 0 casos de un técnico con dos filas la misma fecha.**
> El Excel tiene UNA columna `Tipo` y UNA fila por técnico-día. Es físicamente
> incapaz de registrar dos roles el mismo día.

Los tramos son contiguos porque la herramienta no admite otra cosa. Andrea:

> *«este mismo Felipe puede ser software, o este Iván puede ser electricista y
> softwareista… Iván acá en Cibao está trabajando en la parte eléctrica pero
> también me va a hacer software. Es importante que puedan anunciar qué rol está haciendo»*

Y en los datos de 2026, Iván en Cibao aparece con **28 filas, todas `Software`** —
la parte eléctrica que ella describe no está registrada en ningún sitio.

`daily_entries.role_type_id` **se queda**. La tabla de vigencias de especialidad es
un añadido útil (para proponer el valor por defecto), no un reemplazo.

Lección que conviene no repetir: *el histórico no revela los requisitos que la
herramienta actual no puede expresar.*

---

## 6. Suciedad medida, para la migración

**El campo Máquina es texto libre** — 11 valores distintos, 13,3% de relleno:

- `'PL 6000 PC 4500'` (290 filas) son **dos máquinas sin separador**
- `'CTA1000,PC4500'` (7) y `'CTA1000/PL6000'` (6) — dos, con separador distinto cada vez
- `'Pasta Corta 340300 / Pasta Larga 340200 / Nidos 340400'` (56) — tres máquinas **con la commessa embebida en el texto**
- `'Pasta Lunga  PL 6000'` — doble espacio
- `'Reemplazo de tapetes'` (10) y `'Sin Maquina'` (9) — no son máquinas

**El catálogo `Parametros` tiene 8 entradas y los datos usan 15 combinaciones:**

| Nº | Código | Etiqueta oficial |
|---|---|---|
| 1 | DC | Dia completo - En Fabrica |
| 2 | DFD | Dia Festivo/Dominical - En Fabrica |
| 3 | DVSF | Dia de viaje - Salida Fabrica |
| 6 | DVRC | Dia de viaje - Retorno Casa |
| 4 | **LR** | No Remunerado (Sólo EXTERNOS) |
| 5 | **LR** | Libre Remunerado (Sólo internos) |
| 8 | MD | Medio dia |
| 9 | IL | Reposo por incapacidad laboral |

- **El catálogo tiene un error de origen:** el 4 y el 5 comparten el código `LR`.
  Alguien lo notó y tecleó `NR` a mano en 560 filas — pero otras 1.021 filas del
  concepto 4 siguen con `LR`. Al migrar, el concepto manda sobre el código.
- **`En Fabrica` es un modificador, no un concepto.** El catálogo lo lleva pegado a
  la etiqueta del 1 y del 2, pero los datos usan las dos variantes bajo el mismo
  número (1.109 «En Fabrica» y 1.133 sin). Va como booleano, no como dos entradas.
- **`DV` (71 filas) no está en el catálogo** — solo existen DVSF y DVRC.
- **`IL` no se usa nunca** y el número 7 no existe.

**El 63% de las filas son «Sin Proyecto»** (4.810): días libres, no remunerados de
externos y 1.009 filas completamente vacías. El Excel es una rejilla de calendario
técnico × día del año, no un registro de trabajo. Solo 2.774 filas son jornadas
reales. Esto cambia el tamaño esperado de la migración.

**Alias de técnico**: `Leomar Klein`, `Leomir Klein` y `Leomir Kleir` conviven. En
la grabación Andrea se corrige sola (*«Leomar, Leomir, perdón»*), así que hay que
confirmarle si son una persona o dos antes de fusionar nada.

---

## 7. Para quién es esto

> *«yo me siento con Luca… él, como no sabe hacerle una actualización a la data,
> pues no sabe mirar los datos»*

El dato existe; lo que no existe es el acceso. Vive en una tabla dinámica que solo
Andrea sabe refrescar. Y lo que ella pide como prioridad número uno:

> *«Para mí esta es la más importante: que me digas en ese proyecto Lucchetti están
> trabajando Andrea, Leomar, Vito, Diego, Felipe, y que Andrea trabajó un día,
> Leomar ha trabajado sesenta y dos»*

Eso es KPI-07, y ahora está confirmado contra la fuente.

---

## 8. Alcance nuevo que no está en ningún documento

> *«yo necesito que el cotizador venga en español y venga en italiano, y en inglés
> también, o portugués»*

Un **cotizador multiidioma**. Es el origen del vendido, aguas arriba de todo lo
que estamos construyendo. La grabación se corta justo cuando iba a explicarlo
(*«si quieres esta parte la cerramos y yo te abro lo de los cotizadores»*).
Sin decidir.

---

## Qué cambia en el modelo

| Entidad | Corrección |
|---|---|
| `orders` | Una por máquina contratada: OA, commessa larga + corta, valor, moneda |
| `project_sold_days` | Clave (orden, **fase**, rol) — sin técnico. Fase ∈ {montaje, collaudo} |
| `project_assignments` | (orden, fase, rol, técnico) — N por grupo, puede estar vacío |
| `daily_entries.role_type_id` | **Se mantiene.** Lo declara el técnico |
| `daily_entries.order_id` | Nuevo y obligatorio en jornadas con proyecto — es lo que hoy falta |
| `technician_specialties` | Aditivo: sugiere el rol por defecto, no lo impone |
| `day_concepts` | 8 entradas + booleano `in_factory`. Resolver el choque LR/NR por número |
| Ejecutado y delta | Nunca se persisten. Delta = vendido − Σ(ejecutado del grupo de rol) |
