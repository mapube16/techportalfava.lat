# Guía para Andrea — lo que necesitamos de Microsoft

**Para:** Andrea, administradora de Microsoft 365 de FAVA
**Tiempo estimado:** 30–40 minutos en total, en una sola sesión
**Actualizado:** 2026-08-01

Son dos cosas, y las dos se hacen en el portal de Microsoft:

1. **El inicio de sesión** — para que la gente entre con su cuenta de FAVA en vez de una
   contraseña compartida. *Esto es lo que hoy impide salir a producción.*
2. **Las notificaciones** — para que la app pueda avisar por correo y por Teams.

Conviene hacerlas juntas porque las dos necesitan los mismos permisos y el mismo portal.

---

## ⚠️ PRIMERO: comprobar que tienes el permiso correcto

Esto hay que mirarlo **antes que nada**, porque si no lo tienes, el resto no se puede
terminar y hay que pedírselo a otra persona.

**Ser administradora de Outlook / Exchange NO es suficiente.** Son roles distintos en
Microsoft: el de Exchange gestiona buzones y correo, pero **no puede autorizar
aplicaciones**, que es justo lo que hay que hacer aquí.

### Cómo comprobarlo (2 minutos)

1. Entra a **<https://entra.microsoft.com>** con tu cuenta de FAVA.
2. En el buscador de arriba escribe **«Roles and administrators»** y ábrelo.
3. Arriba a la derecha, pulsa **«My roles»** (o busca tu nombre en la lista).

Necesitas **al menos uno** de estos tres:

| Rol | Nombre en español |
|---|---|
| **Global Administrator** | Administrador global |
| **Cloud Application Administrator** | Administrador de aplicaciones en la nube |
| **Privileged Role Administrator** | Administrador de roles con privilegios |

**Si aparece alguno → puedes hacer todo lo de esta guía.**

**Si solo aparece «Exchange Administrator» u otros** → puedes crear las aplicaciones,
pero **no autorizarlas**. En ese caso hay dos salidas:

- Pedirle a quien sea Administrador global que te asigne **Cloud Application
  Administrator** (es un cambio de 30 segundos y no le da acceso a los buzones), o
- Hacer tú los pasos 1 y 2, y que esa persona haga solo el botón final de autorizar.

📌 **Dinos qué rol te sale**, aunque sea para confirmar que todo bien. Es el dato que más
puede retrasar esto.

---

# PARTE 1 — El inicio de sesión

## Qué se va a conseguir

Que la gente entre a Control Técnico con **su cuenta de FAVA**, la misma de Outlook. Sin
contraseñas nuevas, sin contraseñas compartidas.

**Cómo funciona hoy (y por qué hay que cambiarlo):** hoy la app usa una contraseña
temporal que compartimos entre todos. Cualquiera que la conozca puede entrar **como
cualquier persona dada de alta, incluido el Super Admin**. Sirvió para construir y probar,
pero no puede quedarse así.

## Qué hay que crear

Dos «registros de aplicación». Suena técnico pero es rellenar un formulario dos veces:

| | Nombre a poner | Para qué |
|---|---|---|
| **A** | `FAVA Control Tecnico API` | El servidor, que comprueba quién eres |
| **B** | `FAVA Control Tecnico SPA` | La página web, que te pide el login |

Se hacen dos porque es lo que recomienda Microsoft. Si prefieres uno solo, también se
puede — dínoslo y te pasamos la variante.

## Los pasos, en orden

El detalle exacto pantalla por pantalla está en
[`fava-control-tecnico/docs/ENTRA-SETUP.md`](fava-control-tecnico/docs/ENTRA-SETUP.md).
Aquí va el resumen para que sepas qué esperar:

1. **Crear el registro A** — nombre, y marcar *«Single tenant»* (solo gente de FAVA)
2. **Ajustar una opción del manifiesto** (`requestedAccessTokenVersion = 2`) ← si se
   olvida, el login falla con un error que no dice por qué
3. **Añadir un permiso llamado `access_as_user`**
4. **Añadir el dato «email» a la información del token** ← si se olvida, la gente entra
   pero la app no la reconoce y dice «tu cuenta no está habilitada»
5. **Crear el registro B** — con la dirección de vuelta:
   `https://techportalfava.lat/redirect.html`
6. **Darle al registro B permiso sobre el A**, y pulsar **«Grant admin consent»**
   ← este es el botón que necesita el rol del que hablábamos arriba

## Qué nos tienes que mandar

Cuatro valores. Ninguno es secreto: los tres primeros viajan en la página web de todas
formas, así que se pueden mandar por correo sin problema.

| Dónde está | Qué es |
|---|---|
| Registro A → Overview → **Directory (tenant) ID** | El identificador de FAVA |
| Registro A → Overview → **Application (client) ID** | El del servidor |
| Registro B → Overview → **Application (client) ID** | El de la página web |
| Registro A → Expose an API → el permiso completo | Empieza por `api://` |

Con esos cuatro, el cambio de nuestro lado son **cuatro variables de configuración y cero
líneas de código**. Está construido así a propósito desde el principio.

## Antes de que entre la primera persona

Un aviso para nosotros, no para ti: las cuentas que se probaron con la contraseña temporal
quedan marcadas y hay que limpiarlas, o el primer inicio de sesión real falla sin dar
ningún error visible. Ya está anotado y es un comando de una línea.

