# Feature Research

**Dominio:** Field service / time & attendance para instalación de maquinaria industrial (captura diaria por técnico, nota semanal firmada por cliente, control comercial vendido/ejecutado)
**Researched:** 2026-07-25
**Confidence:** MEDIUM (ver §Confianza por área al final)

> **Cómo leer este documento.** Las recomendaciones son opinionadas a propósito: dicen *qué hacer*, no *qué opciones existen*. Donde el ecosistema no da una respuesta clara o la decisión es del cliente, está marcado **[DECIDIR CON FAVA]**.

---

## 0. Los 8 hallazgos que cambian el diseño

Antes de las tablas, lo que la investigación cambió respecto del diseño en `CONTEXTO §10-§11`:

1. **La unidad aprobable es la Nota Semanal, no el `daily_entry`.** En todo el mercado (Replicon, BigTime, ClickTime, Kantata, QuickBooks Time) el objeto que transita estados es el *período* (timesheet), y las líneas heredan el bloqueo. Dos máquinas de estado paralelas (entry + note) se desincronizan. → El `status` vive en `weekly_notes`; `daily_entries.status` se deriva de `weekly_note_id`. Una entrada sin nota está en `draft`.
2. **El técnico nunca debe gestionar objetos "Nota".** Captura una semana (7 filas de día); el sistema **agrupa por proyecto y deriva N notas** al enviar. Esto resuelve el edge case "2 proyectos en una semana" sin UI adicional.
3. **Orden correcto: firmar → enviar → aprobar.** La realidad de campo es que el cliente firma el viernes en planta y recién después llega a la oficina. Aprobar antes de firmar significa que FAVA contabiliza días que el cliente aún no aceptó.
4. **La firma se invalida solo si cambia el *contenido firmado*.** Guardar `signed_content_hash` en `weekly_notes`: si cambian las 7 filas / gastos / anticipos / encabezado, la firma muere y hay que re-firmar; si cambia metadata interna, sobrevive. Una columna resuelve lo que si no se vuelve una regla de negocio dispersa.
5. **El PDF firmado es un artefacto inmutable.** Reabrir una nota aprobada genera `v2`; `v1` se conserva para siempre en storage. Esto es lo que hace defendible la firma electrónica simple ante un cliente que reclama.
6. **Offline completo es anti-feature; offline de *firma + borrador* es table stakes.** Nadie necesita replicar la BD en el móvil para escribir 1 registro/día. Lo que sí no puede fallar es la captura de la firma del cliente en planta sin señal (Dynamics 365 FS resuelve conflictos a nivel de *registro completo*, con "cliente gana" por defecto, y aun así genera errores de sync que un admin debe curar — costo injustificado para 50 usuarios).
7. **`technicians` debe poder existir sin `users`.** La migración trae técnicos italianos históricos (Luca Carraro, Vito Accini…) que quizá nunca inicien sesión. Si `technicians` depende de `users`/Entra, la migración se atasca el día 1.
8. **Los registros migrados entran `approved` + `is_migrated=true`, nunca `draft`.** 7.589 filas en la bandeja de aprobación matan el producto en la demo. Y los KPIs de "% de días con nota firmada" deben excluir el histórico o mostrarán un desastre falso.

---

## Feature Landscape

### Table Stakes (los usuarios lo dan por sentado)

| Feature | Por qué se espera | Complejidad | Notas de implementación |
|---------|-------------------|-------------|-------------------------|
| **Captura semanal en grilla (7 filas de día)** | Es el formato mental del técnico y el del PDF; ninguna herramienta seria pide navegar día por día | MEDIA | Filas = días; columnas = proyecto, concepto, máquina, descripción. Espejo exacto del cuerpo de la Nota → captura única real |
| **Máquina de estados `draft → submitted → approved / returned`** | Estándar universal; sin ella el dato no es confiable para KPIs ni facturación | MEDIA | Endpoints de transición dedicados (ya decidido). `returned` vuelve a editable |
| **Comentario obligatorio al devolver** | Devolver sin motivo genera un ping-pong que mata la adopción | BAJA | Validación en el DTO. El comentario viaja en la notificación al técnico |
| **Bloqueo al enviar (read-only, no oculto)** | "Post-approval editing rights should be removed, but read-only access after lock is the correct configuration" | BAJA | Guard + RLS. El técnico sigue *viendo* lo enviado; solo no edita |
| **Inmutabilidad tras aprobación** | Si el dato aprobado cambia solo, los KPIs y el PDF firmado dejan de coincidir | MEDIA | Ninguna ruta de escritura toca `approved` salvo `reopen` (ver diferenciadores) |
| **Auditoría de toda transición (quién/cuándo/antes/después)** | Es la única defensa cuando el cliente o la matriz cuestiona un número | MEDIA | Interceptor transversal → `audit_log`. Ya previsto en §14 |
| **Bandeja de aprobación con filtros (técnico, proyecto, semana, estado)** | El admin revisa por lotes; sin filtros aprueba a ciegas (patología documentada del sector: "managers approve in bulk without reviewing") | BAJA | Vista tabla + contadores. Fuente del badge SSE |
| **PDF fiel al formato real** | Es un documento contractual que ve el cliente final de FAVA; un PDF "parecido" no lo aceptan | ALTA | Encabezado: Cliente, NIT, Localidad, Suministro, Contrato, Maquinaria, **Cargo durante la semana**, Técnico. Cuerpo 7 filas + columna NOTA. Pie: Gastos, Anticipo, declaración de conformidad, doble firma + fecha/timbre |
| **Captura de firma en canvas (técnico + cliente)** | Decisión confirmada del cliente (§7.3); es el patrón estándar de FSM (Salesforce `DigitalSignature`, "proof of service") | MEDIA | Canvas → PNG/SVG embebido en el PDF. Debe funcionar sin conexión |
| **Registro de evidencia de firma** | Sin él la firma electrónica simple no es defendible (ver §Firma) | MEDIA | Nombre + documento del firmante, cargo, timestamp **de servidor**, IP, user-agent, hash del PDF firmado |
| **Un registro por técnico por día, fecha local** | Es la regla del Excel fuente y del negocio (día = unidad, no horas) | BAJA | `UNIQUE(technician_id, date)` con `date` tipo `DATE` (sin hora, sin tz) |
| **Catálogos cerrados (concepto, rol, proyecto, máquina)** | El texto libre es la *causa raíz* de los 6 problemas de calidad detectados en el Excel | BAJA | FKs. Nunca reintroducir campos libres para estas 4 entidades |
| **Días vendidos vs. ejecutados por proyecto (rol × fase)** | Es el motivo comercial del proyecto; hoy se calcula a mano y tiene errores aritméticos visibles | MEDIA | `project_sold_days` (rol × fase) vs. agregación de entries aprobadas. Delta calculado, nunca digitado |
| **Tablero de estado de reportes** | El admin necesita saber qué semanas faltan antes de cerrar el mes | BAJA | Matriz técnico × semana con semáforo (sin registrar / draft / enviado / aprobado) |
| **Utilización por técnico** | KPI #1 de todo servicio profesional | MEDIA | **[DECIDIR CON FAVA]** el denominador: ¿LR/NR/IL entran o no en días disponibles? Es la métrica más discutida del sector |
| **Distribución por concepto + días por cliente/país** | Reemplaza `Dettaglio` y las tablas dinámicas manuales | BAJA | Agregaciones SQL puras + Nivo |
| **Migración del histórico con reporte de conciliación** | Sin histórico los KPIs no sirven; sin conciliación FAVA no confía en los números | ALTA | Totales Excel vs. app por técnico/proyecto/mes/concepto + lista de cada transformación aplicada |
| **SSO Entra ID + baja en directorio = pierde acceso** | Cliente Microsoft 365; nadie acepta otra contraseña | MEDIA | Ya decidido. Tenant dev → tenant FAVA por env vars |
| **RBAC 3 roles + RLS** | Un técnico no puede ver la bitácora de otro (matriz §6) | MEDIA | Defensa en profundidad ya decidida |
| **Centro de notificaciones in-app + badge en vivo** | El técnico debe enterarse de que le devolvieron la nota sin revisar manualmente | BAJA | SSE ya está en el alcance; la notificación es casi gratis encima |
| **Persistencia de borrador local + envío idempotente** | Conectividad variable en planta; perder 20 min de captura una vez y el técnico vuelve al papel | BAJA | `localStorage`/IndexedDB + `Idempotency-Key` (UUID de cliente) para que el doble-tap no duplique |
| **Baja de técnico sin pérdida de historia** | Requisito legal y operativo; Oracle HCM y Employment Hero lo modelan así | BAJA | `is_active=false` + `deactivated_at`. Nunca borrado físico, nunca cascade delete |
| **Idioma ES/IT en UI** | Filial italiana; ya existe el toggle | BAJA | Ya construido en el frontend |

