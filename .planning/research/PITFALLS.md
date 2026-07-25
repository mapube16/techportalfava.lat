# Pitfalls Research

**Domain:** Backend de control de jornada / hoja de tiempo con aprobación, PDF firmado y migración de histórico (NestJS + Prisma + Postgres RLS + Entra ID + Railway)
**Researched:** 2026-07-25
**Confidence:** HIGH en auth, RLS, SSE/Railway y transacciones (fuentes oficiales). MEDIUM en PDF/firma y migración (documentación de ecosistema + análisis del Excel real). LOW en nada crítico.

> Nota de convención: encabezados en inglés (estructura de plantilla GSD), contenido en español — igual que `PROJECT.md`.

---

## Critical Pitfalls

### Pitfall 1: RLS activado que no protege absolutamente nada (el usuario de la app es dueño de las tablas)

**What goes wrong:**
Se escriben las políticas, se hace `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, se prueba en dev y "funciona"… pero el backend se conecta con el mismo rol que creó las tablas. En Postgres el **dueño de la tabla ignora las políticas por defecto**. Resultado: RLS está "activo" en el `\d` de la tabla y en el código, y el técnico sigue pudiendo leer las filas de todos si hay un bug de RBAC. La segunda capa de defensa que promete CONTEXTO §12 no existe.

**Why it happens:**
Documentación oficial de Postgres: *"Superusers and roles with the BYPASSRLS attribute always bypass the row security system when accessing a table. Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with ALTER TABLE ... FORCE ROW LEVEL SECURITY."* Railway entrega un Postgres con un único usuario (`postgres`) que es superusuario y dueño de todo, y esa es la `DATABASE_URL` que uno pega en el servicio. Prisma además **necesita** privilegios de DDL para `migrate deploy`, lo que empuja a usar el usuario dueño en runtime.

**How to avoid:**
1. Dos roles desde el día 1: `fava_migrator` (dueño, corre `prisma migrate deploy`) y `fava_app` (runtime, sin DDL, sin `BYPASSRLS`, no dueño). Dos URLs: `MIGRATE_DATABASE_URL` y `DATABASE_URL`.
2. `ALTER TABLE x FORCE ROW LEVEL SECURITY` en TODAS las tablas con datos de técnico, aunque el runtime ya no sea dueño (cinturón y tirantes; protege el día que alguien "arregla" un permiso).
3. Las políticas y los `GRANT` van en **migraciones SQL versionadas** (`prisma migrate dev --create-only` + editar el `.sql`). Prisma no genera ni conserva políticas; una migración futura que recree una tabla se lleva las políticas por delante.
4. Test de integración obligatorio: conectarse como `fava_app` con `app.current_technician_id` de A y hacer `SELECT count(*) FROM daily_entries` esperando exactamente las filas de A. Si el conteo es el total, RLS no está protegiendo.

**Warning signs:**
- La `DATABASE_URL` de producción empieza por `postgresql://postgres:...`.
- `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='daily_entries'` devuelve `t, f`.
- No hay ni un solo test que se conecte con el rol de runtime.
- Nadie sabe responder "¿qué rol de BD usa el backend en prod?".

**Phase to address:** F1 — Fundación de datos (schema + Prisma + RLS). Verificación repetida en F8 (deploy/hardening).

---

### Pitfall 2: La variable de sesión de RLS se filtra entre peticiones (pooling) o revienta el pool

**What goes wrong:**
Dos fallos opuestos y ambos graves:
- **Fuga:** el middleware hace `SET app.current_technician_id = '...'` (sin `LOCAL`) sobre una conexión del pool. La conexión vuelve al pool con la variable puesta y **la siguiente petición, de otro técnico, hereda el contexto anterior**. Intermitente, invisible en dev (1 usuario), catastrófico en prod: Iván ve los días de Leomar.
- **Sobrecorrección:** para evitar lo anterior se envuelve toda la petición en `prisma.$transaction(async tx => ...)`. Como Prisma tiene `timeout: 5000ms` y `maxWait: 2000ms` por defecto, cualquier request lento (generar PDF, migrar, exportar) muere con `P2028 Transaction already closed`; y como cada request retiene una conexión durante toda su vida, el pool (chico por defecto) se agota con 15 técnicos guardando a la vez.

**Why it happens:**
`SET` sin `LOCAL` es *session-scoped* y sobrevive al `release()` del pool. La receta correcta y oficialmente documentada por Prisma (repo `prisma-client-extensions/row-level-security`) es `set_config(clave, valor, true)` — el tercer parámetro `is_local = true` ata el valor a la transacción — **dentro** de una transacción, para que todas las queries del request usen la misma conexión.

**How to avoid:**
- Usar `set_config('app.current_technician_id', $1, true)` (LOCAL). Nunca `SET` pelado. Nunca `SET SESSION`.
- Scope de la transacción = **la operación de dominio**, no el request HTTP completo. Un `TransactionalPrismaService` (`@nestjs-cls/transactional` o un `AsyncLocalStorage` propio) que abre transacción por caso de uso.
- Todo lo lento (render de PDF, llamadas HTTP, escritura a storage) **fuera** de la transacción: leer datos en tx corta → cerrar → renderizar → abrir tx corta para persistir la URL.
- Fijar explícitamente `connection_limit` en la URL y `timeout`/`maxWait` en `$transaction`; no confiar en defaults.
- Test de fuga: 2 peticiones concurrentes de técnicos distintos en bucle (200 iteraciones) verificando que ninguna ve filas de la otra.

**Warning signs:**
- Reportes de "vi datos de otro técnico" que no se reproducen.
- `P2028` o `Timed out fetching a new connection from the connection pool` en logs.
- El middleware de RLS usa `$executeRawUnsafe('SET ...')`.
- El PDF se genera dentro de un `$transaction`.

**Phase to address:** F1 — Fundación (patrón de acceso a datos). El test de fuga es criterio de salida de F1.

---

### Pitfall 3: Validación de token Entra ID hecha "a ojo" (confused deputy)

**What goes wrong:**
Varias formas de romperlo, todas frecuentes:
- Aceptar cualquier token firmado por Microsoft sin comparar `aud` con el App ID URI propio → **cualquier app del tenant (o de otro tenant) puede llamar al API con un token que le dieron para otra cosa**. Es el patrón *confused deputy*; la doc oficial lo nombra explícitamente.
- Intentar validar el token que el frontend obtuvo para **Microsoft Graph**. La doc es tajante: *"you can't validate tokens for Microsoft Graph according to these rules due to their proprietary format."* Falla la firma y se termina "arreglando" con `ignoreExpiration` o deshabilitando la verificación.
- Mezclar metadata v1/v2: token con `ver: "1.0"` (`iss = https://sts.windows.net/{tid}/`) validado contra el JWKS/issuer de `/v2.0` (`iss = https://login.microsoftonline.com/{tid}/v2.0`) → "invalid signature"/"invalid issuer" fantasma.
- Usar `passport-azure-ad`: **deprecado desde agosto 2023**, sin reemplazo oficial de Microsoft para Node.
- Identificar al usuario por `email`/`preferred_username` en vez de `oid`. Los correos se reasignan y se renombran; el `oid` (con `tid`) es el identificador estable. El esquema ya tiene `users.entra_oid` — hay que usarlo como clave real.
- Confiar en el claim `groups` para el rol. Con >200 grupos Entra **omite el claim** y manda `_claim_names`/`_claim_sources`; la app "pierde" a un admin sin explicación.

