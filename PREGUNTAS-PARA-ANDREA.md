# Preguntas pendientes — Control Técnico FAVA

**Actualizado:** 2026-08-01
**Para:** resolver con Andrea / mirando el Excel.

Todo lo que falta por decidir está aquí. Cada pregunta dice **qué bloquea** y **por qué
no la puedo resolver yo**. Están ordenadas por lo que desbloquean.

Las que tienen 🔴 bloquean trabajo que ya está construido y esperando datos.

---

## 🔴 1. ¿A qué rol se refiere «Elettricista» en la cotización?

**Bloquea:** la matriz vendido vs. ejecutado (KPI-01 y KPI-08) — o sea, el tablero que
Andrea quiere que Luca mire cada semana.

**El problema.** Las hojas de proyecto usan 6 etiquetas para el vendido. Cuatro se
resuelven solas contra los datos; una no, y una no existe:

| Etiqueta del Excel | Resuelve a | Cómo lo sé |
|---|---|---|
| `Supervisore` | **Manager Cantiere** | Luca Carraro es el único, y es el Supervisore en las 5 hojas |
| `Meccanico` | **Mecanico** | Camilo, Giuliano, Leomar, Leomir |
| `Sofware` | **Software** | Iván Cortés, 480 jornadas |
| `Test` | **nadie** | 0 días ejecutados en todo el libro salvo 1 |
| **`Elettricista`** | **❓** | seis candidatos, ver abajo |

En el catálogo hay **seis** roles que podrían ser «el eléctrico», todos nacidos de las
grafías del Excel:

```
Eletrico            365 jornadas   (Andrea Scapin)
Elettrico           171            (Andrea Scapin)
Electrico            97            (Felipe Sena)
Electtricista       143            (Felipe Sena)
Técnico Eléctrico   365            (Diego Bautista)
Eléctrico Senior    365            (Felice Ruocco)
Capo Elettricista    78            (Iván Cortés)
```

**Parte sí es idioma, y está comprobado**: Andrea Scapin tiene `Eletrico` y `Elettrico`
—la misma palabra con una *t* o dos—, y Felipe Sena tiene `Electrico` y `Electtricista`.
Fusionar esas sí es seguro.

**Pero parte no lo es**: Iván tiene `Software` (480 días) **y** `Capo Elettricista` (78),
que es exactamente lo que Andrea dijo en la grabación —*«este Iván puede ser electricista
y softwareista»*—. Y `Eléctrico Senior` frente a `Técnico Eléctrico` frente a
`Capo Elettricista` huele a jerarquía, no a traducción. Fusionar a ciegas borraría el
dato que ella pidió capturar.

### Lo que hay que preguntar

> Cuando la cotización dice «Elettricista» y vende 104 días, ¿se refiere a una persona
> concreta, a cualquier eléctrico, o es una **partida comercial** que no apunta a nadie?

**Mi lectura**, para contrastar: es una partida comercial. `role_types` registra *qué hizo
alguien un día*; el vendido registra *cuánto se contrató*. Iván con «Software 480 días +
Capo Elettricista 78» es un hecho de calendario; «Elettricista 104» es una cantidad
negociada. Si se confirma, el vendido debería colgar de un **catálogo aparte de partidas
vendibles por fase** (montaje: Supervisore/Meccanico/Elettricista; collaudo:
Test/Sofware/Meccanico) y no de `role_types` — y entonces la pregunta de arriba
desaparece, porque no hay que mapear nada.

### Bonus, si se resuelve lo anterior

`Test` se vende siempre (21 o 23 días en las 6 órdenes) y **nunca se ejecuta** — 0 días en
todo el libro salvo uno de Andrea Scapin en Lucchetti, que además es un día de viaje.
¿Es una partida que se cotiza por costumbre y no se usa, o se ejecuta y no se registra?

---

## 🔴 2. Los 22 proyectos no tienen localidad, país, suministro ni nº de contrato

**Bloquea:** el encabezado de la Nota Semanal firmada (esos 4 campos son literalmente lo
que imprime el PDF) y el KPI-04 (días por cliente y país).

**Estado exacto:** de 22 proyectos, **0** tienen ninguno de los cuatro campos. El Excel no
los trae en ninguna hoja.

**El país parece deducible del nombre**, pero no lo hago yo porque sería inventar:

```
JAV Marata - Brasil                    -> ¿Brasil?
LUCCHETTI CHILE SA                     -> ¿Chile?
MOLINO CIBAO BOCEL - RD                -> ¿República Dominicana?
Pasta Sole  - ARGENTINA                -> ¿Argentina?
GREECE - KILKIS EURIMAC                -> ¿Grecia?
Winland_St louis USA                   -> ¿Estados Unidos?
DOGA/ GOYMEN_Turkey                    -> ¿Turquía?
La Moderna- Messico                    -> ¿México?
MAIZAL FOOD GROUP CORP- Venezuela      -> ¿Venezuela?
MAIZAL GROUP - CUMANA                  -> ¿Venezuela? (Cumaná es venezolana)
Moderna de Alimentos_Ecuador           -> ¿Ecuador?
Sucesores Jacobo Paredes_ Ecuador      -> ¿Ecuador?
Precocidos del oriente_Barranquilla    -> ¿Colombia?
MOLINOS TRES ARROYOS                   -> ¿Argentina?
JMACEDO                                -> ¿Brasil?
```

### Lo que hay que preguntar

> ¿Confirmas el país de cada uno? ¿Y de dónde saco **localidad**, **suministro** y
> **nº de contrato** — de las cotizaciones, o hay que capturarlos a mano?

Para las 6 órdenes cargadas el nº de contrato podría ser el OA (`OA0159103`…), pero el
PDF de referencia usa `345500` en esa casilla, que es **otro número**. Hace falta saber
cuál va.