---

### Differentiators (ventaja competitiva real para FAVA)

| Feature | Propuesta de valor | Complejidad | Notas de implementación |
|---------|-------------------|-------------|-------------------------|
| **Notas semanales derivadas automáticamente por proyecto** | Resuelve "2 proyectos en una semana" sin que el técnico entienda el concepto de "nota". Ninguna PSA del mercado hace esto: todas exigen elegir el timesheet primero | MEDIA | Al enviar la semana: `GROUP BY project_id` → N notas. Días sin proyecto (LR/NR/IL) no generan nota |
| **Captura única real: nota + KPIs + control comercial de un solo dato** | Es el *core value*. El mercado está partido: las PSA hacen timesheets, las FSM hacen service reports; nadie hace "la nota firmada por el cliente **es** el parte de horas" | ALTA (es la suma del resto) | La fidelidad del PDF es lo que permite que la captura sea única. Si el PDF no sirve, vuelven al Word |
| **Trazabilidad al origen: `source_row_ref` en cada fila migrada** | Cualquier número del tablero se puede rastrear hasta la fila exacta del Excel. Barato de implementar, enorme en confianza durante la aceptación | BAJA | Una columna `text` con `hoja!fila`. Se descarta a los 6 meses si molesta |
| **Idioma del PDF por cliente (independiente del idioma de UI)** | Clientes en Brasil, Grecia, Turquía, USA; la matriz italiana pide sus formatos. Que la nota salga en el idioma del cliente mientras el técnico usa ES es percepción de producto serio | BAJA | Diccionario de plantilla + campo `pdf_locale` en `clients`. **No** es traducción automática de texto libre (eso está fuera de alcance) |
| **Versionado de la nota con PDF histórico inmutable** | Permite corregir después de aprobar sin destruir la evidencia de lo que el cliente firmó | MEDIA | `version` + `signed_content_hash` + PDFs `v1..vN` en storage privado |
| **Reapertura post-aprobación auditada (solo Super Admin, motivo obligatorio)** | Es la práctica del sector (QuickBooks "unapprove", Connecteam "reopen permission", Hubstaff "unlock" limitado a 90 días) pero casi siempre está mal auditada. Hacerlo bien es diferenciador frente al Excel actual | MEDIA | `POST /weekly-notes/:id/reopen` → estado `returned`, `version++`, motivo en `audit_log`, firma invalidada si cambia el hash |
| **Reconciliación Excel ↔ app como pantalla, no como archivo suelto** | Convierte la migración de "confía en mí" a evidencia navegable | MEDIA | Tabla comparativa con diferencias resaltadas + export |
| **Vista calendario de la bitácora** | Detectar huecos (días sin registrar) es visualmente instantáneo; en tabla no | MEDIA | Detectado como faltante en la revisión 2026-07-25 |
| **Ruta de escape de firma: adjuntar PDF firmado escaneado** | El cliente que se niega a firmar en el móvil existe y bloquea todo el flujo. Sin escape, el proceso vuelve al papel el primer día | BAJA | `signature_method: canvas \| uploaded_scan` + el mismo registro de evidencia |
| **Aviso de notas pendientes al dar de baja a un técnico** | Detalle de UX de altísimo valor: evita el caso "lo desactivaron y quedaron 3 semanas sin aprobar" | BAJA | Contador en el diálogo de baja + acción "aprobar en nombre de" con rastro en auditoría |

---

### Anti-Features (piden esto, no lo construyas)