---

# PARTE 2 — Notificaciones por correo y Teams

Esto es una **etapa nueva**: no estaba en el alcance original. Aquí va qué se puede hacer
y qué necesitamos de ti.

## Qué avisos tendría sentido mandar

**Cuando pasa algo** (inmediato):

| Evento | A quién | Por qué importa |
|---|---|---|
| Un técnico envía su semana | a ti y a Luca | Hoy hay que entrar a mirar si llegó algo |
| Se aprueba una nota | al técnico | Sabe que ya está y puede firmarla |
| Se devuelve una nota | al técnico | **El más útil**: lleva el comentario de qué corregir |
| Se firma una nota | a ti | El PDF ya quedó congelado y descargable |

**Recordatorios** (a una hora fija):

| Recordatorio | A quién | Cuándo |
|---|---|---|
| «No has registrado días esta semana» | al técnico | viernes por la tarde |
| «Tu semana está sin enviar» | al técnico | lunes por la mañana |
| «Tienes N notas esperando hace más de 3 días» | a ti y a Luca | lunes por la mañana |

Los recordatorios son, en mi opinión, lo más valioso: **el problema real no es que la
gente registre mal, es que se le olvida registrar.** Un aviso el viernes evita reconstruir
la semana de memoria el lunes.

👉 **Dinos cuáles quieres y cuáles sobran.** No tiene sentido construir avisos que después
todo el mundo ignora.

## Cómo se haría — correo

Usando el mismo Microsoft de la Parte 1. Hace falta:

- Un **buzón desde el que salgan los avisos**, por ejemplo `notificaciones@fava-la.com`
  (o el que prefieras — puede ser un buzón compartido, no necesita licencia completa).
- Un permiso llamado `Mail.Send`, que también hay que autorizar con el botón del que
  hablábamos.

**Importante y te va a gustar:** ese permiso, tal cual, dejaría a la app enviar correo
*desde cualquier buzón de FAVA*. Eso es demasiado. Se acota con una **política de acceso
de aplicación** en Exchange que lo limita **a ese único buzón** — y eso sí es exactamente
tu terreno como administradora de Outlook. Es un comando de PowerShell y te lo dejamos
escrito.

## Cómo se haría — Teams

Aquí hay tres caminos y **te recomiendo el segundo**:

| Camino | Cómo va | Nuestra opinión |
|---|---|---|
| **Webhooks clásicos** de canal | Pegar una URL y listo | ❌ Microsoft los está retirando. No conviene construir sobre esto |
| **Power Automate** ⭐ | Tú creas un flujo con un disparador HTTP; nuestra app le manda los datos y el flujo publica en Teams | ✅ **Recomendado.** No necesita programación nuestra ni permisos extra, y **puedes cambiar el texto de los mensajes tú misma** sin pedirnos nada |
| **Bot de Teams** | Una app registrada que escribe por privado a cada persona | Es lo más potente (mensaje directo, no en canal) pero es bastante más montaje |

**Con Power Automate el reparto queda así:** nosotros mandamos el hecho («la nota de Iván
fue devuelta, el comentario es este»), y tú decides en el flujo si eso va a un canal, por
privado, con qué formato y a qué hora. Si mañana quieres cambiar el texto, lo cambias sin
tocarnos.

Lo único que necesitamos de ti para esto es **la dirección web que genera el flujo** al
crearlo. Nada más.

## Una decisión que sí es tuya

**¿Mensaje directo a cada persona, o a un canal?**

- **Canal** (ej. `#control-tecnico`): más fácil, todos ven todo. Bien para «llegó una nota
  nueva».
- **Directo**: cada técnico recibe solo lo suyo. Mejor para «te devolvieron la nota» y
  para los recordatorios — pero requiere el camino del bot, que es más trabajo.

Se puede empezar por canal y añadir los directos después.

---

# Resumen: qué necesitamos de ti

| # | Qué | Cuánto tarda |
|---|---|---|
| 1 | **Decirnos qué rol tienes** en Entra (lo de arriba del todo) | 2 min |
| 2 | Crear los dos registros y mandarnos los 4 valores | ~20 min |
| 3 | Decirnos **qué buzón** usamos para enviar avisos | 1 min |
| 4 | Decirnos **cuáles avisos quieres** de la lista de arriba | 5 min |
| 5 | Decidir **canal de Teams o mensaje directo** | 1 min |

Con el punto 1 y el 2 ya podemos cerrar el acceso y salir a producción. Los puntos 3, 4 y
5 son de la etapa de notificaciones y pueden ir después — pero como todo se hace en el
mismo portal, sale más barato hacerlo de una vez.

---

## Y algo que no es de Microsoft, pero es urgente

Aparte de esto, hay **dos preguntas sobre el Excel** que están frenando dos partes ya
construidas del sistema. Están en el informe aparte
(`Informe-Control-Tecnico-FAVA.pdf`), pero las repito porque van contigo también:

1. Cuando una cotización dice **«Elettricista»**, ¿a quién se refiere? Hay seis
   variantes en el histórico y elegir mal descuadra el vendido contra el ejecutado.
2. **Localidad, país, suministro y número de contrato** de los 22 proyectos: no están en
   ninguna hoja del Excel, y son los cuatro campos que imprime el encabezado de la Nota
   Semanal firmada.
