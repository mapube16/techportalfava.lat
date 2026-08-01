# Conciliación de la migración del Excel

Filas en el NDJSON: **6580**

## Catálogos

| | Excel | Tras normalizar |
|---|---|---|
| Roles técnicos | 17 | 16 |
| Proyectos | 22 | 22 |
| Técnicos | 14 | 13 |

## Jornadas

| | |
|---|---|
| Insertadas | **6573** |
| Apartadas por la CHECK (concepto de trabajo sin proyecto) | 7 |

### Filas apartadas — hay que decidir qué hacer con ellas

| Hoja | Fila | Técnico | Fecha | Concepto |
|---|---|---|---|---|
| 2025 | 76 | Camilo Cruz | 2025-03-16 | DFD |
| 2025 | 313 | Camilo Cruz | 2025-11-08 | DVSF |
| 2025 | 546 | Giuliano Lodi | 2025-06-29 | DVSF |
| 2025 | 614 | Giuliano Lodi | 2025-09-05 | DVSF |
| 2025 | 1908 | Felipe Sena | 2025-03-23 | DFD |
| 2025 | 2755 | Leomir Kleir | 2025-12-21 | DFD |
| 2025 | 2762 | Leomir Kleir | 2025-12-28 | DFD |

### Excel vs. base, por proyecto y concepto

Celdas comparadas: **75** · descuadres: **0**


JAV Marata - Brasil: **536** jornadas en la base (el Excel dice 536).

## Pendiente de una persona

- **22 proyectos** entraron sin cliente, localidad, país, suministro ni n.º de contrato: el Excel no los tiene. Hay que completarlos antes de la Fase 5, o la Nota saldrá con casillas en blanco.
- **6573 jornadas** entraron sin orden (máquina contratada), porque el Excel no la registra. Aparecen en «Jornadas sin máquina asignada» del detalle de cada proyecto.

### Nombres que PARECEN duplicados y NO se fusionaron

Se dejan separados a propósito: fusionar «MOLINO CIBAO BOCEL» con «MOLINO CIBAO BOCEL - RD» es una decisión de negocio, no de código. Se resuelve desde la pantalla de Proyectos.

- `JMACEDO` ↔ `JMACEDO-Brasil- CAPACITACION`
- `JMACEDO-Brasil- CAPACITACION` ↔ `JMACEDO`
- `LUCCHETTI CHILE SA` ↔ `LUCCHETTI CHILE SA_Ch`
- `LUCCHETTI CHILE SA_Ch` ↔ `LUCCHETTI CHILE SA`
- `MOLINO CIBAO BOCEL` ↔ `MOLINO CIBAO BOCEL - RD`
- `MOLINO CIBAO BOCEL - RD` ↔ `MOLINO CIBAO BOCEL`
