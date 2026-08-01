# Hallazgos: el cotizador

**Fecha:** 2026-08-01
**Origen:** `docs/transcripcion-andrea-cotizador-2026-07-28.md` (23 min 1 s).
La segunda grabación de Andrea, que llevaba sin transcribir desde el 28 de julio.

> Regla de este documento: cada afirmación lleva su marca de tiempo. Lo que Andrea no
> dijo, no está aquí.

---

## 0. Lo primero, porque cambia la planificación

**Andrea pone fecha ella misma: septiembre / principios de octubre** (22:22).

> *«no, pero septiembre, septiembre, principios de octubre, lo podemos trabajar,
> por ahora lo estamos trabajando así»*

El cotizador llevaba desde el 28 de julio marcado como «alcance nuevo sin decidir» y
bloqueando la planificación. No hay tal bloqueo: **está diferido por la propia clienta**,
y hasta entonces siguen con el Excel. No entra en v1.

---

## 1. Qué es el cotizador y por qué lo pide

No es un generador de documentos bonitos. Es un **control de margen**, y el problema que
resuelve es que hoy se cotiza por debajo del costo sin que nadie se dé cuenta (19:03).

El caso que Andrea cuenta con números (20:04 → 22:22):

```
Test cotizado a            440 €/día
descuento general del 30%  -132 €
precio real al cliente     308 €/día
costo real de Iván         368 €/día
                           ─────────
pérdida                     -60 €/día
```

> *«tenemos el proyecto, pero es un proyecto que […] yo estoy perdiendo sesenta y seis
> euros, por eso necesito el cotizador»*

La causa la nombra sin rodeos (11:24): *«las personas que cotizan se emocionan y dicen
no, te doy el 20»*.

---

## 2. Identidad de la cotización

| Requisito | Marca | Detalle |
|---|---|---|
| Número de cotización | 00:57 | `FP 09 2026` — la máquina nº 9 del año, una PL |
| **Reinicio anual** | 01:05 | *«cada año las cotizaciones vuelven al número inicial»* |
| **Revisiones** | 01:14 | Rev. 1, 2, 3, 4… Cada reajuste de precio incrementa la revisión |
| Contador de revisiones visible | 01:35 | *«es importante mencionar cuántas veces la corregí»* — lo pide la dirección |

Ojo: la revisión no es cosmética. Andrea dice que **el descuento se aplica normalmente en
la revisión 2** (12:06), así que la revisión es donde vive el histórico de negociación.

---

## 3. Idioma — por origen del cliente, no por usuario

01:48 → 02:31. Cuatro idiomas: **italiano, portugués (brasileiro), español, inglés**.

Lo que se elige NO es el idioma del que cotiza, es el **idioma de origen del cliente**:

> *«yo pueda ponerle el idioma de origen de mi cliente. Entonces, si yo voy a cotizar
> algo en Brasil, que sea portugués […] y si voy a cotizar algo de Italia, que sea
> italiano»*

Consecuencia: es un atributo del CLIENTE (o de la cotización), no una preferencia de la
sesión. La app hoy tiene ES/IT como preferencia de usuario — **no es lo mismo y no se
puede reutilizar tal cual**.

---

## 4. Dos clientes distintos en la misma cotización

03:14 → 03:34. Esto no está en ningún modelo actual:

> *«esta es una cotización que se le va a facturar a Faba, pero internamente a quien
> vamos a tener es un cliente de República Dominicana que se llama Molinos del Cibao»*

- **A quién se factura**: FAVA S.P.A. (la casa madre italiana)
- **Cliente final**: Molinos del Cibao, RD
- **Persona de contacto**: hay varias en FAVA; se registra cuál fue (03:02, «Melandri»)

Y el cliente trae su commessa asociada (03:34), coherente con lo que ya se construyó.

---

## 5. El formulario: casi todo son clics

03:34 → 04:22, en orden:

1. Buscar **cliente** → trae commessa
2. **Actividad** a realizar (lista, seleccionable — hay varias)
3. **Periodo** con calendario, de fecha a fecha
4. **Técnico**, o «por definir» si aún no se sabe
5. **Forma de pago**: contado, 50 %… (*«nos sentamos y los miramos»* — sin cerrar)
6. **Jornada laborativa**: lunes-viernes / lunes-sábado media jornada / lunes-domingo

---

## 6. El cálculo de días — el núcleo, y donde hoy se equivocan

04:52 → 07:34. Dos magnitudes distintas, y **se factura por la segunda**:

| Magnitud | Definición literal | Uso |
|---|---|---|
| **Giornate effettive** | días del periodo **sin domingos** | lo que el técnico trabaja |
| **Giornate di viaggio** | todos los días, **incluido el viaje** | **lo que se cobra** |

> *«del día 1 al día 30 son 30 días, pero si le restamos 4 domingos serían 26 días»*
> *«cobramos en el día para este mecánico 430, pero lo multiplicamos es por esto y no
> por lo que él realmente trabajó»*

**Regla explícita y simple** (06:48): *«no toma festivos, sino simplemente el calendario
mundial y resta los domingos y punto»*. Sin calendario de festivos por país. Solo domingos.

**El error que hay que matar** (05:16): hoy el periodo dice «26 de abril» y el cálculo
arranca en mayo. *«ahí empiezan los errores»*.

**Cada rol tiene su propio periodo** (07:13): el eléctrico entra un mes después que el
mecánico. No es un periodo único para toda la cotización.

---

