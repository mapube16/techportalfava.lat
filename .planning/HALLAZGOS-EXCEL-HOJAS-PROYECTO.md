# Hallazgos: las hojas de proyecto del Excel

**Fecha:** 2026-07-26
**Origen:** revisión de las hojas `JAV Brasil` y `Cibao -Rep D` a petición del usuario.
**Impacto:** el modelo de datos de la Fase 2 **no coincide** con la realidad del Excel.
Afecta a Fase 2 (esquema y pantallas), Fase 6 (migración) y Fase 7 (KPIs).

---

## 1. El contrato pertenece a la LÍNEA DE MÁQUINA, no al proyecto

`JAV Marata - Brasil` no es un proyecto con un contrato: son **tres líneas**, cada una
con su propio OA, commessa y valor.

| Línea | OA | Commessa | Valor |
|---|---|---|---|
| PL 6000 KG - 1-3428 | OA0159105 | 342898 | 182.500 |
| PC 4000 -3430 + 4 SILOS | OA0159108 | 343098 | 130.000 |
| PL 6000 KG - 2-3429 | OA0159107 | 342998 | 182.500 |

`Cibao -Rep D` tiene una sola línea (`PL 4500 GLP 180`, OA0163864, commessa 345598,
160.000) — por eso el patrón pasa desapercibido si solo se mira esa hoja.

**Hoy:** `projects.oa_number`, `projects.commessa`, `projects.contract_value`.
**Decisión (2026-07-26):** mueven a `machines`. El proyecto agrupa líneas de un cliente.

## 2. El vendido lleva un técnico titular; el ejecutado agrega varios técnicos del rol

El delta del Excel **no** es vendido − ejecutado de esa fila. Comprobado en las cuatro
filas de JAV:

```
Meccanico    Camilo Cruz     vendido 182   ejecutado 120   delta 6
Meccanico    Felipe Sena           —       ejecutado  56
                                            182 − (120+56) = 6   ✓

Elettricista Andrea Scapin   vendido 130   ejecutado  55   delta 32
Elettricista Fredy Sarmiento       —       ejecutado  43
                                            130 − (55+43) = 32   ✓
```

Y en la segunda línea (PL 6000 KG - 2-3429): `182 − (87+76) = 19` ✓ y
`130 − (20+48) = 62` ✓.

**Conclusión:** el vendido se asigna a **un técnico titular** de ese rol, pero el
ejecutado suma **todos los técnicos del mismo rol**. El delta es por rol, no por persona.
Nuestra convención `vendido − ejecutado` es correcta; lo que falta es el titular y el
nivel de agregación por línea.

**Decisión (2026-07-26):** `project_sold_days` gana `technician_id` nullable (titular,
informativo). El delta se sigue calculando agregando por rol.

Cuando no hay titular asignado el Excel escribe `xxxxxx` (ver Cibao filas 7 y 9) — al
migrar, eso es NULL, no un técnico llamado «xxxxxx».

## 3. Los roles reales son cinco

En las hojas aparecen: **Supervisore, Meccanico, Elettricista, Test, Software**.
Nuestro catálogo tiene Mecánico, Meccatronico y Eléctrico.

**Decisión (2026-07-26):** añadir `Supervisore`, `Software` y `Test`. El ABM ya existe
desde la Fase 2 — es carga de datos, no código.

## 4. Los dos bloques SÍ son nuestras dos fases

Cada línea tiene dos bloques, y encajan con el modelo actual:

| Bloque del Excel | Nuestra fase |
|---|---|
| `SUPERVISIONE MECCANICA ELETTRICA` | Montaje |
| `SUPERVISIONE SOFTWARE - ELECT - MECCANICO - COLLADO` | Collaudo |

En ambas hojas el bloque de Collaudo tiene **ejecutado 0** en todas las filas: es trabajo
vendido que aún no ha empezado. No es un error de datos.

## 5. Detalles menores pero relevantes para la migración

- Cada hoja lleva una **fecha de corte** (`Corte 31/07/2026`, `Corte 12/07/2026`).
- Hay notas temporales sueltas en celdas contiguas (`Fino a Marzo` junto a Felipe Sena).
- Los totales (`TOTALE`) suman solo las filas con valor: 15+182+130 = 327 vendido,
  0+120+56+55+43 = 274 ejecutado. Sirven como **verificación de la migración**.

---

## Las dos cuadrículas que el usuario pide como tablero (Fase 7)

Ambas, confirmado el 2026-07-26.

### A. Tabla dinámica de días por concepto

Filas jerárquicas proyecto → técnico → mes; columnas los conceptos; celdas el conteo de
días; totales por fila y columna.

```
Etiquetas de fila     DC   DFD  DVSF  DVRC  Total
JAV Marata - Brasil  439    73    16     8    536
  Andrea Scapin       62    10     2     1     75
    04_Abril          19     3     2     -     24
Total general        439    73    16     8    536
```

Es exactamente lo que el CONTEXTO §3 dice que la app debe reemplazar: hoy son tablas
dinámicas mantenidas a mano.

### B. Matriz comercial por línea y rol

Por cada línea de máquina: encabezado con OA, commessa y valor; y por bloque
(Montaje/Collaudo) las filas rol + técnico titular con vendido, ejecutado y delta, más
el total.

Es el tablero que justifica el proyecto ante FAVA, y el que reemplaza al `Resoconto`.

---

## Secuencia propuesta

1. **Fase 2.1** (cierre de hueco): mover el contrato a `machines`, añadir el titular a
   los días vendidos, sembrar los tres roles nuevos, y ajustar las pantallas de
   Proyectos y Detalle. No toca `daily_entries`, así que **no colisiona con la Fase 3**.
2. **Fase 6** (migración): usa el modelo ya corregido; los `TOTALE` de cada hoja son la
   comprobación de conciliación.
3. **Fase 7** (KPIs): añade las dos cuadrículas a los cinco tableros ya planificados.
