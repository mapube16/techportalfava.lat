# Salida a producción — Control Técnico FAVA

**Actualizado:** 2026-08-28
**Anterior:** 2026-08-01

Lo que falta para que esto sea un sistema en producción y no un entorno de pruebas.
Cada punto dice **cómo se comprobó** — nada aquí es de memoria.

**Lo que cambió desde la revisión anterior:** el cutover a Entra ya está hecho, así que
el bloqueante nº 1 —el más grave— desapareció. A cambio aparecieron tres problemas que
nadie había mirado, y uno de ellos (el dominio) rompe el login de quien no lo sepa.

---

## ✅ RESUELTO DESDE LA ÚLTIMA REVISIÓN

### El acceso de desarrollo está cerrado

**Verificado en Railway y en la base:** `DEV_AUTH_ENABLED = false`,
`ENTRA_TENANT_ID = de20418d-…` (el tenant real de FAVA, dominio
`favalatinoamerica.com`), `ENTRA_API_CLIENT_ID` con un GUID real.

Y la trampa que documentaba el punto anterior **no llegó a morder**:

```sql
SELECT count(*) FROM users WHERE entra_oid LIKE 'dev:%';   -- 0
```

Cero cuentas con OID de desarrollo. La app corre con Microsoft de verdad.

> Solo **2 de 18 usuarios** tienen `entra_oid`, o sea que solo dos personas han entrado
> alguna vez con su cuenta real. No es un problema técnico, pero conviene saberlo antes
> de decir que el sistema «está en uso».

### Existe el reporte de conciliación (MIG-03)

`.planning/CONCILIACION-MIGRACION.md` se regenera en cada `migrate:excel` y dice fila
por fila qué entró, qué catálogos se normalizaron y qué nombres parecen duplicados y no
se fusionaron. Ya se le puede enseñar a Andrea.

### Los avisos por correo funcionan (Fase 9)

Desplegados y **verificados en producción**: el cron corre cada 5 minutos, y el viernes
a las 16:00 de Bogotá encoló 5 recordatorios reales a Fredy, Ivan, Leomar, Leomir y
Luca, en español y con enlace. Van en `NOTIF_TRANSPORT=console`, así que se encolan y
**no sale ningún correo**. Encenderlos es cambiar esa variable.

Entra ya tiene el registro `FAVA Control Tecnico - Avisos` con `Mail.Send` concedido y
la política de Exchange acotada al buzón `techportal@`, comprobada en las dos
direcciones.

### Agosto está cargado

El informe actualizado de Andrea entró: 6.573 → **6.692 jornadas**, agosto pasa de 19
días con proyecto a **185**, y salieron 55 notas nuevas. La utilización real subió de
49,7 % a **53,8 %**.

---

## 🔴 BLOQUEANTES — sin esto no se puede salir

### 1. El dominio no apunta a la app

**Verificado:** Railway sirve el dominio **`www.techportalfava.lat`**. El dominio pelado
`techportalfava.lat` resuelve a `162.255.119.114`, que es la página de aparcamiento de
Namecheap, y no responde.

Esto no es cosmético:

- `GUIA-ANDREA-MICROSOFT.md` le pide a Andrea registrar
  `https://techportalfava.lat/redirect.html` como redirect URI de Entra. **Ese dominio no
  existe**, así que un login que vuelva por ahí no vuelve.
- Cualquiera a quien se le pase la URL sin `www.` verá una página de dominio en venta.

**Arreglo:** añadir el dominio pelado en Railway → Settings → Networking, o decidir que
la URL oficial es la del `www.` y corregir la guía de Entra y `APP_BASE_URL`.

### 2. La pantalla de KPIs sigue mostrando datos inventados

**Verificado:** `frontend/src/screens/Kpis.tsx:51-54` conserva el mock del prototipo, con
proyectos que **no existen en la base** — «Barilla USA — Ames», «Pastificio Bariloche —
AR», «Molino Cibao Bocel — RD» con cifras inventadas.

Lo que **sí** es real en esa pantalla: la cuadrícula de días (KPI-07) y la utilización
por técnico (KPI-02), que además ahora cuenta bien (ver más abajo).

**Un usuario no distingue una gráfica real de una falsa.** Las opciones siguen siendo
dos: conectarlas (bloqueado por el punto 3) o **retirarlas hasta que lo estén**. Cuatro
semanas después siguen ahí.

### 3. La matriz de días vendidos sigue vacía

**Verificado:**

```sql
SELECT count(*) FROM order_sold_days;   -- 12, y las 12 son del proyecto ZZ DEMO
```