## 7. Fases y partidas

07:46 → 08:20. Confirma lo que ya sabíamos y añade roles:

- **Fase 1** (montaje): supervisor, mecánico, eléctrico
- **Fase 2** (collaudo/pruebas): test, software, mecánico, eléctrico, **ayudantes**

`Ayudantes` no aparecía en las hojas de proyecto del Excel. Coincide con el `Aiuto` que
sí está en `role_types` (365 jornadas).

---

## 8. Gastos de viaje — y su enganche con lo ya construido

08:22 → 10:13. Dos modalidades:

- **Al costo**: cuando se le cobra a FAVA. Tiquete aéreo ida y vuelta, transportes
  (*«un tren desde Roma hasta Milán»*), varios.
- **Presupuestado**: cuando el cliente no es de fiar. El ejemplo es África (10:13):
  *«el cliente a veces suele ser muy deshonesto, entonces dice que hace la lavandería y
  no la hace»* → 200 €/semana de lavandería, renta de carro, almuerzo, cena, hotel.

Dos cosas que tocan lo que YA existe:

1. **Los gastos pagados con tarjeta corporativa se registran en la bitácora** (09:14) y
   Andrea los quiere **ver por técnico** (09:35) para mostrárselos al cliente. Es la
   contrapartida de `NOTA-08` (gastos de la Nota Semanal), que ya está construido — pero
   NOTA-08 los guarda por nota, no agregados por técnico.
2. **El tiquete aéreo lo carga el SUPERUSUARIO, no el técnico** (09:51):
   *«tiene que haber una manera de que el superusuario […] pueda incluir el ticket aéreo
   de este personaje acá, en la bitácora»*. Hoy la bitácora es del técnico y solo suya.

---

## 9. Descuentos y la tabla de costos

10:40 → 22:22. La mitad de la grabación es esto, y es la razón de ser del cotizador.

### 9.1 Lo que debe mostrar la pantalla

Al elegir un descuento (p. ej. 5 %), ver **lado a lado** (10:55 → 12:17):

- precio total sin descuento
- precio total **con** el descuento
- y el **precio por día resultante**, que es donde se ve si se cae por debajo del costo

### 9.2 Cómo se calcula el costo de un técnico

12:32 → 22:04. La cadena completa:

```
salario base + bonificaciones + auxilios          (el «básico», bajo a propósito)
        + 55 % de costo de vinculación             (seguridad social, prestaciones, riesgos)
        = costo mensual
        ÷ días  → costo diario en pesos
        × TRM   → costo diario en EUROS  (TRM del 1 de enero, fija)
```

Detalles que importan:

- **Los freelance no llevan costo de vinculación** (15:48): salen como «no aplica».
- **El básico se paga aunque el técnico esté en casa** (16:23). El régimen es
  *«trabajas dos meses y descansas uno»*, y sobre el básico se cobra igual — por eso el
  básico es bajo y el costo real por día trabajado es alto.
- **El costo diario depende de cuántos días trabaje al año** (21:00):
  - **210 días** = el promedio con el que Andrea costea
  - **150 días** = el mínimo garantizado; por debajo, *«ya no trabaja y lo despedimos»*
  - Iván: 245 €/día si trabaja 210 → pero **368 €/día** contando los de descanso

### 9.3 Y aquí engancha con KPI-07

21:06 → 21:00, hablando de la cuadrícula de días que **ya está construida**:

> *«según la tabla que tú nos estás ayudando a hacer, y según esta data general que por
> eso es tan importante, que en el año Iván, de lo que va corrido hasta mayo, ha
> trabajado ciento dieciséis días»*

El conteo de días por técnico **es la entrada del modelo de costos**. KPI-07 no es solo
un tablero: alimenta el cotizador.

---

## 10. Permisos y salida

| Requisito | Marca |
|---|---|
| **Solo super usuarios.** *«los técnicos no lo pueden ver»* | 12:45 |
| Quién cotiza: Luca, Fabio, y Andrea muy de vez en cuando (2 al año) | 12:54 |
| **PDF no modificable**, enviable por correo desde la app | 13:09 |
| *«Ojalá no excels ni nada de eso, sino algo no modificable para el cliente»* | 13:36 |

---

## 11. Alcance nuevo mencionado de pasada

14:14 → 14:37. **Pedido de repuestos**: *«los clientes no están sabiendo cómo pedir»*.
Está bloqueado por política interna, no por técnica: *«ese proyecto lo tiene una persona
y […] muy duro para soltármelo»*. No es alcance hoy.

---

## 12. Qué cambia esto en lo ya construido

| Cosa | Impacto |
|---|---|
| Cotizador | **Fuera de v1.** Diferido por Andrea a septiembre/octubre |
| Idioma | Es atributo del CLIENTE, no preferencia de sesión. El ES/IT actual no sirve tal cual |
| Cliente facturado ≠ cliente final | `projects.client_name` es UNO solo. El cotizador necesita dos |
| Gastos por técnico | `NOTA-08` los guarda por nota; Andrea los quiere agregados por técnico |
| Tiquete aéreo por superusuario | La bitácora hoy es solo del técnico |
| KPI-07 | Confirmado como entrada del costeo, no solo como tablero |
| Tabla de costos por técnico | Entidad nueva. No existe nada parecido en el modelo |
| Régimen 2 meses fuera / 1 en casa | Explica `MD` (sábado) y `DVRC` (rotación). Ya estaba inferido; ahora confirmado |