| Feature | Por qué lo piden | Por qué es problemático | Alternativa |
|---------|------------------|-------------------------|-------------|
| **Motor offline-first completo (réplica local + resolución de conflictos)** | "Los técnicos están en planta sin señal" | Dynamics 365 FS resuelve conflictos **a nivel de registro completo, no de campo**, con "cliente gana" por defecto, y aun así deja errores de sync que un admin debe curar. Costo enorme para ~1 registro/técnico/día | Borrador local + cola de reenvío + `Idempotency-Key`. Solo la **firma y los datos de la nota** deben sobrevivir sin conexión |
| **Editar el registro aprobado "solo un poquito"** | "Es un typo, no vale la pena reabrir" | Rompe la correspondencia entre el PDF que el cliente firmó y el dato que alimenta los KPIs. Es *el* bug clásico de integridad en FSM | `reopen` explícito con motivo, versión y re-firma si cambió el contenido firmado |
| **Aprobación parcial de una nota (6 de 7 días)** | Acelerar el cierre | La nota es un artefacto contractual atómico ya firmado por el cliente. Aprobar la mitad de un documento firmado no significa nada | Aprobar/devolver la nota completa. Si sobra un día, se devuelve |
| **Cadenas de aprobación multinivel / delegación** | "¿Y si el admin está de vacaciones?" | 2 admins y ~15 técnicos. Un motor de workflow configurable es meses de trabajo para un caso que se resuelve con un segundo admin | 2 admins con el mismo permiso. El Super Admin siempre puede |
| **`PATCH /status` genérico** | Es "más REST" | Cada transición tiene reglas distintas (no aprobar sin sus días, no firmar sin proyecto) y auditoría distinta | Endpoints de transición dedicados — ya decidido en §11 |
| **GPS / geocercas / control de presencia del técnico** | Es la feature estrella de todo FSM comercial | Destruye la confianza del equipo, activa obligaciones de habeas data (Ley 1581/2012) y **no sirve al core value**: el dato de valor es el día en el proyecto, no dónde estuvo el técnico | La firma del cliente en la nota ya es la prueba de presencia, y es la que legalmente importa |
| **Granularidad de horas en lugar de días** | "Los timesheets se miden en horas" | El dominio entero (conceptos DC/MD/DFD, días vendidos, la Nota, el Excel de 5 años) está en días. Introducir horas obliga a reescribir KPIs y PDF | Mantener el día atómico. `MD` (medio día) ya cubre el caso fraccionario |
| **Portal web para que el cliente final inicie sesión y firme** | "Más profesional que firmar en el móvil del técnico" | Identidad para externos (Entra B2B), invitaciones, soporte a usuarios que usarán la app 4 veces al año | Firma presencial en el dispositivo del técnico + envío del PDF por correo al cliente. Es lo que ya ocurre en papel |
| **Traducción automática ES↔IT de texto libre** | Filial italiana | Ya descartado por decisión 2026-07-25 | Toggle de UI + catálogos bilingües |
| **WebSockets / edición colaborativa** | "Tiempo real" | ~50 usuarios, sin edición concurrente del mismo registro | SSE + refetch tras mutación — ya decidido |
| **Email por cada evento a los admins** | "Que no se les pase nada" | Fatiga de notificación documentada: el admin filtra la carpeta a la semana 2 y deja de leer | In-app + badge SSE siempre; email **solo** para nota devuelta (inmediato) y digest diario de pendientes |
| **Librería de fotos / adjuntos ilimitados en la nota** | "Sería útil documentar el trabajo" | El formato real de la Nota no tiene sección de fotos; storage + moderación + peso en móvil sin conexión | Fase 2, y solo si el cliente lo pide con un caso de uso concreto |
| **Firma digital certificada (certificado de entidad acreditada) para el cliente** | "Firma digital = más válido" | El firmante es un jefe de planta en Brasil o RD que no tiene certificado. El Decreto 2364/2012 permite explícitamente firma electrónica implementada por la propia empresa sin entidad de certificación | Firma electrónica simple + expediente de evidencias robusto (es donde está el valor probatorio real) |
| **Cálculo de nómina / liquidación** | "Ya tenemos los días" | Fuera de alcance declarado; abre responsabilidad laboral | La app entrega insumos; export a quien liquida |
| **Pre-cargar días futuros vacíos** | Lo hace el Excel actual (1.009 filas 2026 sin concepto) | Ensucia agregaciones y bandejas | Registrar solo lo ocurrido; los huecos se detectan en la vista calendario |

---

## Respuestas específicas a las preguntas de investigación

### A. Flujo de aprobación — cómo funciona en el mercado

Patrón estándar de tres etapas, confirmado en Replicon, BigTime, ClickTime, Connecteam, QuickBooks Time y Shiftbase: **el empleado envía al cerrar el período → el supervisor revisa → las horas aprobadas fluyen a nómina/facturación**. Puntos que el mercado trata como no negociables:

- **Deadline explícito** (típicamente viernes fin de jornada para ciclo semanal) con recordatorios automáticos.
- **Bloqueo tras aprobar**, con acceso de solo lectura conservado.
- **Registro de quién aprobó qué y cuándo.**
- **Reapertura permitida pero privilegiada**: solo administradores con permiso específico de "reopen"; Hubstaff la limita a 90 días hacia atrás; QuickBooks separa "unapprove" de "reject". La guía de sector es explícita: *desbloquear solo cuando la corrección es necesaria y luego re-ejecutar verificación y aprobación*.

**Recomendación FAVA (opinionada):**

```
draft ──submit──> submitted ──approve──> approved ──reopen(S, motivo)──> returned
  ^                    │                                                     │
  └────return(A/S, comentario obligatorio)──────────────────────────────────┘
```

- `submit` exige: firma del cliente presente **o** motivo explícito de ausencia de firma.
- `approve` exige: todos los días del rango cubiertos por una entrada (o marcados como no laborables).
- `return` exige comentario; reabre para edición **solo los días de esa nota**, no la semana entera.
- `reopen` es exclusivo de Super Admin, exige motivo, incrementa `version`, conserva el PDF anterior y **invalida la firma si `signed_content_hash` cambia**.
- Patología a evitar por diseño: la aprobación masiva sin revisar. Mitigación barata: en la bandeja, resaltar las notas con anomalías (semana sin proyecto, delta que excede días vendidos, concepto inusual) para que la revisión se concentre donde importa.