**Why it happens:**
Los tutoriales de blog resuelven "login" (frontend MSAL) y no "protección de API". El backend recibe un JWT que parece válido y se da por bueno.

**How to avoid:**
- `@nestjs/passport` + `passport-jwt` + `jwks-rsa` (o `jose` con `createRemoteJWKSet`), no `passport-azure-ad`.
- Registrar **dos** apps en Entra: SPA (frontend) y API (backend, con `Expose an API` + scope `access_as_user`). El frontend pide token para el scope del API, **no** para Graph.
- Validar en este orden y sin excepciones: firma (JWKS por `kid`, cache 24h con rotación) → `iss` exacto según `ver` del token → `tid` == tenant configurado → `aud` == client id / App ID URI del API → `exp`/`nbf` con clock skew ≤60s → `scp` (delegado) o `roles` (app) presente.
- Elegir `requestedAccessTokenVersion: 2` en el manifiesto del API y validar contra la metadata v2. Un único formato = una sola ruta de código.
- **Roles de la app en la BD** (`users.role`), no en Entra. Entra dice *quién eres*; la BD dice *qué puedes*. Elimina el problema de overage y hace el ABM de roles autoservicio (que es lo que pide la matriz de permisos §6, incluido "S asigna admin").
- El swap tenant dev → tenant FAVA debe ser 3 env vars (`ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_API_AUDIENCE`) validadas con zod al arrancar. Cero constantes hardcodeadas, cero `issuer` construido a mano en dos sitios distintos.

**Warning signs:**
- En el código aparece `ignoreExpiration`, `algorithms: ['none']`, `audience` comentado o `issuer: undefined`.
- El frontend pide scope `User.Read` para hablar con el propio backend.
- El JWT que llega tiene `aud: "00000003-0000-0000-c000-000000000000"` (eso es Graph).
- Hay un `if (email === '...')` para decidir permisos.

**Phase to address:** F1 — Autenticación Entra ID. El "swap por env var" se prueba de verdad en F8 con un segundo tenant o al menos con config apuntando a otro `tid`.

---

### Pitfall 4: Corrimiento de un día — el clásico que rompe una app de "una fila por día"

**What goes wrong:**
El técnico registra el **martes 14** y la app muestra **lunes 13**; la Nota Semanal sale con un día menos; el KPI mensual mueve días del 31 al mes siguiente; y peor: `UNIQUE(technician_id, date)` deja de proteger porque `2026-07-14T00:00:00Z` y `2026-07-14T05:00:00Z` son valores distintos → **dos filas para el mismo día**, que es exactamente la regla de negocio núcleo.

**Why it happens:**
Prisma convierte todo `DateTime` a UTC y lo devuelve como `Date` de JS; hay hilos abiertos en el repo de Prisma sobre fechas que retroceden un día. Aquí el riesgo es doble porque el negocio es intrínsecamente multi-huso: Bogotá (UTC-5), Italia (UTC+1/+2), y técnicos trabajando en RD, Chile, Brasil, USA, Grecia, Turquía. "Hoy" no es una sola cosa.

**How to avoid:**
- `date` en `daily_entries` es un **día calendario, no un instante**: `@db.Date` en Prisma y tratarlo como `string 'YYYY-MM-DD'` de punta a punta (DTO, API, frontend). Nunca `new Date(fecha)` en el servidor.
- Prohibido `new Date()` para "hoy" en el backend. El día de trabajo lo declara el cliente (el técnico), o se calcula con una zona explícita (`America/Bogota` como default de la empresa, configurable por técnico si aparece el caso).
- Semana ISO (lunes-domingo) calculada sobre la cadena de fecha, no sobre timestamps. Es la unidad de la Nota Semanal; un error de límite mueve un día de una nota a otra.
- `created_at`/`updated_at`/`signed_at`/`approved_at` sí son instantes: `timestamptz`. Distinguir los dos tipos conscientemente en el schema.
- Test que corra la suite con `TZ=Pacific/Kiritimati` (UTC+14) y `TZ=Pacific/Midway` (UTC-11). Si algo se rompe, hay un bug de fecha esperando en producción.

**Warning signs:**
- El schema tiene `date DateTime` sin `@db.Date`.
- Aparece `.toISOString().split('T')[0]` en cualquier parte.
- El navegador y el servidor muestran días distintos para el mismo registro.
- La UNIQUE nunca ha disparado un conflicto en pruebas de doble guardado.

**Phase to address:** F1 (tipo en el schema) + F3 (bitácora diaria). El test multi-TZ pertenece a F3.

---

### Pitfall 5: Race conditions de aprobación y registros "bloqueados" que en realidad no lo están

**What goes wrong:**
- Dos admins abren la misma nota, ambos aprueban: doble escritura en `audit_log`, doble notificación, o peor, uno aprueba mientras el otro devuelve → estado final aleatorio.
- El técnico tiene la pantalla abierta, envía la semana, y en otra pestaña sigue editando un día. La UI oculta el botón pero el `PATCH /api/daily-entries/:id` sigue vivo → se modifica un día que ya está dentro de una nota aprobada. Los KPIs y la Nota firmada dejan de coincidir con la BD.
- "Aprobar" implementado como `update({ where: { id }, data: { status: 'approved' } })` tras un `findUnique` que verificó el estado: entre el read y el write cabe cualquier cosa.

**Why it happens:**
El bloqueo se implementa en la UI (deshabilitar botón) y en un `if` de servicio leído-y-luego-escrito. Nadie modela la transición como *compare-and-set*.

**How to avoid:**
- Transición = **update condicional**, nunca read-then-write:
  `updateMany({ where: { id, status: 'submitted' }, data: { status: 'approved', ... } })` y verificar `count === 1`; si es 0 → `409 Conflict` con "la nota ya fue procesada por otro usuario". (En Postgres el predicado completo sí viaja al `UPDATE`; el bug de predicados recortados reportado en Prisma es de MySQL — verificar igual con un test.)