---

## 🟡 3. Seis pares de proyectos que parecen el mismo cliente duplicado

**Bloquea:** que los KPIs sumen bien. Hoy JMACEDO y su duplicado cuentan por separado.

| Par | Jornadas | ¿Es el mismo? |
|---|---|---|
| `JMACEDO` / `JMACEDO-Brasil- CAPACITACION` | 1050 / 14 | Capacitación puede ser un proyecto aparte legítimo |
| `LUCCHETTI CHILE SA` / `LUCCHETTI CHILE SA_Ch` | 217 / 15 | Huele a duplicado |
| `MOLINO CIBAO BOCEL - RD` / `MOLINO CIBAO BOCEL` | 91 / 10 | Huele a duplicado |
| `MOLINOS TRES ARROYOS` / `MOLINOS 3 ARROYOS ARGENTINA` | 62 / 7 | Huele a duplicado |
| `GREECE - KILKIS EURIMAC` / `Eurimac_ Grecia kilkis` | 27 / 11 | Huele a duplicado |
| `MAIZAL FOOD GROUP CORP- Venezuela` / `MAIZAL GROUP - CUMANA` | 185 / 39 | Cumaná es otra ciudad: ¿dos plantas del mismo cliente? |

### Lo que hay que preguntar

> ¿Cuáles de estos seis pares son el mismo proyecto y hay que fusionar, y cuáles son
> proyectos distintos del mismo cliente?

Ojo con el primero: **capacitación** y **montaje** pueden ser contratos distintos, así que
no asumo que sea duplicado.

---

## 🟡 4. J MACEDO no tiene ni OA ni commessa — y es el proyecto más grande

**Bloquea:** el control comercial del proyecto con **1.050 jornadas**, el mayor de todos.

Su hoja (`J Macedo Brasil- final`) es la única que no lleva OA ni commessa. Su único
importe es **425.600** a nivel de proyecto (celda N8), no de máquina. Además usa un
vocabulario de roles distinto al de las otras hojas: `Manager Cantiere FLA`,
`Meccatronico`, `Capo Elettricista`, `Electtricista`, `Auto Meccanico`, `Softwerista`.

Y la bitácora sí nombra máquinas para JMACEDO: `PL 6000 PC 4500` (290 días), `PC 4500`
(248), `Pasta Lunga PL 6000` (158), `CTA1000` (97), `Pasta Corta 340300 / Pasta Larga
340200 / Nidos 340400` (56).

### Lo que hay que preguntar

> ¿J MACEDO tiene OA y commessa en algún lado, o de verdad se contrató en bloque por
> 425.600 sin desglose por máquina?

Los números `340300 / 340200 / 340400` que aparecen en la bitácora parecen commesse de
fabricación (terminan en `00`, mientras las de asistencia terminan en `98`). **¿Son las
commesse de las máquinas de JMACEDO?** Si lo son, ahí están las órdenes que faltan.

---

## 🟡 5. ¿Qué moneda son los importes?

**Bloquea:** nada ahora mismo, pero el valor de contrato se muestra sin unidad.

El libro **no trae símbolo de moneda en ninguna celda** (lo comprobé en las 14 hojas) y el
catálogo de monedas de la app está vacío. Los importes cargados son 160.000, 165.000,
182.500, 130.000, 425.600.

En la grabación del cotizador Andrea habla siempre en **euros** (*«me costó 100 euros»*,
*«430 al día»*, *«368 euros»*), y menciona que convierte de pesos a euros con la
**TRM del 1 de enero**.

### Lo que hay que preguntar

> ¿Los valores de contrato de las hojas de proyecto están en euros? ¿Y la app debe
> manejar más de una moneda o todo se lleva a euros?

---

## 🟢 6. El Excel tiene 1.220 días con fecha futura

**No bloquea nada** — ya está resuelto en el código, pero conviene que Andrea lo sepa.

El Excel pre-rellena el año entero y marca como `LR`/`NR` los días que aún no han
ocurrido: **911 LR + 309 NR** con fecha hasta el 31 de diciembre de 2026, de 8 técnicos.

Contarlos hundía la utilización global a **36,8 %**; sin ellos da **54,6 %**, que además
cuadra con los ~210 días/año con los que ella costea. El tablero de utilización ya los
excluye y lo dice en pantalla. La cuadrícula (KPI-07) **sí los sigue mostrando**, porque
reproduce su tabla dinámica celda a celda.

### Lo que conviene confirmar

> ¿Los días futuros del Excel son solo relleno de calendario, o algunos son una
> planificación real (técnico ya asignado a un proyecto futuro)?

Si fueran planificación, valdría la pena distinguirlos en vez de ignorarlos.

---

## Estado de los datos, para referencia

```
jornadas migradas ................ 6.573    (2025-01-01 → 2026-12-31)
  · con proyecto .................. 2.779
  · sin proyecto .................. 3.794    todas LR/NR — es correcto
  · con orden atribuida ............. 437    ← nuevo
proyectos ........................... 22
técnicos ............................ 13
órdenes (máquinas contratadas) ....... 6    ← nuevo
días vendidos (la matriz) ............ 0    ← bloqueado por la pregunta 1
notas semanales ...................... 0    (nadie ha usado la app todavía)
```

**Atribución de jornadas a máquina:** hecha donde el proyecto tiene **una sola** orden
(Lucchetti 217, Pasta Sole 129, Cibao-RD 91 = 437). **JAV queda fuera a propósito**: tiene
3 órdenes y repartir esos 536 días es la decisión manual que Andrea describe en la
grabación (*«yo decido agotar mis horas en la 3428 o en la 3429»*).