De las 6 órdenes **reales**, ninguna tiene un solo día vendido. Sin vendido no hay delta,
y el delta es el número con el que Andrea se sienta a hablar con Luca.

**Novedad: el dato existe y ya sabemos dónde está.** Las cinco hojas de proyecto del
Excel (`JAV Brasil`, `Lucchetti Chile`, `Cibao -Rep D`, `Pasta Sole`, `J Macedo`) traen
la matriz `VENDIDO | EJECUTADO | Delta` por rol: **unas 54 líneas y ~4.200 días**. Las
seis commesse coinciden exactamente con las seis órdenes de la base.

Lo que bloquea cargarlo son **dos decisiones de negocio**, no código:

- **La fase no encaja.** En la base `order_sold_days.phase` es `MONTAJE | COLLAUDO`. En
  el Excel los bloques son **SUPERVISIONE MECCANICA** y **SUPERVISIONE SOFTWARE**, que
  es disciplina, no fase. Hay que acordar el mapeo con Andrea.
- **Una línea vendida se reparte entre varios técnicos.** En JAV:
  `Meccanico · Camilo Cruz · 182 vendido · 120 ejecutado · Delta 6`, donde el delta no es
  182−120 sino 182−120−56 (Felipe Sena, misma línea, sin vendido). El esquema ya lo
  anticipa con `ordinal` y `line_label`, pero el cargador tiene que respetarlo.

### 4. La Nota Semanal saldría con el encabezado vacío

**Verificado:** de los 23 proyectos, **1** tiene localidad, país, suministro y número de
contrato — y es el de demostración que creamos nosotros. Los 22 reales están vacíos.

Son exactamente los cuatro campos que imprime la cabecera del PDF que firma el cliente.
Sigue siendo la **pregunta 2** de `PREGUNTAS-PARA-ANDREA.md`, sin responder.

> No los rellenamos con datos inventados a propósito: harían que la pantalla pareciera
> terminada cuando el dato sigue faltando, y en un mes nadie sabría cuáles son de verdad.

---

## 🟡 IMPORTANTES — se puede salir sin ellos, pero hay que decidirlo a sabiendas

### 5. Casi ninguna jornada dice en qué máquina se trabajó

**Verificado:** de 3.161 jornadas con proyecto, **3.134 no tienen orden asignada**. El
99 %.

El punto anterior decía que la máquina «es opcional». En la práctica no es opcional: es
que **nunca se rellena**, porque el histórico del Excel no la trae y nada en la app la
exige. Y es justo el control por commessa que Andrea repitió que era imprescindible.

Los días no se pierden — van al bucket «Jornadas sin máquina asignada». Pero el
indicador que ella quiere no se puede construir sobre 27 jornadas de 3.161.

**Decisión:** ¿se vuelve obligatoria cuando el proyecto tiene órdenes? Son unas líneas
en `daily-entries.service.ts` más el aviso en pantalla.

### 6. `migrate-excel.ts` no está en transacción

**Verificado hoy, a las malas.** El script hace `deleteMany` del histórico y reinserta
por lotes de 500. Un fallo a mitad deja la base **con parte del histórico borrado**:
ocurrió, y quedó en 3.019 jornadas de 6.592 hasta que se restauró desde el NDJSON.

Se recupera siempre (el NDJSON está versionado), pero quien lo corra sin saberlo va a
pasar un mal rato. Envolverlo en `$transaction` es un cambio pequeño y lo convierte en
todo-o-nada.

### 7. Nadie ve los cambios de otro hasta recargar

Sin cambios: no hay SSE ni polling. Para 13 técnicos y 2 administradores es tolerable.
Conviene decirlo antes, no después.

### 8. Una sola instancia, y no puede escalar tal cual

Sin cambios, pero **ahora vive en `.railway/railway.ts`** con el porqué escrito al lado:
el límite del throttler es en memoria, así que N réplicas multiplican el límite por N.

### 9. Infraestructura que sobra y factura

**Verificado al volcar la configuración:**

- **Tres volúmenes de Postgres de 5 GB.** Solo uno puede estar montado; los otros dos son
  restos y siguen facturando.
- **Un servicio vacío, `virtuous-encouragement`**, que quedó de un `railway init` a
  medias.

Declarados en el IaC para que un `plan` no los destruya por accidente. Borrarlos es una
decisión deliberada y se hace desde el dashboard.

### 10. Las cuentas de prueba ya no sirven

**Verificado:** `admin@fava-la.com` y `super@fava-la.com` están **inactivas**, y
`tecnico@fava-la.com` **ya no existe**. Con el login de desarrollo apagado tampoco
entrarían.

