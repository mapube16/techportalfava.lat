# Salida a producción — Control Técnico FAVA

**Actualizado:** 2026-08-01

Lo que falta para que esto sea un sistema en producción y no un entorno de pruebas.
Cada punto dice **cómo se comprobó** — nada aquí es de memoria.

Hoy la app está desplegada y funcionando en `techportalfava.lat`, pero con el **acceso de
desarrollo abierto**. Eso es lo primero de la lista y es innegociable.

---

## 🔴 BLOQUEANTES — sin esto no se puede salir

### 1. El acceso todavía es el de desarrollo

**Verificado:** `DEV_AUTH_ENABLED = true` en las variables de Railway.

Mientras esté encendido, **quien conozca la contraseña compartida entra como CUALQUIER
email dado de alta**, incluido el Super Admin. No hay segundo factor, no hay Microsoft, y
el banner naranja de «MODO DESARROLLO» está a la vista en toda la app.

Para cerrarlo hacen falta cuatro cosas, y las tres primeras son de FAVA, no técnicas:

| Qué | Estado hoy | Quién |
|---|---|---|
| `ENTRA_TENANT_ID` | `placeholder-sin-tenant` | IT de FAVA |
| `ENTRA_API_CLIENT_ID` | `placeholder-sin-tenant` | IT de FAVA |
| `VITE_ENTRA_CLIENT_ID` | **no definida** | IT de FAVA |
| `DEV_AUTH_ENABLED` y `VITE_DEV_AUTH` | `true` → poner en `false` | nosotros |

**Trampa documentada:** las cuentas que se hayan usado con el login de desarrollo quedan
con `entra_oid` empezando por `dev:`. Antes del primer login real hay que limpiarlo:

```sql
UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%';
```

Sin eso el primer login real **falla en silencio**: el guard busca por `oid`, no lo
encuentra, y trata al usuario como no invitado.

---

### 2. La pantalla de KPIs muestra datos inventados

**Verificado:** `Kpis.tsx` conserva el mock del prototipo (5 técnicos y 3 proyectos
falsos) alimentando cuatro gráficas de barras y una de torta.

Lo que **sí** es real en esa pantalla: la cuadrícula de días (KPI-07) y la utilización
por técnico (KPI-02). Lo demás son cifras inventadas con aspecto de reporte.

**Un usuario no distingue una gráfica real de una falsa.** Si esto sale así, Andrea o
Luca pueden tomar una decisión sobre números que no existen. Las opciones son dos:
conectarlas (bloqueado, ver punto 3) o **retirarlas hasta que lo estén**.

---

### 3. Falta la mitad comercial: la matriz de días vendidos está vacía

**Verificado en producción:** `order_sold_days` tiene **0 filas**.

El código funciona, las 6 órdenes ya están cargadas, pero el vendido no se puede cargar
sin resolver la **pregunta 1** de `PREGUNTAS-PARA-ANDREA.md` (a qué rol mapea
«Elettricista»). Sin vendido no hay delta, y el delta es justo el número con el que
Andrea se sienta a hablar con Luca.

Es lo que bloquea KPI-01 y KPI-08, o sea, el punto 2 de esta lista.

---

### 4. La Nota Semanal saldría con el encabezado vacío

**Verificado en producción:** de los 22 proyectos, **0** tienen localidad, país,
suministro ni número de contrato. Son exactamente los cuatro campos que imprime la
cabecera del PDF firmado.

Es la **pregunta 2** de `PREGUNTAS-PARA-ANDREA.md`. Un PDF que el cliente firma con la
mitad del encabezado en blanco no es presentable.

---

## 🟡 IMPORTANTES — se puede salir sin ellos, pero hay que decidirlo a sabiendas

### 5. La máquina es opcional al registrar un día

**Verificado:** `daily-entries.service.ts` valida la orden **si viene**, pero no la exige
aunque el proyecto tenga órdenes cargadas.

Un técnico puede registrar y enviar su semana sin decir en qué máquina trabajó. Y eso es
justo lo que Andrea repitió cinco veces que era imprescindible.

Lo bueno: esos días **no se pierden** — van a un bucket visible «Jornadas sin máquina
asignada». Lo malo: el control por commessa que ella pidió depende de que alguien lo
rellene, y hoy nada lo obliga.

**Decisión:** ¿se vuelve obligatoria cuando el proyecto tiene órdenes? Son unas líneas
de código más el aviso en pantalla.