### B. Auditoría — qué se espera capturar

Mínimo del sector para cada transición: **qué cambió, por qué cambió, quién lo cambió y si el cambio anuló una verificación previa del empleado**. Traducido al esquema ya diseñado (`audit_log`): `actor_user_id`, `action`, `entity`, `entity_id`, `before`, `after`, `at` — más dos campos que faltan y son los que importan en disputa:

- `reason` (obligatorio en `return` y `reopen`)
- `on_behalf_of_technician_id` (cuando un admin actúa por un técnico dado de baja)

El log debe ser **append-only** (sin `UPDATE`/`DELETE` para el rol de aplicación) y visible al Super Admin (`GET /api/audit`, ya previsto).

### C. Firma digital — legalidad y práctica

**Marco Colombia:** la Ley 527 de 1999 da soporte legal a los mensajes de datos; el Decreto 2364 de 2012 la reglamenta para firma electrónica. Una firma electrónica cumple el requisito de firma si es *confiable y apropiada para los fines* del mensaje. Los métodos admitidos incluyen códigos, contraseñas, datos biométricos y claves criptográficas. Firmas digitalizadas y electrónicas tienen la misma validez que la manuscrita salvo donde la ley exija manuscrita expresamente. La implementación puede ser propia de la empresa, **sin requerir entidad de certificación digital**.

**Marco UE (relevante por la matriz italiana y clientes en Grecia/Turquía/Europa):** eIDAS Art. 25(1) — *"An electronic signature shall not be denied legal effect and admissibility as evidence in legal proceedings solely on the grounds that it is in an electronic form..."*. La firma electrónica simple es admisible; el peso probatorio lo aporta la evidencia.

**Consecuencia de producto (esto es lo importante):** la validez no viene del canvas, viene del **expediente de evidencias**. Los tres pilares que hay que poder demostrar son *identificación única del firmante*, *intencionalidad* (acto consciente, no accidental) y *control exclusivo*. Capturar en `weekly_notes` / tabla `signature_evidence`:

| Campo | Por qué |
|---|---|
| Nombre completo + documento de identidad + cargo del firmante | Identificación única (pilar 1) |
| Aceptación explícita de la declaración de conformidad (checkbox separado del trazo) | Intencionalidad (pilar 2) — es el equivalente a "acepto obligarme por este documento" |
| Timestamp **de servidor**, nunca del dispositivo | El reloj del firmante no es prueba |
| IP de origen + user-agent + id de dispositivo | Trazabilidad |
| Hash SHA-256 del PDF exacto firmado | Integridad — permite probar que el documento no cambió |
| Imagen del trazo (PNG/SVG) | Evidencia visual, la parte menos importante legalmente |
| Usuario de la app que presenció la firma (el técnico autenticado por Entra) | Cadena de custodia |

**Nota honesta:** esto es investigación técnica, no asesoría legal. Antes de producción, FAVA debería validar el texto de la declaración de conformidad y el expediente de evidencias con su abogado. Confianza: MEDIA-ALTA en el marco normativo (fuentes oficiales + múltiples proveedores coincidentes), MEDIA en la suficiencia práctica del expediente propuesto.

**Práctica FSM comparable:** Salesforce Field Service modela la firma como objeto propio (`DigitalSignature`) ligado al *service report*; cuando se captura la firma se genera el PDF, y **si el usuario está offline el PDF se genera en la siguiente conexión**. Ese es exactamente el comportamiento a copiar: firma capturable offline, PDF renderizado en servidor al sincronizar.

### D. Timesheets multi-proyecto por semana

El patrón de mercado (Replicon "Time Distribution Grid", BigTime grid/calendar) es una grilla semanal con **filas = proyecto/tarea y columnas = días**, porque miden horas divisibles. FAVA es el caso inverso: **el día es atómico y lleva un código de concepto**, no una fracción de horas. Por eso la grilla correcta aquí es **filas = 7 días, columnas = proyecto / concepto / máquina / descripción** — que además es literalmente el cuerpo del PDF.

Resolución del edge case *"técnico con 2 proyectos en la semana"*:
- El técnico llena los 7 días, cada uno con su propio proyecto.
- Al enviar, el sistema agrupa por proyecto → 2 notas semanales, cada una con sus días.
- **[DECIDIR CON FAVA]** Cómo se renderiza el PDF de la nota A: ¿7 filas con las de proyecto B en blanco, o solo las filas de A? Renderizar las filas del otro proyecto revelaría al cliente A trabajo hecho para otro cliente. Recomendación por defecto: 7 filas de fecha, contenido solo en los días de esa nota, resto en blanco.

**[DECIDIR CON FAVA]** ¿Puede un `MD` (medio día) partirse entre dos proyectos el mismo día? Si sí, `UNIQUE(technician_id, date)` debe relajarse a `UNIQUE(technician_id, date, project_id)` + check de que las fracciones sumen ≤ 1. Recomendación v1: **no** — mantener el día atómico, igual que el Excel y el PDF actuales.

### E. Zonas horarias con "una fila por técnico por día"

El error clásico está documentado: un fichaje a las 21:00 GMT-4 en Nueva York aparece en el timesheet del día siguiente si se calcula sobre GMT+0. La solución de mercado (Jibble, ClockShark, Factorial, When I Work) es **zona horaria por persona/turno**, mostrando la hora local en que se registró.

**Recomendación FAVA (barata y correcta):**
- `daily_entries.date` es `DATE` puro — sin hora, sin zona. Un día de trabajo es una **fecha calendario local del sitio**, no un instante. Postgres `date` ya lo modela; no hay conversión posible que lo rompa.
- Todos los timestamps de *evento* (`created_at`, `submitted_at`, `approved_at`, `signed_at`) son `timestamptz` en UTC.
- **Nunca** derivar la fecha de trabajo con `new Date()` en el servidor. El cliente propone la fecha local del dispositivo; el técnico puede corregirla.
- Semana ISO (lunes–domingo) calculada sobre fechas locales → inmune a DST y a cambios de huso.
- Opcional (barato): `projects.timezone` (IANA) para calcular el default de fecha y avisar cuando el dispositivo del técnico está en otro huso que el sitio. Complejidad BAJA, evita el 90% de los reclamos.
- El caso "vuelo que cruza la medianoche" ya está resuelto en el dominio: `DVSF` (salida) un día y `DVRC` (retorno) otro. No hace falta lógica extra.