- El bloqueo por estado se aplica en **una sola función de escritura** compartida por todos los endpoints de `daily_entries` (guard de dominio: "solo `draft` es editable"), no repetido en cada handler. Root cause, no síntoma.
- Segunda red: `CHECK`/trigger en Postgres que rechace `UPDATE` de campos de negocio en `daily_entries` cuando `status <> 'draft'`. Barato y cierra la puerta a cualquier ruta de código futura (incluida la migración y los scripts manuales).
- La corrección post-aprobación (edge case ya identificado en PROJECT.md) es un **flujo explícito**: `reopen` con motivo obligatorio, que devuelve a `draft`, invalida el PDF firmado y exige re-firma. No un `UPDATE` silencioso. Es la práctica estándar del dominio: aprobado ⇒ bloqueado; corregir ⇒ reabrir, corregir, re-aprobar, todo en auditoría.
- Constraint parcial en BD para el otro invariante del dominio: un técnico no puede tener dos notas de la misma semana en el mismo proyecto y estado activo.

**Warning signs:**
- Aparece `findUnique` seguido de `update` en un servicio de transición.
- El único control de "no editable" está en el componente React.
- No hay ninguna respuesta 409 en la especificación del API.

**Phase to address:** F4 — Nota Semanal + flujo de aprobación. El guard de escritura de `daily_entries` en F3.

---

### Pitfall 6: Migración del histórico sin reconciliación ni idempotencia (la que arruina la confianza del cliente)

**What goes wrong:**
El script corre, "no dio error", y meses después FAVA descubre que faltan 300 días de 2025 o que Leomar tiene el doble de días. Como la migración no es re-ejecutable, el segundo intento duplica todo. Como no hay trazabilidad fila-Excel → fila-BD, no se puede auditar ninguna diferencia. Los KPIs de vendido/ejecutado (el entregable comercial) quedan desacreditados y nadie vuelve a creerles.

**Why it happens:**
La migración se trata como un script de una sola vez, no como un entregable con criterio de aceptación. Y los datos reales están sucios de formas ya documentadas en CONTEXTO §5: 3 grafías del mismo técnico, 11 variantes de rol, proyectos duplicados entre años, `LR` asignado a 2 conceptos, `NR` que aparece en 2025, máquinas en texto libre con separadores mixtos, ~1.009 filas de 2026 sin concepto, y deltas calculados a mano **con errores aritméticos visibles**.

**How to avoid:**
- **El reporte de conciliación es el entregable, no el script.** Excel vs. app, por año × técnico × concepto × proyecto, con las tres columnas: `origen`, `migrado`, `delta`, más una lista explícita de filas descartadas con motivo. FAVA firma esa hoja.
- Migración **idempotente**: `source_year`, `source_sheet`, `source_row` guardados en cada fila (o un hash natural técnico+fecha) + `ON CONFLICT DO NOTHING/UPDATE`. Poder correrla 5 veces y obtener el mismo resultado.
- Los mapas de limpieza (alias de técnico, roles, proyectos, conceptos) son **archivos de datos versionados** (CSV/JSON en el repo), no `if` dentro del código. FAVA los revisa y los corrige sin tocar código; cada corrección deja diff en git.
- Nada se inventa: fila que no mapea a un catálogo → tabla de cuarentena `migration_rejects` con el motivo, no un valor por defecto. Un "Sin Proyecto" silencioso contamina los KPIs comerciales.
- **Los deltas del Excel no son la verdad de referencia.** Se recalculan; cuando el sistema y el Excel discrepan, se documenta la discrepancia como hallazgo (probablemente es un error aritmético del Excel) en lugar de "cuadrar" hacia el valor viejo.
- Las ~1.009 filas de 2026 sin concepto **no se migran** (son fechas futuras precargadas) y eso se dice explícitamente en el reporte, con el conteo, para que nadie lo lea como pérdida de datos.
- Migrar a producción con el mismo script que se probó, ejecutado como job, con la BD respaldada justo antes y un `rollback` probado (borrar por `source_*`).

**Warning signs:**
- La palabra "conciliación" no aparece en el plan de la fase.
- El script usa `create` en vez de `upsert`.
- Los mapas de alias están hardcodeados en TypeScript.
- No hay conteo de filas rechazadas.

**Phase to address:** F6 — Migración del histórico. Pero el **esquema de trazabilidad** (`source_*`) se decide en F1; añadirlo después obliga a migrar dos veces.

---

### Pitfall 7: Leer el `.xls` viejo mal (BIFF, acentos, celdas combinadas, seriales de fecha)

**What goes wrong:**
`Andrea Scapin` llega como `Andrea Scapín`/`AndrÃ©a`; `Cibao -Rep D` con un espacio invisible se convierte en un proyecto distinto; las fechas se corren un día por el bug del año bisiesto 1900 de Excel (todo lo posterior al 28-feb-1900 tiene el serial desplazado); las celdas combinadas de las hojas de proyecto devuelven `null` en todas menos la superior-izquierda y el parser "pierde" el encabezado de bloque; los meses y días de semana en italiano (`Giorno`) no matchean ningún catálogo.

**Why it happens:**
`.xls` es OLE2/BIFF, no XML. En BIFF5 el encoding depende del record `CodePage`, que puede faltar. Y el histórico son **7.589 filas** capturadas a mano durante 2 años por gente distinta.

**How to avoid:**
- Extraer **una sola vez** el `.xls` a CSV/JSON crudo con la herramienta ya validada en este proyecto (Python + `xlrd`, ver CONTEXTO §17) y versionar ese extracto. La cadena de migración trabaja sobre el extracto, no sobre el binario. Reproducible y diffeable.
- Fechas: no leer el serial de Excel; usar los campos `Año`/`Mes`/`Día` que ya existen en las hojas núcleo, y componer `YYYY-MM-DD` como texto. Esquiva el bug de 1900 y el problema de husos de un plumazo.
- Normalización obligatoria de todo texto antes de comparar: `trim` → colapsar espacios → NFC → `casefold`. Los duplicados de técnico y proyecto se caen solos con eso + el mapa de alias.
- Celdas combinadas: propagar hacia abajo/derecha el valor de la celda ancla (forward-fill) explícitamente, con un test sobre una hoja de proyecto real.
- Validar el extracto contra el análisis ya hecho: 2.844 filas en `2025`, 4.745 en `2026`. Si el conteo no cuadra, el parser está mal antes de mirar nada más.

**Warning signs:**
- Caracteres `Ã`, `Â`, `�` en cualquier salida.
- El maestro de proyectos tiene más entradas de las esperadas tras la normalización.
- Aparecen fechas de 1899/1900.

**Phase to address:** F6 — Migración. Extracto crudo puede hacerse ya en F0/F1 (es barato y desbloquea el diseño de catálogos).

---

### Pitfall 8: La Nota Semanal se "genera" pero no es un documento — se regenera y ya no es el que firmaron

