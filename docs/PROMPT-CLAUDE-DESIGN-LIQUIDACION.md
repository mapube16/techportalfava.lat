# Prompt para Claude Design — «Liquidación del mes» (vista de Administración)

> Pégalo en el proyecto **Tecnico FAVA - Direcciones** (el que tiene los turnos 1, 2 y 3),
> como un turno nuevo. Usa el mismo marco del artboard 2a (barra lateral navy, cabecera)
> y la misma paleta FAVA que ya está declarada en ese archivo.

---

Diseña una pantalla nueva de **Control Técnico FAVA** para el rol **Administrador**, en el mismo sistema visual de los artboards que ya existen en este proyecto (marco de `2a`: barra lateral navy `#132330`, cabecera blanca, tarjetas blancas con borde `#dde3e9` sobre fondo `#eef2f5`, Roboto / Roboto Condensed / Roboto Mono, azul `#104a78`, naranja `#e86c00`). Llámala **«Liquidación del mes»** y cuélgala del grupo *Administración* del menú, entre «Técnicos» y «KPIs».

## Para qué sirve

Andrea (Admin) cierra cada mes el **día 25** y tiene que saber, por cada técnico, **cuántos días de cada concepto** trabajó en el periodo, para pasarlos a nómina. Hoy lo hace sumando a mano una tabla dinámica del Excel. La app ya tiene los datos; falta la vista que los ordena **por persona**, no por proyecto.

La pantalla **no calcula dinero**: entrega cantidades. Andrea multiplica.

## Los datos (una fila por técnico)

Columnas fijas, en este orden, con su color de concepto (ya definido en el proyecto):

| Código | Significado | Color |
|---|---|---|
| DC | Día completo | `#1f9d5b` |
| MD | Medio día | `#2182f6` |
| DFD | Festivo / dominical | `#8b5cf6` |
| DVSF | Viaje salida | `#0ea5a5` |
| DVRC | Viaje retorno | `#0ea5a5` |
| LR | Libre remunerado — **solo internos** | `#e86c00` |
| NR | No remunerado — **solo externos** | `#78889a` |
| IL | Incapacidad | `#d64545` |
| OTRO | Otro (con explicación) | `#a16207` |

Más: **Total** de días, **tipo** del técnico (Interno / Externo), y una columna de **estado** que es lo más importante de la pantalla (ver abajo).

Datos de ejemplo realistas (agosto 2026):

```
Técnico          Tipo     DC  MD  DFD  DVSF  DVRC  LR  NR  IL  OTRO  Total  Estado
Leomar Klein     Interno  18   1    2     1     1   0   —   0     0     23   ✓ listo
Ivan Cortés      Interno  15   0    0     1     1   3   —   0     0     20   ⚠ 2 días sin aprobar
Camilo Cruz      Interno  19   0    1     0     0   0   —   2     0     22   ✓ listo
Felipe Sena      Externo  12   2    0     1     1   —   4   0     1     21   ⚠ 1 semana sin enviar
Andrea Scapin    Interno  20   0    0     0     0   0   —   0     0     20   ✓ listo
Luca Carraro     Interno  14   0    0     2     2   0   —   0     0     18   ⚠ 3 días sin aprobar
```

Regla visual: la celda **LR en un externo** y **NR en un interno** no aplican — píntalas como «—» atenuado, nunca como 0.

## La columna de estado es la razón de ser

El problema del día 25 no es sumar: es saber **a quién le falta algo** para poder cerrar. Solo cuentan los días **aprobados**. Cada técnico lleva uno de estos estados:

- **Listo** (verde): todo aprobado, nada pendiente.
- **N días sin aprobar** (ámbar): hay jornadas enviadas que Andrea aún no validó. La fila sigue mostrando el conteo de lo aprobado y, en la celda, un pequeño «+N» atenuado con lo que entraría al aprobar. Clic → lleva a la bandeja de aprobación filtrada por ese técnico.
- **N semanas sin enviar** (naranja): el técnico no ha enviado. Clic → abre el detalle del técnico.
- **Sin días** (gris): no registró nada en el periodo (vacaciones largas, técnico inactivo).

Arriba, un resumen: «12 técnicos · 9 listos · 3 con pendientes · 431 días aprobados».

## El periodo

Selector de mes en la cabecera. El periodo es el del **corte**: **del 26 del mes anterior al 25 del mes**. Muéstralo explícito bajo el selector («26 jul – 25 ago 2026»), porque es lo que más confunde. Deja también la opción de ver el mes calendario, como alternativa secundaria.

## Acciones

- **Exportar a Excel (.xlsx)** (botón secundario, arriba a la derecha): la misma tabla, con el periodo en el nombre del archivo, para mandar a la casa matriz. Excel y no CSV: es lo que Andrea y la matriz italiana abren y reenvían tal cual.
- Clic en el nombre del técnico → su detalle (ya existe).
- Ordenar por columna (total, estado).

## Estados de la pantalla

1. Mes con todo listo (feliz).
2. Mes con pendientes: dos técnicos en ámbar y uno en naranja, para ver cómo se leen los tres avisos juntos.
3. Mes vacío (nadie ha registrado nada todavía; p. ej. el mes que acaba de empezar).
4. Cargando.

## Formato

- **Escritorio primero** (marco de 1000 px como en `2a`): Admin trabaja en el PC. Tabla densa, cabecera pegajosa, filas de 40 px, números en Roboto Mono alineados a la derecha.
- **Móvil como secundario** (teléfono como en los artboards 3x): una tarjeta por técnico con su total, su tipo y su estado; los conceptos plegados dentro. Andrea mira esto desde el teléfono cuando no está en la oficina, no lo edita.
- Modo claro y oscuro, como el resto.

## Lo que NO debe aparecer

Importes, tarifas, salarios, valor de contrato, vendido/ejecutado. Esta pantalla es de **cantidades por concepto**, punto. Tampoco nada que compare técnicos entre sí más allá de listarlos.