### F. Captura móvil con conectividad pobre

Referencia oficial (Microsoft Dynamics 365 Field Service): la app es offline-first, los conflictos se detectan **a nivel de tabla, no de campo** (si el técnico cambia `Start Time` y el despachador `End Time`, eso ya es conflicto y no se hace merge), y el comportamiento por defecto es *"los cambios del técnico ganan"*. Los admins luego revisan `Settings > Sync Errors`. Es un sistema completo, y también es un sistema con mantenimiento permanente.

**Recomendación FAVA — tres niveles, tomar solo los dos primeros:**

| Nivel | Qué incluye | Veredicto |
|---|---|---|
| 1. Resiliencia de captura | Autosave local del borrador (IndexedDB), restauración al reabrir, indicador de estado de conexión, cola de reenvío con `Idempotency-Key` | **v1 — table stakes.** ~1 día de trabajo |
| 2. Firma offline | Canvas + evidencia guardados localmente; el PDF se genera en servidor al sincronizar (patrón Salesforce FSM) | **v1 — table stakes.** Es el único momento en que la falta de señal bloquea al negocio |
| 3. Réplica offline completa | Catálogos, proyectos, histórico y notas replicados con resolución de conflictos | **Anti-feature.** Sin edición concurrente del mismo registro, no hay conflictos que resolver |

Ventaja estructural del dominio: `UNIQUE(technician_id, date)` + RLS (cada técnico solo escribe lo suyo) hace que **los conflictos de escritura sean estructuralmente imposibles** salvo que el mismo técnico use dos dispositivos a la vez. "Última escritura gana" es suficiente y honesto.

### G. Notificaciones

Patrones observados (ClickTime, Kantata, Clockify, Homebase, Planview):
- *Timesheet Submitted* → al aprobador, in-app + email.
- *Review Timesheet Reminder* → **recordatorio diario agregado** al manager con notas pendientes ("tiene N pendientes"), no un correo por nota.
- *Missing timesheet nudge* → al empleado, con horarios estratégicos (mañana 9-10, o empuje del viernes por la tarde) y escalamiento al manager si se pasa el plazo.
- Fatiga de notificación: el consenso es explícito — notificar **solo a quien debe actuar**, y agregar en lugar de disparar por evento.

**Recomendación FAVA:**

| Evento | Canal v1 | Canal v1.x |
|---|---|---|
| Nota devuelta al técnico | In-app + push SSE (badge) | + email inmediato con el comentario |
| Nota aprobada | In-app | — |
| Nota enviada → admin | Badge SSE en la bandeja (contador en vivo) | — |
| Notas pendientes de aprobar | Contador permanente en la bandeja | + digest diario por email (uno solo, agregado) |
| Semana sin registrar | Semáforo en el tablero de estado de reportes | + recordatorio viernes PM al técnico |

Email fuera de v1 a propósito: Railway bloquea SMTP saliente → requiere integrar Resend (API), y el badge SSE ya cubre el 80% del valor. Notificaciones ya estaban en Fase 3 del alcance original.

### H. Concepto "Sin Proyecto"

El mercado modela esto como **categorías de tiempo no facturable** (bench, training, admin, internal), y la guía es explícita: *no meter todo el no-facturable en un solo balde* — 10 días de capacitación significan algo distinto a 10 días de banca.

**Recomendación FAVA:**
- `daily_entries.project_id` **nullable**, con `CHECK`: `project_id IS NOT NULL` cuando el concepto lo requiere (DC, DFD, DVSF, DVRC, MD) y libre para LR / NR / IL. Una restricción de BD en lugar de validación dispersa en la app.
- **No** crear un proyecto centinela "Sin Proyecto": ensucia el maestro de proyectos y todos los `JOIN` de KPI.
- "Sin Proyecto" es un **bucket derivado** en los tableros, desglosado por concepto (LR ≠ NR ≠ IL). Cada uno cuenta distinto en la utilización.
- **[DECIDIR CON FAVA]** ¿LR/NR/IL entran en el denominador de utilización? Es la decisión que define si el número es creíble.

### I. Baja de técnico con notas pendientes

Práctica del sector (Oracle HCM, Employment Hero): tras la fecha de terminación la persona **no puede crear, editar, borrar ni enviar** registros; y las notas pendientes **no se pueden aprobar sin reactivar** al empleado — un flujo que todos los usuarios odian.

**Recomendación FAVA (mejor que el estándar del mercado):**
1. `technicians.is_active = false` + `deactivated_at` (fecha). Nunca borrado físico, nunca cascade.
2. Bloquear entradas nuevas con `date > deactivated_at`; el histórico sigue intacto y sigue contando en KPIs.
3. Las notas pendientes **quedan en la bandeja marcadas como "técnico inactivo"** — no desaparecen ni exigen reactivación.
4. El Admin puede `submit`/`approve` **en nombre de**, y el `audit_log` registra `on_behalf_of_technician_id`. Esto evita el baile de reactivar-aprobar-desactivar.
5. El diálogo de baja muestra el conteo de pendientes antes de confirmar.
6. `users.is_active` es **independiente** de `technicians.is_active`: un técnico puede existir sin cuenta Entra (los históricos migrados) y una cuenta puede desactivarse sin borrar al técnico.

---

## Feature Dependencies