**What goes wrong:**
`GET /api/weekly-notes/:id/pdf` renderiza el PDF sobre la marcha desde la BD. Meses después alguien corrige un día, o cambia la plantilla, o se renombra un proyecto: **el PDF que descarga el cliente ya no es el que firmó**. La declaración de conformidad y la firma quedan sobre un documento distinto. En un flujo donde el cliente final de FAVA acepta la nota, eso es exactamente el fallo que no se puede tener.

**Why it happens:**
Renderizar bajo demanda es más simple y en dev nunca hay divergencia porque los datos no cambian.

**How to avoid:**
- Antes de firmar: **congelar**. En el momento de la firma se renderiza el PDF definitivo, se calcula su `SHA-256`, y se guardan bytes + hash + snapshot JSON de los datos que lo produjeron. `pdf_url` apunta al artefacto inmutable en storage privado con signed URL corta (ya previsto en CONTEXTO §12).
- El endpoint de PDF sirve el artefacto guardado; solo renderiza si aún no está firmado (preview con marca de agua "BORRADOR").
- Reabrir una nota firmada ⇒ nueva versión (`version`, `superseded_by`), nunca sobrescribir el archivo anterior. El histórico de PDFs es evidencia.
- Fuentes embebidas y probadas con acentos ES/IT (`á é í ó ú ñ ü à è ì ò ù`) y con el logo oficial. Un PDF con `?` en lugar de tildes ante un cliente en Italia es un problema comercial, no estético.
- Fidelidad: la plantilla se valida **superponiendo** el render contra el `Reporte 02 - Ivan Cortés .pdf` real, campo por campo — NIT, localidad, suministro, contrato, cargo de la semana (varía por semana, hallazgo 2026-07-25), 7 filas de día, columna NOTA (= n° contrato), gastos, anticipo del cliente, declaración de conformidad, doble firma + fecha/timbre. Checklist firmado, no "se ve parecido".

**Warning signs:**
- No existe columna `pdf_hash` ni snapshot.
- El PDF se regenera en cada descarga.
- La plantilla se probó solo con datos de ejemplo en inglés.

**Phase to address:** F4 — Nota Semanal + PDF + firma.

---

### Pitfall 9: La firma digital sin valor probatorio (un PNG en una columna)

**What goes wrong:**
Se guarda el dataURL del canvas en `weekly_notes.client_signature` y listo. Cuando un cliente discute una nota, no hay forma de demostrar **qué** se firmó, **quién** lo firmó, **cuándo** ni **desde dónde**; y el propio registro es editable por la app. Además el base64 (~50-200 KB) infla cada fila y arrastra las queries de listado que hacen `SELECT *`.

**Why it happens:**
El frontend ya tiene el canvas funcionando (existe en el mock) y parece que el trabajo está hecho.

**How to avoid:**
- El registro de firma es un **evento inmutable**, no un campo: `signature_events(weekly_note_id, signer_name, signer_role, signature_image_ref, document_hash_before, document_hash_after, server_timestamp, ip, user_agent, actor_user_id)`. Append-only, sin `UPDATE`/`DELETE` para el rol de la app.
- **Timestamp del servidor**, nunca el reloj del dispositivo del técnico.
- La imagen va a storage privado; en la BD solo la referencia.
- Hash del documento antes y después de firmar: es lo que convierte el conjunto en evidencia (cadena de manipulación detectable).
- El audit trail viaja **con** el documento: página de evidencia anexa al PDF final (firmante, fecha/hora, IP, hash). Si la evidencia vive solo en una tabla que hay que consultar, en la práctica no existe cuando se necesita.
- Dos firmas distintas (técnico y cliente) con campos propios; la del cliente además captura el nombre/cargo digitado, que es lo que da sentido a la declaración de conformidad.

**Warning signs:**
- `client_signature` es `text` con un `data:image/png;base64,...`.
- No se guarda IP ni user agent.
- Se puede hacer `UPDATE` sobre la firma desde el rol de la app.

**Phase to address:** F4 — firma digital.

---

### Pitfall 10: SSE que funciona en local y muere en Railway

**What goes wrong:**
La bandeja "en tiempo real" deja de actualizarse a los pocos minutos y nadie lo nota hasta que un admin jura que aprobó algo que el técnico no vio. Varias causas simultáneas:
- **Railway corta el stream:** la doc de Railway es explícita — SSE aguanta *hasta 15 minutos con heartbeats*, y se **cierra a los 5 minutos sin datos transferidos**. Un stream silencioso durante la tarde tranquila se cae. Además hay reportes recurrentes de la comunidad sobre el edge matando conexiones largas.
- **`EventSource` del navegador no admite cabeceras**: no se le puede poner `Authorization: Bearer`. Se termina metiendo el token en la query string (queda en logs/proxies) o desactivando auth en ese endpoint.
- **Buffering/compresión**: un proxy o el middleware `compression` de Express bufferiza y los eventos llegan en ráfagas.
- **Multi-réplica**: el `EventEmitter` en memoria de NestJS solo notifica a los clientes conectados a *esa* instancia. Con 2 réplicas, la mitad de los usuarios no se entera.
- **Conexiones de BD retenidas**: cada stream abierto se queda con una conexión Prisma → 20 técnicos con la app abierta agotan el pool y la app entera se cae. Ironía: el "tiempo real" tumba la funcionalidad crítica.

**How to avoid:**
- Heartbeat (`: ping\n\n`) cada 20-30 s + `retry:` en el stream, y **cliente que reconecta antes del cap de 15 min** (cierre y reapertura programada). Con `Last-Event-ID` para no perder eventos en la reconexión.
- `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`, y excluir la ruta SSE del middleware de compresión.
- Auth: usar `@microsoft/fetch-event-source` (fetch con cabeceras) en el frontend, o un token de stream de un solo uso y corta vida obtenido por POST autenticado. Nunca el access token en la query string.
- **Una sola réplica** mientras SSE sea in-memory, y decirlo en el README. Es la opción perezosa correcta para ~50 usuarios; escalar a Postgres `LISTEN/NOTIFY` o Redis solo si algún día hacen falta réplicas.
- El handler SSE **no** retiene conexión de BD: emite payloads mínimos (`{tipo, id}`) y el frontend refetchea. Esto además resuelve autorización (el refetch pasa por RBAC+RLS) sin filtrar datos por el canal de eventos.
- Degradación honesta: si el stream cae, refetch por polling cada N segundos. El usuario nunca debe quedarse mirando datos viejos creyendo que están frescos.

**Warning signs:**
- Funciona en `localhost` y "a veces" en Railway.
- La URL del stream lleva `?token=`.
- Los eventos llevan el objeto completo del `daily_entry`.
- `replicas > 1` en la config del servicio.

