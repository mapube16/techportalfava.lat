# Fase 9 — Notificaciones por correo y Teams

**Estado:** propuesta, sin empezar
**Origen:** pedido del usuario (2026-08-01). No estaba en el alcance original.
**Depende de:** el cutover a Entra (Fase 8) — comparte la identidad y el consentimiento.

---

## Por qué existe esta fase

El sistema hoy es **de tirón**: hay que entrar a mirar si pasó algo. Andrea tiene que
abrir la bandeja para saber si llegó una nota; el técnico tiene que acordarse solo de
registrar.

Y ahí está el problema real, que no es de captura sino de memoria: **a la gente se le
olvida registrar**, y el lunes reconstruye la semana de cabeza. Eso es exactamente lo que
produce las descripciones vacías y las máquinas sin poner que se ven en el histórico del
Excel.

Un aviso el viernes vale más que cualquier validación en el formulario.

---

## Alcance propuesto

### 9.1 — Eventos (inmediatos)

Los cuatro ya existen como transiciones en `weekly-notes.service.ts`, así que el disparo
es un enganche en `transicionar()` y en `firmar()`, no lógica nueva:

| Evento | Destinatario | Contenido |
|---|---|---|
| `submit` | admins | «{técnico} envió la semana del {fecha} — {proyecto}» |
| `approve` | el técnico | «Tu nota de {proyecto} fue aprobada» |
| `return` | el técnico | «Tu nota fue devuelta: {comentario}» ← **el más útil** |
| `sign` | admins | «{proyecto} quedó firmada, el PDF ya se puede descargar» |

### 9.2 — Recordatorios (programados)

Estos SÍ son lógica nueva, y son los que justifican la fase:

| Recordatorio | Cuándo | Consulta |
|---|---|---|
| «No has registrado días esta semana» | viernes tarde | técnicos activos sin `daily_entry` en la semana en curso |
| «Tu semana está sin enviar» | lunes mañana | semanas con jornadas en `draft` y sin nota |
| «Tienes N notas esperando hace más de 3 días» | lunes mañana | `weekly_notes` en `submitted` con `updated_at` viejo |

**Hace falta un programador.** Railway soporta cron como servicio aparte; también sirve un
cron dentro del proceso, pero con `numReplicas = 1` — si algún día se escala, dos réplicas
mandarían el aviso dos veces. El cron de Railway es más seguro por eso mismo.

### 9.3 — Registro de lo enviado

Una tabla `notifications` con qué se mandó, a quién, por qué canal y si salió bien.

**No es opcional:** sin ella, «no me llegó el aviso» es indepurable, y un fallo de envío
silencioso hace que la gente deje de confiar en el sistema en dos semanas. Mismo criterio
que `audit_log`.

---

## Decisiones técnicas

### Correo — Microsoft Graph

Permiso de aplicación `Mail.Send` sobre el registro del API que ya existirá tras la
Fase 8. Se envía desde un buzón dedicado (`notificaciones@fava-la.com` o el que FAVA diga).

**El detalle que importa:** `Mail.Send` como permiso de aplicación deja enviar **desde
cualquier buzón del tenant**. Eso es demasiado poder para esto. Se acota con una
**Application Access Policy** de Exchange (`New-ApplicationAccessPolicy`) que lo restringe
a ese único buzón. Es tarea de la administradora de Exchange — que es Andrea — y hay que
pedirlo explícitamente porque nadie lo hace por defecto.

### Teams — Power Automate, no webhooks

Tres caminos evaluados:

| Camino | Veredicto |
|---|---|
| **Office 365 connectors** (incoming webhook de canal) | ❌ Microsoft anunció su retirada. Construir sobre algo que se está retirando es deuda desde el día uno |
| **Power Automate** con disparador HTTP | ✅ **Elegido** |
| **Bot en Azure Bot Service** | Aplazado. Es lo único que permite mensaje DIRECTO a una persona, pero es bastante más montaje |

**Por qué Power Automate.** El flujo lo crea y lo mantiene Andrea; nosotros solo hacemos
`POST` de un JSON con el hecho. El formato del mensaje, el canal de destino y la hora los
decide ella sin tocar nuestro código. Para una organización de este tamaño, mover esa
decisión fuera del código es lo correcto: no hay que desplegar para cambiar un texto.

**Contrapartida honesta:** parte del comportamiento vive en un sitio que no está en este
repositorio ni en su control de versiones. Se compensa con el punto 9.3 — nosotros
registramos que lo mandamos, aunque no controlemos qué hizo el flujo después.

**Limitación conocida:** Power Automate publica en un canal, no por privado. Para
mensajes directos a cada técnico hace falta el bot. Se puede empezar por canal.

---

## Lo que hay que preguntar antes de construir

1. **¿Qué avisos quiere de verdad?** Construir los 7 sin preguntar es la forma segura de
   que los desactive todos en un mes.
2. **¿Buzón de envío?**
3. **¿Canal de Teams o mensaje directo?** El directo cuesta el bot.
4. **¿Correo Y Teams, o uno de los dos?** Mandar lo mismo por dos vías es la mejor manera
   de que se ignoren las dos.

---

## Lo que NO entra

- **Notificaciones push del navegador.** Exigen service worker y permiso del usuario, y
  no aportan sobre el correo en una app que se usa en horario laboral.
- **SMS.** Nadie lo ha pedido y tiene coste por mensaje.
- **RT-01 (SSE, el badge en vivo).** Es otra cosa: eso hace que la pantalla abierta se
  actualice sola. Va en Fase 7 y no depende de esta fase.