```
[Catálogos: concepts, role_types]
    └──requires──> (nada; primer bloque)

[Maestro de proyectos + clientes (NIT, localidad, suministro, contrato)]
    └──requires──> [Catálogos]
                       └──BLOQUEA──> [PDF Nota Semanal]   ← el encabezado del PDF vive aquí

[Maestro de técnicos]
    └──requires──> [Catálogos]
    └──independiente de──> [Usuarios/Entra ID]   ← crítico para la migración

[Bitácora diaria (captura semanal)]
    └──requires──> [Catálogos] + [Proyectos] + [Técnicos]

[Notas semanales derivadas]
    └──requires──> [Bitácora diaria]

[Flujo submit/approve/return]
    └──requires──> [Notas semanales] + [RBAC/RLS] + [audit_log]

[Firma del cliente + evidencia]
    └──requires──> [Flujo de aprobación] + [PDF] + [storage privado con signed URLs]
                       └──requires──> [signed_content_hash]

[Reopen post-aprobación]
    └──requires──> [Firma + evidencia] + [versionado de PDF]

[KPIs vendido/ejecutado]
    └──requires──> [entries aprobadas] + [project_sold_days] + [Migración del histórico]

[Migración del histórico]
    └──requires──> [Catálogos] + [mapa de alias de técnicos] + [consolidación de proyectos]
    └──BLOQUEA──> [Reporte de conciliación]

[SSE]
    └──requires──> [Flujo de aprobación]   ← sin transiciones no hay nada que emitir

[Notificaciones in-app]
    └──enhances──> [SSE]   (mismo canal, costo marginal)

[Email (Resend)]
    └──requires──> [Notificaciones in-app] + infra externa (Railway bloquea SMTP)

[Offline de firma] ──enhances──> [Firma del cliente]

[Aprobación parcial] ──CONFLICTS──> [Firma del cliente]
[Edición post-aprobación in situ] ──CONFLICTS──> [Inmutabilidad del PDF firmado]
[Granularidad en horas] ──CONFLICTS──> [Días vendidos rol×fase + formato del PDF]
```

### Notas de dependencia

- **PDF requiere maestro de proyectos completo:** los campos NIT, localidad, suministro y número de contrato **no existen en las hojas diarias del Excel** — están en las hojas por proyecto. Sin ese CRUD cargado no se puede emitir una nota fiel. **Consecuencia de roadmap: el módulo `projects` va antes que `weekly-notes`**, confirmando el orden sugerido en CONTEXTO §16.
- **"Cargo durante la semana" varía por semana:** debe vivir en `weekly_notes`, no en `technicians`. Default desde `technicians.role_type_id`, editable en la nota. Campo faltante en el esquema §10.
- **Gastos y anticipos** → `JSONB` en `weekly_notes`, **solo informativos en v1** (decisión ya tomada). No entran en ningún KPI ni disparan reembolso; si entraran, arrastran un flujo de aprobación financiera propio.
- **Reopen requiere versionado antes que nada:** implementar `reopen` sin conservar el PDF v1 destruye la evidencia. Si el versionado no cabe en la fase, `reopen` tampoco.
- **KPIs requieren migración:** un tablero vendido/ejecutado sin 2025-2026 no le sirve a nadie y quema la primera demo.
- **Firma y aprobación tienen orden obligatorio:** firmar → enviar → aprobar. Invertirlo significa contabilizar días que el cliente no aceptó.

---

## MVP Definition

### Launch With (v1)

- [ ] **Catálogos + maestros (técnicos, proyectos con datos comerciales y de encabezado, máquinas, días vendidos rol×fase)** — bloquea todo lo demás
- [ ] **Captura semanal en grilla de 7 días** con `UNIQUE(técnico, fecha)` y `date` local puro — es el core value
- [ ] **Derivación automática de notas por proyecto** — resuelve el edge case de 2 proyectos sin UI extra
- [ ] **Flujo submit / approve / return** con comentario obligatorio y bloqueo al enviar
- [ ] **PDF fiel al formato real** (encabezado completo, columna NOTA, gastos, anticipos, declaración, doble firma)
- [ ] **Firma en canvas + expediente de evidencias + `signed_content_hash`** — la firma es requisito confirmado del cliente
- [ ] **Reopen post-aprobación (Super Admin, motivo obligatorio, `version++`, PDF anterior conservado)** — está en los edge cases activos
- [ ] **`audit_log` append-only con `reason` y `on_behalf_of`** + visor para Super Admin
- [ ] **Entra ID + RBAC 3 roles + RLS**
- [ ] **5 tableros Nivo:** vendido/ejecutado por proyecto, utilización, distribución por concepto, días por cliente/país, estado de reportes
- [ ] **Migración 2025+2026 + reporte de conciliación** (entries migradas como `approved` + `is_migrated` + `source_row_ref`)
- [ ] **SSE:** badge de bandeja + refresco de tableros
- [ ] **Centro de notificaciones in-app** (devuelta / aprobada / pendientes)
- [ ] **Baja de técnico con `deactivated_at` + "aprobar en nombre de"**
- [ ] **Borrador local + `Idempotency-Key` + firma capturable sin conexión**

### Add After Validation (v1.x)

- [ ] **Email vía Resend** (nota devuelta + digest diario) — cuando aparezca el primer "no me enteré de que me la devolvieron"
- [ ] **Ruta de escape de firma: subir PDF firmado escaneado** — cuando el primer cliente se niegue a firmar en el móvil (va a pasar; barato de agregar)
- [ ] **Vista calendario de la bitácora** — cuando los huecos empiecen a costar tiempo de admin
- [ ] **Idioma del PDF por cliente** — cuando entre el primer cliente no hispanohablante que reclame
- [ ] **Resaltado de anomalías en la bandeja** (delta > vendido, semana sin proyecto) — cuando se detecte aprobación masiva sin revisión
- [ ] **Export a Excel de los tableros** — a demanda de la matriz
- [ ] **Historial de versiones de nota visible en UI** (v1 solo lo guarda; v1.x lo muestra)

### Future Consideration (v2+)

- [ ] **Módulo Viaggi con facturación en €** — la fórmula sigue sin definir por el cliente; construir sin ella es adivinar
- [ ] **Exportaciones formato casa matriz (Resoconto / Dettaglio / Viaggi)** — Fase 2 ya declarada
- [ ] **Alertas de desviación de proyecto** (proyección: "a este ritmo X excede los días vendidos en N") — necesita al menos 2 trimestres de datos limpios para calibrar
- [ ] **Planeación / asignación de técnicos** — Fase 3; requiere que la bitácora ya sea confiable
- [ ] **Adjuntos y fotos en la nota** — solo con caso de uso concreto del cliente
- [ ] **Fraccionamiento de día entre 2 proyectos** — solo si FAVA confirma que ocurre; rompe `UNIQUE(técnico, fecha)`

---

## Feature Prioritization Matrix