**Phase to address:** F7 — Tiempo real (SSE) + conexión del frontend. Validación real en el entorno de Railway, no en local.

---

### Pitfall 11: El plan de seguridad está escrito para Azure y el deploy es Railway

**What goes wrong:**
CONTEXTO §12 promete Azure Key Vault / Managed Identity, VNet con la BD no expuesta a internet, TDE y backups con PITR. La decisión del 2026-07-25 movió el hosting a **Railway**. Si nadie reconcilia esas dos páginas, se despliega creyendo que hay controles que no existen: BD con URL pública, secretos en variables planas, y "backups" que nadie verificó. Con 50 personas dependiendo de la app y el histórico de 2 años dentro, la pérdida de datos es el riesgo existencial del proyecto.

**How to avoid:**
- Reescribir §12 como **matriz de controles por entorno**: qué se cumple en Railway, cómo, y qué queda como riesgo aceptado y firmado.
- Backend ↔ Postgres por la **red privada de Railway** (`*.railway.internal`), nunca por la URL pública `TCP proxy`. La URL pública solo para migraciones puntuales desde la máquina del dev, y con IP/rotación controlada.
- Backups: Railway ofrece PITR con retención ~4 semanas (backup completo semanal + incrementales diarios, restauración a un servicio nuevo). Hay que **activarlo, entenderlo y ensayar una restauración completa antes del go-live**. Un backup no verificado no es un backup. Añadir `pg_dump` a almacenamiento externo si el histórico migrado se considera irrepetible (lo es: reconstruirlo cuesta la fase F6 entera).
- Secretos: variables de Railway (shared variables por entorno) + validación zod al arranque que **falle el boot** si falta alguna. Cero `.env` en el repo, cero defaults silenciosos.
- Railway **bloquea SMTP saliente** (ya sabido en este stack): cualquier email de notificación va por API (Resend). No planificar SMTP.
- Con la BD potencialmente alcanzable, RLS (Pitfall 1) deja de ser "defensa en profundidad" y pasa a ser control primario. Suben su prioridad y su cobertura de tests.

**Warning signs:**
- El documento de requisitos sigue diciendo "Key Vault".
- Nadie ha restaurado nunca un backup.
- La `DATABASE_URL` del servicio backend contiene un hostname público.

**Phase to address:** F8 — Deploy Railway + hardening. Pero la decisión de red y roles de BD condiciona F1.

---

### Pitfall 12: KPIs que cambian solos (agregar sobre datos no aprobados / medias jornadas / dimensiones asimétricas)

**What goes wrong:**
Los tableros suman todos los `daily_entries` sin filtrar por `status`, así que las cifras bailan cada vez que alguien guarda un borrador — justo lo contrario de lo que confirmó el cliente ("el Administrador valida antes de que el dato cuente para KPIs"). Además `MD` (medio día) se cuenta como 1 y el ejecutado sale inflado; y el vendido está abierto por **rol × fase** mientras el ejecutado se agrupa solo por proyecto, con lo que el delta no cuadra nunca y el reporte comercial pierde credibilidad ante la matriz italiana.

**How to avoid:**
- Una única definición de "día ejecutado" en **una sola función/vista SQL** que ya incluya el filtro de estado y el peso por concepto (`MD` = 0.5; `LR`/`NR`/`IL` cuentan como asistencia pero **no** como ejecutado facturable — regla a confirmar explícitamente con FAVA, no a asumir). Todos los tableros consumen esa vista.
- Ejecutado agregado por las **mismas dimensiones** que el vendido (proyecto × rol × fase). Si el `daily_entry` no captura la fase, el delta por fase es imposible: hay que decidirlo en el modelo, no en el dashboard.
- Los agregados por mes/semana se calculan sobre `date` (día calendario), no sobre `created_at`.
- Mostrar en el tablero el corte: "incluye solo registros aprobados · X días pendientes de aprobación". La cifra pendiente es en sí un KPI útil y evita la pregunta "¿por qué no cuadra con mi Excel?".

**Warning signs:**
- La query de KPIs no menciona `status`.
- `count(*)` en lugar de `sum(peso)`.
- El delta vendido/ejecutado no cuadra ni con datos de prueba controlados.

**Phase to address:** F5 — KPIs. La dimensión `fase` en `daily_entries` se decide en F1.

---

### Pitfall 13: Los edge cases de negocio tratados como "detalles de después"

**What goes wrong:**
PROJECT.md ya los lista, y cada uno rompe una suposición estructural:
- **Técnico con 2 proyectos en la misma semana:** la Nota Semanal es *por proyecto* pero `daily_entries` es *por técnico+fecha*. Una semana genera **dos notas con subconjuntos de días**. Si el generador asume "7 filas = 7 días de la semana", produce notas incorrectas o duplica días. Hay que decidir si un día puede repartirse entre proyectos (probablemente no: `UNIQUE(técnico, fecha)` lo prohíbe) y qué se imprime en las filas de días de otro proyecto.
- **Baja de técnico con notas pendientes:** `is_active = false` no puede borrar ni ocultar el histórico. Si la política RLS filtra por técnico activo, los KPIs históricos se vacían. Baja = pierde acceso, conserva datos; y las notas pendientes necesitan una ruta de cierre administrativo.
- **Concepto "Sin Proyecto":** un proyecto centinela real con id fijo, no `project_id = NULL` disperso por la app. Con NULL, cada `JOIN` y cada KPI necesita su `COALESCE` y alguno se olvidará.
- **Corrección post-aprobación:** ver Pitfall 5.

**How to avoid:** Cada edge case es un caso de prueba con nombre en la fase que le corresponde, y se decide **antes** de escribir el generador de notas. Preguntar a FAVA los dos que aún son ambiguos (¿un día puede partirse entre 2 proyectos? ¿quién cierra las notas de un técnico dado de baja?) en vez de inventar la regla.

**Phase to address:** F3 (bitácora), F4 (notas) y F2 (maestros/bajas).

---

### Pitfall 14: Captura desde el móvil en planta — duplicados y trabajo perdido

**What goes wrong:**
Los técnicos capturan desde el móvil en planta con conectividad variable (dato explícito de PROJECT.md). El envío tarda, el técnico toca otra vez, y aparecen dos notas o dos intentos de aprobación; o la petición se pierde y el técnico cree que guardó. Ambos casos erosionan la confianza en la app más rápido que cualquier bug visible.

**How to avoid:**
- La `UNIQUE(technician_id, date)` ya hace idempotente el guardado del día: usar `upsert` por esa clave, no `create`. Es la solución perezosa correcta — sin tabla de idempotency keys.
- Para `submit`/`approve`/`sign` (que no tienen clave natural), el update condicional del Pitfall 5 ya devuelve 409 en el segundo intento en vez de duplicar.
- UI: botón deshabilitado durante el envío + confirmación explícita de guardado. No hace falta offline-first en v1; sí hace falta **no mentir** sobre el estado de guardado.
- Guardar el borrador local (localStorage) del formulario del día para que un fallo de red no borre 10 minutos de escritura.