Probar el reparto por rol ahora exige cuentas reales del tenant. No es un bloqueante,
pero el apartado de «tres cuentas de prueba» del documento anterior ya no aplica.

---

## Los tableros

| | Estado | Bloqueado por |
|---|---|---|
| KPI-07 (cuadrícula de días) | **real y funcionando** | — |
| KPI-02 (utilización) | **real y funcionando** | — |
| KPI-01, KPI-08 (vendido vs. ejecutado) | **mock** | punto 3 (la fase) |
| KPI-04 (días por cliente y país) | sin empezar | punto 4 (falta el país) |
| KPI-05 (matriz técnico × semana) | sin empezar | **nada — se puede hacer ya** |
| KPI-06 (gráficas a Nivo) | sin empezar | que KPI-01/08 existan |

### Lo que se corrigió en la utilización

Los cuatro filtros del servicio contaban solo `status = 'approved'`. Con el histórico
migrado daba igual —entró todo aprobado— pero en cuanto los técnicos usan la app su
semana se queda en `submitted` hasta que un admin la aprueba: el tablero iría siempre por
detrás y, durante la adopción, parecería vacío. **Ahora cuenta `submitted` y `approved`**,
y devuelve `pendingApproval` para que se vea qué parte del número aún no ha validado
nadie. `draft` y `returned` siguen fuera.

### Un indicador que falta y que el negocio pide

**«Días pagados sin proyecto».** Hoy no está en ninguna pantalla.

«Sin proyecto» son el 50 % del tiempo registrado, pero se parte en dos mitades
económicamente opuestas: **NR** (externos, no remunerado, no cuesta) y **LR** (pagado).
La utilización mete las dos en el denominador, así que trata igual un día que cuesta
dinero y uno que no.

- «De la capacidad disponible, ¿cuánta se usó?» → **53,8 %** (el actual)
- «Del dinero que pagamos en días de técnico, ¿cuánto fue a obra?» → **~65 %**

El número que falta es directo: **1.467 días pagados sin proyecto asignado**. Es una
línea más en el endpoint de utilización y una en la tarjeta.

---

## 🟢 COMPROBADO Y EN ORDEN

| Qué | Cómo se comprobó |
|---|---|
| **Cutover a Entra hecho** | `DEV_AUTH_ENABLED=false`, tenant real, 0 OIDs `dev:` |
| **Correo saliente acotado** | `Test-ApplicationAccessPolicy`: `Concedido` para techportal@, `Denegado` para otro buzón |
| **RLS activo** | 13 tablas con `rowsecurity`; el cron fija sus GUCs y hay un e2e que lo demuestra |
| **El runtime NO es superusuario** | `fava_app`: `rolsuper = f`, `rolbypassrls = f` |
| **PDF y firmas inmutables** | `note_pdfs` y `note_signatures` solo `INSERT, SELECT` |
| **Auditoría append-only** | por privilegio Y por ausencia de política |
| **`notifications` no se borra** | `REVOKE DELETE`, y sin política de DELETE |
| **Migraciones al día** | incluida la de notificaciones, aplicada por `preDeployCommand` |
| **Infraestructura en el repo** | `.railway/railway.ts`; `railway.toml` retirado antes del corte del 2026-12-01 |
| **Tests** | 123 backend + 49 frontend, y los tres guarda-raíles del build en verde |

---

## Orden sugerido

1. **Arreglar el dominio** — es media hora y hoy rompe el login de quien use la URL sin `www.`
2. **Resolver las dos decisiones del punto 3** con Andrea: el mapeo de fase y cómo se
   reparte una línea vendida entre técnicos. Es lo único que separa los KPIs reales del mock
3. **Cargar los días vendidos** desde las hojas de proyecto y conectar KPI-01/KPI-08
4. **Pedirle a Andrea los cuatro campos de los 22 proyectos** (punto 4) — desbloquea el PDF y KPI-04
5. **Retirar el mock de `Kpis.tsx`** si 2 y 3 se alargan: mejor un hueco honesto que una cifra falsa
6. Envolver `migrate-excel.ts` en una transacción
7. Decidir si la máquina se vuelve obligatoria (punto 5)
8. Añadir «días pagados sin proyecto»
9. Encender `NOTIF_TRANSPORT=graph` cuando el contenido de `notifications` convenza
10. Limpiar los dos volúmenes y el servicio vacío

Los puntos 1, 6, 8 y 10 no dependen de nadie de FAVA y se pueden hacer ya.