---

### 6. Nadie ve los cambios de otro hasta recargar

**Verificado:** no hay SSE ni polling (RT-01 y RT-02 están sin empezar).

Si el técnico envía su semana mientras Andrea tiene la bandeja abierta, ella no se
entera hasta recargar la página. Dentro de la propia sesión sí se refresca (el contador
de la bandeja y los KPIs ya escuchan `dataVersion`), pero entre personas no.

Para 13 técnicos y 2 administradores es tolerable. Conviene decirlo antes, no después.

---

### 7. Una sola instancia, y no puede escalar tal cual

**Verificado:** `railway.toml` fija `numReplicas = 1`, y está comentado por qué: el
límite de peticiones del throttler es **en memoria**, así que N réplicas multiplicarían
el límite por N. Escalar exige antes un almacén compartido.

No es un problema hoy. Es un problema el día que alguien suba las réplicas sin leer eso.

---

### 8. No hay reporte de conciliación de la migración

**Verificado:** MIG-03 sin empezar.

Se migraron 6.573 jornadas del Excel. **No hay forma de demostrarle a Andrea, fila por
fila, que los totales de la app coinciden con los de su libro.** Hasta que exista, va a
tener que creerse el número — y con razón no lo hará.

---

### 9. Faltan tableros

| | Estado | Bloqueado por |
|---|---|---|
| KPI-01, KPI-08 (vendido vs. ejecutado) | mock | pregunta 1 |
| KPI-04 (días por cliente y país) | sin empezar | pregunta 2 (falta el país) |
| KPI-05 (matriz técnico × semana) | sin empezar | **nada — se puede hacer ya** |
| KPI-06 (gráficas a Nivo) | sin empezar | que KPI-01/08 existan |

---

## 🟢 COMPROBADO Y EN ORDEN

Esto ya está bien y lo verifiqué contra producción:

| Qué | Cómo se comprobó |
|---|---|
| **RLS activo** | 13 tablas con `rowsecurity` |
| **El runtime NO es superusuario** | `fava_app`: `rolsuper = f`, `rolbypassrls = f`. Un superusuario se salta RLS *incluso con FORCE* |
| **PDF y firmas inmutables** | `note_pdfs` y `note_signatures` solo tienen `INSERT, SELECT`; `UPDATE`/`DELETE` revocados |
| **Auditoría append-only** | mismo patrón, por privilegio Y por ausencia de política |
| **Migraciones al día** | las 8 aplicadas, incluida la de gastos |
| **Aprobar refleja en KPIs** | la aprobación propaga a las jornadas y los 4 puntos de agregación filtran por `approved` |
| **Healthcheck** | `/health` responde y no consulta la base (no reinicia por un hipo de Postgres) |
| **Backups** | volumen `postgres-volume` gestionado por Railway |
| **Tests** | 88 backend + 49 frontend, y el guard de textos libres en verde |

---

## Las tres cuentas de prueba

Creadas y verificadas. El selector T·A·S se retiró: cada una entra por su lado.

| Correo | Rol | Ve |
|---|---|---|
| `tecnico@fava-la.com` | Técnico | Inicio, Mi semana, Mis notas. Vinculada a Ivan Cortes |
| `admin@fava-la.com` | Administrador | Bandeja, Proyectos, Técnicos, Usuarios, KPIs |
| `super@fava-la.com` | Super Admin | Todo lo anterior + Auditoría y Configuración |

Entran con el login de desarrollo y la contraseña compartida. Se recrean con
`npm -w backend run cuentas`.

La cuenta personal con los tres roles sigue existiendo y **no se tocó** (podría ser el
único Super Admin, y quitarle el rol sería quedarse fuera). Desde ella el reparto por rol
no se ve: para probar de verdad, usar las tres de arriba.

---

## Orden sugerido

1. **Pedirle a IT de FAVA los datos de Entra** — es lo que más tarda y no depende de nosotros
2. **Resolver las preguntas 1 y 2** con Andrea (`PREGUNTAS-PARA-ANDREA.md`) — desbloquean los puntos 2, 3 y 4
3. Cargar el vendido y conectar KPI-01/KPI-08
4. KPI-05, que no depende de nadie
5. Decidir si la máquina se vuelve obligatoria
6. Apagar el acceso de desarrollo y hacer el cutover
7. MIG-03, para poder demostrar que la migración cuadra

Los puntos 6 y 7 pueden ir en paralelo con el resto.