**Warning signs:** Filas duplicadas en pruebas de doble toque; reportes de "escribí el día y desapareció".

**Phase to address:** F3 (bitácora) + F7 (conexión del frontend).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| RBAC solo en la app, RLS "para después" | Avanza 1 semana más rápido | La segunda capa nunca llega; añadir RLS con datos y código encima obliga a auditar cada query y cada rol de BD | **Nunca** — es requisito explícito y con Railway la BD no está en una VNet |
| Un único rol de Postgres (el de Railway) | Cero fricción de despliegue | RLS inoperante (Pitfall 1); privilegios de DDL en runtime | Solo en dev local |
| Envolver todo el request en `$transaction` para RLS | Una línea de middleware | Timeouts P2028 y agotamiento del pool en el peor momento | Nunca; scope por caso de uso desde el inicio |
| Guardar rol/permisos en claims de Entra | "Ya viene en el token" | Overage de grupos, cambios de rol requieren al admin del tenant FAVA, la matriz §6 (S asigna admin) deja de ser autoservicio | Nunca en este proyecto |
| Regenerar el PDF en cada descarga | Sin storage, sin versiones | El documento firmado deja de ser reproducible; problema legal/comercial con clientes de FAVA | Solo para el preview en estado `draft` |
| Mapas de limpieza de migración hardcodeados en TS | Rápido de escribir | FAVA no puede revisarlos ni corregirlos; cada ajuste es un despliegue | Nunca — CSV/JSON versionado cuesta lo mismo |
| SSE con `EventEmitter` en memoria | 20 líneas y funciona | Bloquea el escalado horizontal | **Aceptable y recomendado** a 50 usuarios, documentando `replicas = 1` |
| Gastos/anticipos como JSONB sin esquema | Flexible para v1 | Reportes futuros sobre JSON sin tipar | Aceptable en v1: la decisión ya es "solo informativos" |
| `trips`/`exports` como stubs vacíos | Estructura lista | Código muerto que confunde | Aceptable si es carpeta vacía + README; no crear clases vacías |
| Sin tests e2e del flujo draft→submitted→approved | Entrega antes | Es el flujo núcleo; una regresión aquí es pérdida de datos de negocio | Nunca |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Entra ID (API) | Validar tokens emitidos para Microsoft Graph; `aud` sin verificar | Registro de app propio para el API con scope `access_as_user`; validar firma + `iss` + `tid` + `aud` + `scp` |
| Entra ID (versiones) | Validar un token v1.0 contra la metadata v2.0 | Fijar `requestedAccessTokenVersion: 2` y usar la metadata `/v2.0`; si llega `ver: "1.0"`, rechazar |
| Entra ID (identidad) | Usar `email`/`preferred_username` como clave de usuario | `oid` + `tid` (`users.entra_oid`); el email es solo dato de visualización |
| Entra ID (tenant swap) | Issuer/audience hardcodeados o construidos en 2 sitios | 3 env vars validadas con zod; una sola función que arma la config |
| Prisma + RLS | `SET app.x` en middleware sobre conexión del pool | `set_config('app.x', $1, true)` dentro de la transacción del caso de uso |
| Prisma Migrate | Esperar que Prisma genere/preserve políticas RLS y GRANTs | Migraciones SQL editadas a mano (`--create-only`), políticas idempotentes, y test que las verifique tras cada deploy |
| Railway ↔ Postgres | Conectar por la URL pública de TCP proxy | Red privada `*.railway.internal`; pública solo para operaciones puntuales |
| Railway ↔ SSE | Stream abierto indefinidamente sin heartbeat | Heartbeat ≤30 s y reconexión del cliente antes de los 15 min |
| Railway ↔ email | SMTP (Resend/SendGrid por puerto 587) | API HTTP (Resend); Railway bloquea SMTP saliente |
| Chromium/PDF en Railway | Puppeteer con Chromium completo en la imagen por defecto | Imagen con dependencias explícitas + `chrome-headless-shell`, o Playwright; instancia reutilizada con reciclado periódico; **evaluar primero si una librería de PDF sin navegador basta para un layout tabular fijo** |
| Storage de PDFs/firmas | Volumen local del contenedor | Storage externo (S3/R2) con signed URLs cortas; los volúmenes de Railway atan el servicio a una instancia |
| Frontend MSAL ↔ API | Pedir token de Graph y mandarlo al backend | `acquireTokenSilent` con el scope del API propio |

## Performance Traps

