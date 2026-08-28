# Conciliación del vendido (MIG-02)

Líneas en el NDJSON: **56**

## Qué entra y qué no

| | Líneas | Por qué |
|---|---:|---|
| Entran | 36 | tienen commessa y cifra de vendido |
| Sin cifra de vendido | 13 | son la segunda plaza de un rol ya vendido: ejecutan, no venden |
| Sin commessa | 7 | la hoja `J Macedo Brasil- final` no declara ninguna, y `order_sold_days` cuelga de una ORDEN |

> **JMACEDO se queda fuera y es una decisión pendiente.** El proyecto existe en la base con 1.050 jornadas, pero no tiene ninguna orden porque su hoja no trae `COMMESSA`. Sus 7 líneas de vendido (1073 días) no se pueden colgar de nada hasta que alguien cree la orden. No se inventa aquí.

## Roles del bloque de vendido

Se crean **5** que no estaban en el catálogo, con el nombre literal:

- `Supervisore`
- `Meccanico`
- `Elettricista`
- `Test -`
- `Sofware`

### Parecidos que NO se fusionan

Se dejan separados a propósito: que `Elettricista` y `Electtricista` sean el mismo cargo es una decisión de negocio, no de código. Se resuelve desde Configuración.

- `Meccanico` ↔ `Mecanico`, `Meccatronico`
- `Elettricista` ↔ `Electtricista`, `Elettrico`
- `Sofware` ↔ `Software`

## Vendido contra ejecutado, por orden

| Orden | Vendido | Ejecutado | Delta |
|---|---:|---:|---:|
| `342898` | 443 | 0 | 443 |
| `342998` | 438 | 0 | 438 |
| `343098` | 312 | 0 | 312 |
| `343298` | 370 | 0 | 370 |
| `343498` | 382 | 0 | 382 |
| `345598` | 382 | 0 | 382 |

> El **ejecutado** de esta tabla sale de `daily_entries.order_id`, y hoy casi ninguna jornada lo tiene: el Excel no registra la máquina en la hoja diaria. Hasta que se capture, el ejecutado por orden va a salir muy por debajo del real. El ejecutado por PROYECTO sí es correcto y es el que muestra la cuadrícula.