| Feature | Valor de usuario | Costo de implementación | Prioridad |
|---------|------------------|-------------------------|-----------|
| Captura semanal en grilla | ALTO | MEDIO | **P1** |
| Maestro de proyectos con datos de encabezado | ALTO | MEDIO | **P1** (bloquea PDF) |
| PDF fiel al formato real | ALTO | ALTO | **P1** |
| Firma canvas + evidencia | ALTO | MEDIO | **P1** |
| Flujo submit/approve/return + bloqueo | ALTO | MEDIO | **P1** |
| Notas derivadas por proyecto | ALTO | MEDIO | **P1** |
| Auditoría append-only | ALTO | BAJO | **P1** |
| Entra ID + RBAC + RLS | ALTO | MEDIO | **P1** |
| Migración + conciliación | ALTO | ALTO | **P1** |
| Tableros vendido/ejecutado + utilización | ALTO | MEDIO | **P1** |
| Tablero de estado de reportes | MEDIO | BAJO | **P1** |
| SSE + notificaciones in-app | MEDIO | BAJO | **P1** |
| Reopen auditado + versionado de PDF | MEDIO | MEDIO | **P1** (edge case activo) |
| Baja de técnico + aprobar en nombre de | MEDIO | BAJO | **P1** |
| Borrador local + idempotencia + firma offline | ALTO | BAJO | **P1** |
| `source_row_ref` (trazabilidad al Excel) | MEDIO | BAJO | **P1** (barato, gran confianza) |
| Email (Resend) | MEDIO | MEDIO | P2 |
| Subida de firma escaneada | MEDIO | BAJO | P2 |
| Vista calendario | MEDIO | MEDIO | P2 |
| Idioma del PDF por cliente | MEDIO | BAJO | P2 |
| Resaltado de anomalías en bandeja | MEDIO | BAJO | P2 |
| Export Excel de tableros | MEDIO | MEDIO | P2 |
| Viaggi con facturación | ALTO (comercial) | ALTO | P3 (bloqueado por regla de negocio) |
| Exportaciones casa matriz | MEDIO | ALTO | P3 |
| Alertas de desviación | MEDIO | ALTO | P3 |
| Planeación de técnicos | BAJO (hoy) | ALTO | P3 |
| GPS / geocercas | NEGATIVO | MEDIO | **Nunca** |
| Offline-first completo | BAJO | ALTO | **Nunca** |
| Granularidad en horas | NEGATIVO | ALTO | **Nunca** |

---

## Competitor Feature Analysis

| Feature | Salesforce Field Service | Dynamics 365 Field Service | Replicon / BigTime (PSA) | Excel + Word (statu quo FAVA) | Nuestro enfoque |
|---|---|---|---|---|---|
| Unidad de captura | Work order / service appointment | Booking | Timesheet por período, horas por proyecto | Fila por técnico/día | **Día atómico con concepto**, fila por técnico/día (fiel al dominio) |
| Aprobación | Cierre de work order | Cierre de booking | submit → approve → (unapprove privilegiado) | Correo + criterio | submit → approve/return → **reopen auditado con versión** |
| Firma del cliente | `DigitalSignature` en service report; PDF se genera al reconectar | Captura offline en el móvil | No aplica (no es documento de cliente) | Papel escaneado | Canvas + **expediente de evidencias** (nombre, documento, IP, hash, timestamp servidor) |
| Documento entregable | Service Report configurable | Service Report | Reporte de horas / factura | Word rellenado a mano | **Nota Semanal fiel**, generada del mismo dato — captura única |
| Offline | Offline-first completo | Offline-first, conflictos a nivel de registro, "cliente gana" por defecto, panel de Sync Errors | Web, sin offline real | N/A (papel) | **Borrador local + firma offline únicamente**; sin motor de sync |
| Multi-proyecto por semana | Un work order por trabajo | Un booking por trabajo | Grilla proyecto × día | Una fila por día con columna proyecto | **Grilla de 7 días → N notas derivadas por proyecto** |
| Control comercial vendido/ejecutado | No nativo | No nativo | Budget vs. actual en horas/€ | Tablas dinámicas manuales con errores aritméticos | **Vendido/ejecutado por rol × fase, calculado** |
| Notificaciones | Push + email por evento | Push + email | Recordatorios + digest a aprobadores | Correos ad-hoc | **In-app + SSE en v1**, email agregado en v1.x |
| Trazabilidad al origen | N/A | N/A | N/A | N/A | **`source_row_ref` a la fila del Excel** |

**Lectura estratégica:** el mercado está partido en dos. Las FSM (Salesforce, Dynamics, Jobber, Housecall Pro) hacen el *service report firmado* pero no el control de días vendidos por proyecto. Las PSA (Replicon, BigTime, Kantata) hacen el timesheet y el budget-vs-actual pero no producen un documento contractual firmado por el cliente final. **FAVA necesita exactamente el cruce, y comprar cualquiera de los dos obliga a mantener el otro a mano — que es el problema que tienen hoy.** Eso justifica construir.

---

## Confianza por área

| Área | Nivel | Razón |
|---|---|---|
| Flujo de aprobación / bloqueo / reopen | **MEDIA-ALTA** | Patrón consistente en 6+ productos (Replicon, BigTime, ClickTime, Connecteam, QuickBooks Time, Hubstaff); documentación de vendor, no norma |
| Offline / sync | **ALTA** | Microsoft Learn oficial (actualizado 2026-07-22): conflictos a nivel de tabla, "cliente gana" por defecto, comportamiento de eliminación de datos documentado |
| Firma — marco legal CO | **MEDIA-ALTA** | Ley 527/1999 y Decreto 2364/2012 confirmados en fuente oficial (Función Pública) + 3 proveedores coincidentes. **No es asesoría legal** |
| Firma — marco legal UE | **ALTA** | Texto de eIDAS Art. 25(1) citado literalmente |
| Firma — suficiencia del expediente de evidencias | **MEDIA** | Consenso de proveedores de e-signature (fuentes comerciales); no verificado contra jurisprudencia colombiana |
| Zonas horarias | **MEDIA** | Documentación de ayuda de Jibble/ClockShark/Factorial + práctica estándar de ingeniería; sin fuente normativa |
| Timesheets multi-proyecto | **MEDIA** | Docs de Replicon/BigTime; el modelo FAVA (día atómico) no tiene análogo directo en el mercado — la recomendación es derivada, no observada |
| Notificaciones | **MEDIA** | Docs de ayuda de ClickTime/Kantata/Clockify coincidentes |
| Baja de empleado con pendientes | **MEDIA** | Oracle HCM (doc oficial) + Employment Hero; la mejora propuesta ("aprobar en nombre de") es recomendación propia, no práctica observada |
| Categorías "Sin Proyecto" | **MEDIA** | Consenso de blogs de vendors (Everhour, Hubstaff, Clockify, NetSuite) |
| KPIs de servicios profesionales | **MEDIA** | Múltiples fuentes coincidentes en utilización/margen/budget burn; sin benchmark específico de instalación industrial |