**Contexto de escala honesto:** ~15 técnicos × ~250 días = **~4.000 filas/año**; el histórico completo son 7.589 filas. Postgres no va a ser el cuello de botella jamás. Cualquier caché, réplica de lectura o índice "por si acaso" es sobre-ingeniería. Los cuellos reales son de memoria y de conexiones.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Streams SSE reteniendo conexiones Prisma | La app se cuelga entera cuando hay varios usuarios con la pestaña abierta | El handler SSE no toca la BD; payload = `{tipo, id}` + refetch | ~10-20 usuarios concurrentes con el pool por defecto |
| Chromium por request para el PDF | OOM del contenedor; procesos zombie tras un crash | Reutilizar navegador, reciclar cada N renders, límite de concurrencia = 1-2, timeout duro | 2-3 PDFs simultáneos en un contenedor de 512 MB-1 GB |
| Transacciones interactivas largas (RLS + PDF dentro) | `P2028`, `Timed out fetching a new connection` | Transacción por caso de uso; I/O fuera | Lunes por la mañana, cuando 15 técnicos envían la semana a la vez |
| `SELECT *` sobre `weekly_notes` con firmas base64 | Listados lentos y payloads de MBs | Firmas en storage; `select` explícito en listados | Con ~100 notas ya se nota |
| KPIs recalculando 2 años de histórico en cada carga del tablero | Tablero tarda segundos | Índices por `(technician_id, date)` y `(project_id, date)`; vista SQL única | Probablemente nunca a esta escala — **medir antes de cachear** |
| `console.log` de payloads completos en Railway | Logs ilegibles y coste; riesgo de filtrar tokens/PII | Logger estructurado con redacción de `authorization`/firmas | Desde el primer día en prod |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| RLS habilitado pero el runtime es dueño de las tablas | La segunda capa de defensa no existe; un bug de RBAC expone datos de todos los técnicos | Rol de app sin `BYPASSRLS` + `FORCE ROW LEVEL SECURITY` + test con el rol real |
| Contexto RLS fijado con `SET` sobre conexión del pool | Un técnico ve datos de otro de forma intermitente | `set_config(..., true)` en transacción |
| Aceptar tokens no emitidos para este API | Confused deputy: otra app del tenant llama al API con su token | Validar `aud` contra el App ID URI propio, siempre |
| Autorización basada en claims de grupos de Entra | Con >200 grupos el claim desaparece → escalada o bloqueo silencioso | Roles en la tabla `users`, gestionados por el Super Admin |
| Token en la query string del endpoint SSE | El access token queda en logs de Railway/proxies | `fetch-event-source` con cabecera, o token de stream efímero |
| Firma guardada como campo mutable sin metadatos | La nota firmada no es defendible ante una disputa con el cliente final | Evento append-only con hash del documento, timestamp de servidor, IP y user agent |
| PDFs en storage público o con URL adivinable | Fuga de datos de clientes (NIT, contrato, valores) | Storage privado + signed URLs de expiración corta (ya en §12) |
| `audit_log` con permisos de `UPDATE`/`DELETE` para el rol de la app | La auditoría deja de ser evidencia | `GRANT INSERT, SELECT` únicamente; sin `UPDATE`/`DELETE` |
| Migración corriendo con superusuario contra prod sin backup previo | Pérdida del histórico de 2 años | Snapshot + restauración ensayada antes; script idempotente con rollback por `source_*` |
| Baja en Entra ≠ baja en la app | El técnico dado de baja conserva sesión hasta que expire el token | Token de vida corta + check de `users.is_active` en cada request (ya se lee para el rol) |
| `$queryRawUnsafe` con interpolación en la migración o los KPIs | SQLi en el punto donde más privilegios hay | `$queryRaw` con template tags parametrizado, siempre |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Enviado" sin explicar que ya no se puede editar | El técnico envía a mitad de semana y queda bloqueado; llama al admin | Confirmación explícita que diga qué se bloquea, y ruta visible de "solicitar devolución" |
| Devolver una nota sin motivo obligatorio | El técnico no sabe qué corregir; ida y vuelta por WhatsApp | Comentario obligatorio en `return`, visible en la nota y en el historial |
| Errores de validación en el idioma equivocado | Técnicos ES e IT leyendo mensajes del backend en inglés | Códigos de error del API + textos en el frontend (que ya tiene el toggle ES/IT) |
| Formulario del día sin memoria ante caída de red | Se pierde lo escrito en planta | Borrador local + reintento |
| Tablero mostrando cifras sin decir que excluye lo no aprobado | "No cuadra con mi Excel" → desconfianza | Leyenda del corte + contador de pendientes |
| Vista solo semanal, sin calendario (hallazgo 2026-07-25) | Difícil ver huecos de días sin registrar — el error más común en bitácoras | Vista calendario con días vacíos resaltados |
| Errores 409 mostrados como "Error inesperado" | El admin no entiende por qué falló su aprobación | Mensaje específico: "otro administrador ya procesó esta nota" + refresco automático |

## "Looks Done But Isn't" Checklist

- [ ] **RLS:** ¿probado conectándose con el **rol de runtime** y verificando conteos? ¿`FORCE` activo? ¿sobrevive a una migración que recrea la tabla?
- [ ] **Auth Entra:** ¿se rechaza un token con `aud` de otra app? ¿uno expirado? ¿uno de otro tenant? ¿el swap de tenant es solo env vars, probado?
- [ ] **Bitácora:** ¿la suite pasa con `TZ=UTC+14` y `TZ=UTC-11`? ¿un doble guardado del mismo día produce 1 fila, no 2?
- [ ] **Aprobación:** ¿dos aprobaciones concurrentes → una 200 y una 409? ¿se puede editar un `daily_entry` de una nota aprobada por API directa? (debe fallar en BD, no solo en UI)
- [ ] **Nota Semanal:** ¿cubre la semana con **2 proyectos**? ¿el cargo semanal variable? ¿los anticipos? ¿la doble firma? ¿comparada campo a campo contra el PDF real de Iván Cortés?
- [ ] **PDF:** ¿el archivo firmado se guarda con hash? ¿acentos ES/IT correctos? ¿se genera bajo 512 MB de RAM sin dejar procesos zombie?
- [ ] **Firma:** ¿hay IP, user agent, timestamp de servidor y hash del documento? ¿es append-only para el rol de la app?
- [ ] **SSE:** ¿probado **en Railway** durante >15 minutos? ¿reconecta solo? ¿el token no viaja en la URL? ¿degrada a polling?
- [ ] **Migración:** ¿re-ejecutable sin duplicar? ¿reporte de conciliación revisado por FAVA? ¿filas rechazadas contadas y explicadas? ¿rollback probado?
- [ ] **KPIs:** ¿filtran por estado aprobado? ¿`MD` pesa 0.5? ¿el delta cuadra con un dataset controlado a mano?
- [ ] **Auditoría:** ¿hay `before`/`after` reales, no solo el nombre del endpoint? ¿toda transición de estado deja rastro?
- [ ] **Backups:** ¿se restauró un backup en un servicio nuevo y se verificaron los conteos? (si no, no hay backup)
- [ ] **Bajas:** ¿un técnico inactivo conserva su histórico en los KPIs y pierde el acceso?
- [ ] **Secretos:** ¿la app **falla el arranque** si falta una env var, en vez de usar un default?

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| RLS inoperante descubierto en prod | MEDIUM | Crear rol de app sin privilegios, `FORCE RLS`, rotar `DATABASE_URL`, redeploy; auditar accesos previos con `audit_log`/pgAudit |
| Fuga de contexto por `SET` en pool | HIGH | Cambiar a `set_config` local, redeploy inmediato; **notificar** — es un incidente de confidencialidad entre técnicos, no un bug cualquiera |
| Token mal validado (aceptaba tokens ajenos) | MEDIUM | Corregir validación, invalidar sesiones (rotar el registro de app fuerza nuevos tokens), revisar `audit_log` por actores inesperados |
| Fechas corridas un día ya en producción | HIGH | Script de corrección con backup previo; **regenerar** las notas afectadas es imposible si ya están firmadas → requiere reapertura y re-firma con el cliente. Por eso este es el bug más caro del proyecto |
| Migración duplicó filas | MEDIUM | Con `source_*` es un `DELETE` acotado y re-run. **Sin** `source_*` es restaurar backup y rehacer todo |
| PDF firmado ya no reproducible | HIGH | No hay recuperación técnica: hay que pedir al cliente que vuelva a firmar. Prevenir es la única opción real |
| SSE cayendo en silencio | LOW | Añadir heartbeat + reconexión + fallback a polling; sin pérdida de datos |
| PDF tumbando el contenedor por OOM | LOW | Limitar concurrencia a 1, reciclar navegador, subir plan; peor caso, mover la generación a un job |
| Aprobación duplicada por race | LOW-MEDIUM | Update condicional + limpieza de registros de auditoría duplicados; si generó PDFs duplicados, marcar superseded |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Dueño de tabla bypassa RLS | F1 Fundación | Test de integración con el rol de runtime: conteos filtrados; `relforcerowsecurity = t` |
| 2. Fuga/agotamiento por contexto de sesión | F1 Fundación | Test de concurrencia con 2 técnicos × 200 iteraciones; sin `P2028` en carga |
| 3. Validación de token Entra | F1 Auth | Suite de tokens negativos (aud ajeno, expirado, otro tenant, v1 vs v2); swap de tenant por env |
| 4. Corrimiento de fecha | F1 (schema) + F3 (bitácora) | Suite completa con `TZ` extremas; doble guardado → 1 fila |
| 5. Races de aprobación / bloqueo | F3 (guard de escritura) + F4 (transiciones) | Aprobaciones concurrentes → 1×200 + 1×409; `UPDATE` directo sobre entry aprobada rechazado por la BD |
| 6. Migración sin reconciliación | F1 (campos `source_*`) + F6 (migración) | Reporte de conciliación con delta 0 o explicado; 3 ejecuciones seguidas = mismo resultado |
| 7. Parseo del `.xls` | F6 (extracto crudo desde F0) | Conteos 2.844 / 4.745; cero caracteres corruptos; fechas dentro de rango 2025-2026 |
| 8. PDF no congelado | F4 Nota Semanal | Hash almacenado; comparación campo a campo contra el PDF real; el archivo firmado no cambia tras editar datos |
| 9. Firma sin valor probatorio | F4 Firma | Evento con hash+IP+UA+timestamp de servidor; `UPDATE` denegado al rol de app |
| 10. SSE en Railway | F7 Tiempo real | Prueba en Railway >15 min con reconexión; token fuera de la URL; fallback a polling |
| 11. Seguridad Azure vs Railway | F8 Deploy + hardening (decisiones en F1) | Matriz de controles firmada; restauración de backup ensayada; conexión por red privada |
| 12. KPIs inestables | F1 (dimensión fase) + F5 (KPIs) | Dataset controlado a mano cuyo delta se calcula manualmente y coincide |
| 13. Edge cases de negocio | F2/F3/F4 según caso | Un test con nombre por edge case listado en PROJECT.md |
| 14. Móvil y conectividad | F3 (upsert) + F7 (frontend) | Doble toque → 1 fila; corte de red no pierde el formulario |

## Sources

**Oficiales (HIGH confidence)**
- PostgreSQL — Row Security Policies (bypass del dueño, `FORCE ROW LEVEL SECURITY`, `BYPASSRLS`): https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Microsoft Entra — Access tokens (reglas de validación, `aud`/`iss`/`tid`, v1 vs v2, "no se pueden validar tokens de Graph", confused deputy): https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
- Microsoft Entra — Configure group claims and app roles (overage de 200 grupos, `_claim_names`, recomendación de app roles): https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles
- Railway — Choose Between SSE and WebSockets (SSE hasta 15 min, cierre a los 5 min sin datos, heartbeat requerido): https://docs.railway.com/guides/sse-vs-websockets
- Railway — Point-in-Time Recovery (retención ~4 semanas, restauración a servicio nuevo, RPO 60 s): https://docs.railway.com/volumes/point-in-time-recovery
- Prisma — Transactions (defaults `maxWait: 2000ms`, `timeout: 5000ms`; advertencia sobre transacciones largas y deadlocks): https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Prisma — Client extension oficial de Row-Level Security (`set_config(..., true)` dentro de transacción): https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security
- Prisma — Shadow database (por qué las políticas RLS en SQL crudo dan problemas al generar migraciones): https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
- Microsoft — Excel asume incorrectamente que 1900 es bisiesto: https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year
- passport-azure-ad (deprecado; código movido a MSAL.js): https://github.com/AzureAD/passport-azure-ad · https://www.npmjs.com/package/passport-azure-ad
- SheetJS — opciones de parseo (`codepage` en BIFF2-BIFF5, comportamiento de celdas combinadas): https://docs.sheetjs.com/docs/api/parse-options/

**Ecosistema / comunidad (MEDIUM confidence)**
- Prisma issue #28840 — `updateMany` recorta predicados en MySQL (rompe CAS); comportamiento a verificar en Postgres: https://github.com/prisma/prisma/issues/28840
- Optimistic locking con Prisma (patrón `updateMany` + `count === 1`): https://oneuptime.com/blog/post/2026-01-25-optimistic-locking-prisma-nodejs/view
- Prisma issue #20615 / #7825 — manejo de fechas no-UTC y `DateTime` que descarta zona: https://github.com/prisma/prisma/issues/20615
- Multi-tenant leakage: cuando RLS falla en SaaS (fuga por pool, `SET` vs `SET LOCAL`): https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c
- Railway Central Station — conexiones largas cortadas por el edge proxy (jul-2026): https://station.railway.com/questions/edge-proxy-killing-all-long-lived-web-soc-f89626cd
- Configurar SSE tras nginx (`X-Accel-Buffering: no`, `proxy_buffering off`): https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view
- Puppeteer en producción: RAM 200-500 MB por instancia, procesos huérfanos, dependencias de Chromium en Docker: https://pdf4.dev/blog/chrome-headless-shell-vs-puppeteer-chromium-pdf · https://pdf4.dev/blog/playwright-vs-puppeteer-pdf
- Buenas prácticas de audit trail de firma electrónica (hash antes/después, timestamp de servidor, IP/UA, almacenamiento append-only, evidencia anexa al PDF): https://formfy.ai/compliance/audit-trail-e-signature · https://boldsign.com/esignature-audit-trail/
- Prácticas de aprobación de hojas de tiempo (bloqueo automático al aprobar, reapertura documentada, motivo del cambio): https://livetecs.com/blog/timesheet-approval-process-best-practices/ · https://tcpsoftware.com/articles/timesheet-errors/
- Idempotencia y reintentos en apps de campo con conectividad pobre: https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8

**Del propio proyecto (HIGH confidence — datos reales analizados)**
- `CONTEXTO-PROYECTO-FAVA.md` §3 (14 hojas, 2.844 + 4.745 filas), §5 (problemas de calidad de datos), §10 (esquema), §12 (plan de seguridad escrito para Azure), §13 (SSE), §17 (lectura del `.xls` con `xlrd`)
- `.planning/PROJECT.md` — edge cases declarados, decisión Railway, hallazgos de revisión 2026-07-25

---
*Pitfalls research for: backend de control de jornada con aprobación, PDF firmado y migración de histórico (FAVA)*
*Researched: 2026-07-25*