---

## Preguntas abiertas para FAVA

1. **Utilización:** ¿LR / NR / IL entran en el denominador de días disponibles? (define si el KPI es creíble)
2. **PDF multi-proyecto:** ¿la nota del proyecto A muestra las 7 filas de la semana con los días de B en blanco, o solo sus propios días?
3. **Medio día (`MD`):** ¿puede repartirse entre dos proyectos el mismo día? (si sí, cambia `UNIQUE(técnico, fecha)`)
4. **Firma ausente:** ¿se puede aprobar una nota sin firma del cliente, marcada como tal? ¿O bloquea?
5. **Texto de la declaración de conformidad:** ¿el literal actual del Word es el aprobado por legal, o hay que ajustarlo para firma electrónica?
6. **Retención:** ¿cuántos años deben conservarse los PDFs firmados? (define política de storage)
7. **Interno vs. externo** por técnico (define si aplica `LR` o `NR`) — ya listado como pendiente en CONTEXTO §8
8. **Migración:** ¿los técnicos históricos que ya no trabajan en FAVA se cargan igual? (asumido que sí, sin cuenta Entra)

---

## Sources

**Flujos de aprobación y bloqueo (MEDIA)**
- https://livetecs.com/blog/timesheet-approval-process-best-practices-for-teams/
- https://www.shiftbase.com/glossary/timesheet-approval
- https://apspayroll.com/blog/employee-time-tracking-best-practices/
- https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-timesheets/approve-unapprove-reject-timesheets-quickbooks/L3fq6c1oN_US_en_US
- https://support.hubstaff.com/locked-time-in-hubstaff/
- https://help.connecteam.com/en/articles/5439640-approving-employee-timesheets-for-payroll
- https://www.timetrex.com/blog/timesheet-app-employees-approvals

**Offline / sincronización (ALTA — doc oficial)**
- https://learn.microsoft.com/en-us/dynamics365/field-service/mobile/offline-data-sync (act. 2026-07-22)
- https://developer.salesforce.com/docs/atlas.en-us.field_service_dev.meta/field_service_dev/sforce_api_objects_digitalsignature.htm
- https://www.salesforce.com/service/field-service-management/guide/
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation
- https://oxmaint.com/article/mobile-work-order-management-for-offline-field-technicians

**Firma electrónica — legal (MEDIA-ALTA)**
- https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276 (Ley 527 de 1999)
- https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=50583 (Decreto 2364 de 2012)
- https://www.viafirma.com.co/blog/decreto-2364-sobre-firma-electronica/
- https://www.webdoxclm.com/blog/electronic-signature-colombia (validez equivalente a manuscrita)
- https://www.legislation.gov.uk/eur/2014/910/article/25 (eIDAS Art. 25 — texto)
- https://www.viafirma.com/en/eidas-regulation/

**Expediente de evidencias de firma (MEDIA — fuentes comerciales)**
- https://formfy.ai/compliance/audit-trail-e-signature
- https://www.esignly.com/electronic-signature/the-anatomy-of-a-legally-defensible-technically-robust-esignature-audit-trail.html
- https://www.docupilot.com/blog/electronic-signature-audit-trail

**Zonas horarias (MEDIA)**
- https://www.jibble.io/help/timesheet-timezone
- https://help.clockshark.com/how-to-use-the-multi-time-zone-feature
- https://help.factorialhr.com/en_US/time-tracking/clocking-in-from-a-different-time-zone

**Timesheets multi-proyecto (MEDIA)**
- https://www.replicon.com/help/setting-up-time-entry-formats-in-timesheet-templates/
- https://www.replicon.com/help/entering-time-in-a-timesheet/
- https://www.bigtime.net/blogs/best-time-tracking-software/

**Notificaciones (MEDIA)**
- https://support.clicktime.com/hc/en-us/articles/40024789744141-Time-Entry-Timesheet-Notifications-Emails-Reminders-Approval-Inbox
- https://knowledge.kantata.com/hc/en-us/articles/360000070853-Notification-Settings
- https://clockify.me/help/track-time-and-expenses/notifications-in-clockify
- https://www.clicktime.com/blog/how-to-get-employees-to-complete-timesheets
- https://www.meistertask.com/blog/notification-fatigue-the-productivity-killer-explained

**Baja de empleado con pendientes (MEDIA)**
- https://docs.oracle.com/en/cloud/saas/human-resources/24d/faitl/time-configuration-when-terminate-today-is-on-an-earlier-date.html
- https://help.employmenthero.com/hc/en-au/articles/10563635739407-Approve-decline-and-edit-my-employees-timesheets-as-a-manager

**Categorías no facturables / "Sin Proyecto" (MEDIA)**
- https://everhour.com/time-tracking/track-non-billable-time
- https://clockify.me/blog/business/billable-and-non-billable-hours/
- https://www.brokenrubik.com/blog/netsuite-time-tracking-guide

**KPIs de servicios profesionales (MEDIA)**
- https://www.rocketlane.com/blogs/professional-services-kpis
- https://productive.io/blog/professional-services-kpis/
- https://johnnygrow.com/proserv/professional-services-dashboard/

**Fuentes internas del proyecto**
- `.planning/PROJECT.md`
- `CONTEXTO-PROYECTO-FAVA.md` (§3 catálogo de conceptos, §4 formato del PDF, §5 calidad de datos, §6 matriz de permisos, §7 decisiones confirmadas, §10 esquema, §11 endpoints, §15 fases)

---
*Feature research for: field service / control técnico de instalación industrial (FAVA Latino America)*
*Researched: 2026-07-25*
