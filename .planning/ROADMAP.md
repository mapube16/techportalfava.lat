# Roadmap: Control Técnico FAVA

## Overview

El frontend React con 11 pantallas ya existe con datos mock. Este roadmap construye el backend NestJS detrás de él y va retirando los mocks pantalla por pantalla, nunca en un big-bang final. Arranca por lo que no se puede retrofitear: identidad Entra ID, RLS en Postgres y el primer deploy a Railway (Fase 1), porque los límites reales de Railway y el bypass de RLS por owner solo aparecen desplegado. Sigue con los maestros (Fase 2), que cargan los campos de encabezado de la Nota — NIT, localidad, suministro, contrato — que no viven en ningún otro lado. Con eso, el núcleo de valor: el técnico captura su semana una vez (Fase 3), el envío deriva solo las notas por proyecto y el admin aprueba o devuelve con auditoría completa (Fase 4), y el cliente firma en campo un PDF fiel al papel que queda congelado como evidencia (Fase 5). La migración del histórico 2025-2026 con su reporte de conciliación (Fase 6) puede correr en paralelo desde que el esquema queda estable, y debe terminar antes de los tableros (Fase 7), porque KPIs sin historia no se pueden validar frente a FAVA. Cierra con el endurecimiento de producción (Fase 8): respaldos probados y una matriz de controles para Railway que reemplaza el plan escrito para Azure.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Fundación segura y desplegada** - Login Microsoft real, RLS a prueba de bugs y primer deploy a Railway
- [ ] **Phase 2: Maestros y catálogos** - Técnicos, proyectos con encabezado de Nota, días vendidos rol×fase y usuarios
- [ ] **Phase 3: Bitácora diaria** - Captura única de la semana desde el móvil, con borrador local y envío idempotente
- [ ] **Phase 4: Flujo de aprobación y auditoría** - Notas derivadas por proyecto, draft→submitted→approved/returned y rastro completo
- [ ] **Phase 5: Nota Semanal PDF y firma del cliente** - PDF fiel al papel, doble firma con expediente de evidencia, congelado e inmutable
- [ ] **Phase 6: Migración del histórico y conciliación** - 2025+2026 limpios dentro de la app, cuadrados contra el Excel
- [ ] **Phase 7: Tableros KPI en vivo** - Los 5 tableros en Nivo sobre datos aprobados, actualizados solos vía SSE
- [ ] **Phase 8: Endurecimiento y puesta en producción** - Respaldos restaurados de verdad y controles de seguridad para Railway

## Phase Details

### Phase 1: Fundación segura y desplegada
**Goal**: Cualquier persona de FAVA entra a una URL pública, inicia sesión con su cuenta Microsoft, y la app sabe quién es y qué tiene permitido ver — con el aislamiento por técnico garantizado en la base, no en el código.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Un usuario abre la URL de Railway, hace login con Microsoft y el frontend real (no el mock) muestra su nombre y rol traídos del API.
  2. Un técnico que consulta datos de otro técnico recibe 0 filas — demostrado por un test e2e que se conecta con el rol de aplicación (sin BYPASSRLS) sobre datos sembrados de dos técnicos.
  3. Desactivar a un usuario le corta el acceso en su siguiente petición, sin esperar a que expire el token.
  4. Un Admin que intenta asignar el rol Admin recibe 403; un Super Admin lo consigue.
  5. Una transición multi-tabla de prueba corre dentro del patrón transacción-por-petición con RLS activo, sin P2028 ni fuga de contexto entre conexiones del pool.
**Frontend cutover**: `Login.tsx`, `Layout.tsx` (usuario/rol), cliente API tipado + MSAL (msal-browser directo)
**Plans**: 6 plans

Plans:
- [ ] 01-01-PLAN.md — Monorepo workspaces, scaffold NestJS 11 + Prisma 7, esquema y bootstrap de los 2 roles de Postgres (Wave 1)
- [ ] 01-02-PLAN.md — RLS: migración FORCE + políticas, interceptor tx-por-petición, tests de aislamiento y spike multi-tabla (Wave 2)
- [ ] 01-03-PLAN.md — Guard Entra (jose) + /api/me + solicitudes de acceso + módulo users con escalada de roles (Wave 2)
- [ ] 01-04-PLAN.md — Docs ENTRA-SETUP/ENV + registro de las 2 apps en el tenant dev (checkpoint) (Wave 1)
- [ ] 01-05-PLAN.md — Frontend: MSAL Browser v5 + redirect.html + cliente API tipado + pantallas de sesión (Wave 1)
- [ ] 01-06-PLAN.md — Deploy Railway + smoke post-deploy + verificación humana de 3 cuentas (checkpoint) (Wave 3)

### Phase 2: Maestros y catálogos
**Goal**: Un admin administra desde la app todos los datos que alimentan el resto del sistema — técnicos, proyectos con el encabezado real de la Nota, días vendidos y usuarios — sin texto libre.
**Depends on**: Phase 1
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05
**Success Criteria** (what must be TRUE):
  1. Un admin crea un proyecto con cliente, NIT, localidad, suministro, n° de contrato, país y máquinas asociadas, y los ve en el detalle — son exactamente los campos que después imprime la Nota.
  2. Un admin crea un técnico externo o histórico sin cuenta Entra, y al desactivarlo sus datos siguen existiendo y consultables.
  3. Un admin carga días vendidos por rol×fase y la pantalla muestra vendido y disponible calculados; no existe ningún campo de delta digitable.
  4. Concepto de jornada, rol técnico y moneda solo se eligen de listas cerradas — ninguno de los tres acepta texto libre en ninguna pantalla.
  5. Proyectos, Detalle de Proyecto, Técnicos, Usuarios y Config leen del API real; sus mocks salieron de `data.ts`.
**Frontend cutover**: `Projects.tsx`, `ProjectDetail.tsx`, `Techs.tsx`, `Users.tsx`, `Config.tsx`, `NewProjectModal.tsx`, `InviteUserModal.tsx`
**Plans**: 6 (0/6 complete)

### Phase 3: Bitácora diaria
**Goal**: El técnico registra su semana una sola vez desde el móvil en planta, y el dato sobrevive a la conectividad mala y al doble toque.
**Depends on**: Phase 2
**Requirements**: BIT-01, BIT-02, BIT-03, BIT-04
**Success Criteria** (what must be TRUE):
  1. Un técnico abre su semana en el móvil, registra los 7 días con proyecto, máquina, concepto, fase y descripción, y al recargar ve exactamente lo mismo.
  2. El mismo técnico no puede terminar con dos registros para la misma fecha, y la fecha guardada es la del sitio: el mismo día se ve igual con el dispositivo en Bogotá, Roma o São Paulo.
  3. Días de LR/NR/IL se registran sin proyecto y el sistema los acepta; un día de trabajo en obra sin proyecto se rechaza.
  4. Cerrar el navegador con la semana a medio llenar y volver a abrirlo conserva el borrador; pulsar "enviar" dos veces con señal intermitente produce un solo envío.
  5. La pantalla Semana y el drawer de registro funcionan contra el API real.
**Frontend cutover**: `Week.tsx`, `LogDayDrawer.tsx`
**Plans**: TBD

### Phase 4: Flujo de aprobación y auditoría
**Goal**: La semana enviada se convierte sola en una nota por proyecto que el admin aprueba o devuelve, y ningún movimiento ocurre sin dejar rastro.
**Depends on**: Phase 3
**Requirements**: BIT-05, NOTA-01, NOTA-02, NOTA-03, NOTA-09, CAT-06, AUD-01, AUD-02
**Success Criteria** (what must be TRUE):
  1. Un técnico que trabajó en dos proyectos en la semana envía una vez y el sistema genera dos notas, una por proyecto; el técnico nunca crea ni elige "notas", y cada nota nace con su cargo de esa semana (default del maestro, editable).
  2. Al enviar, los días de esa semana quedan en solo lectura para el técnico; si el admin devuelve la nota, vuelven a ser editables.
  3. Devolver una nota sin comentario es imposible; el técnico ve el comentario, corrige y reenvía.
  4. Dos admins que aprueban la misma nota a la vez: uno gana y el otro recibe conflicto — nunca hay doble aprobación ni estado inconsistente.
  5. El Super Admin ve en el visor de auditoría quién hizo cada transición, cuándo, qué cambió y con qué motivo; dar de baja a un técnico con notas pendientes avisa del pendiente y permite aprobar en su nombre, quedando el `on_behalf_of` registrado.
**Frontend cutover**: `Inbox.tsx`, `Notes.tsx`, `ReturnModal.tsx`, `Audit.tsx`, bandeja de `Home.tsx`
**Plans**: TBD

### Phase 5: Nota Semanal PDF y firma del cliente
**Goal**: El cliente firma en el móvil del técnico en obra y queda un PDF idéntico al formato de papel, congelado como evidencia que nadie puede alterar después.
**Depends on**: Phase 4 (qué se firma) y Phase 2 (datos de encabezado)
**Requirements**: NOTA-04, NOTA-05, NOTA-06, NOTA-07, NOTA-08
**Success Criteria** (what must be TRUE):
  1. El PDF generado coincide campo por campo con "Reporte 02 - Ivan Cortés": encabezado (cliente, NIT, localidad, suministro, contrato, maquinaria, cargo durante la semana), columna NOTA, las 7 filas de la semana con los días de otros proyectos en blanco, gastos, anticipos del cliente, declaración de conformidad y doble firma con fecha/timbre.
  2. Técnico y cliente firman en canvas desde el móvil y queda el expediente completo: nombre, documento, cargo del firmante, aceptación explícita de la declaración, timestamp de servidor, IP, user-agent y SHA-256 del PDF.
  3. Descargar el PDF firmado meses después entrega los mismos bytes y el mismo hash — nunca se re-renderiza — y el enlace es una URL firmada temporal, no un archivo de acceso público.
  4. Un Super Admin reabre una nota aprobada con motivo obligatorio: la versión sube, el PDF anterior sigue descargable y la firma queda invalidada solo si cambió el contenido firmado.
  5. Los gastos y anticipos capturados aparecen impresos en el PDF sin disparar ningún flujo de reembolso ni bloquear la aprobación.
**Frontend cutover**: `PdfPreview.tsx`, `SignatureBox.tsx`
**Research flag**: sí — decisión de librería PDF contingente a la respuesta de FAVA (¿existe PDF rellenable/AcroForm?) y a un spike de fidelidad timeboxed. Ver `research/SUMMARY.md` § "PDF Library".
**Plans**: TBD

### Phase 6: Migración del histórico y conciliación
**Goal**: Los datos de 2025 y 2026 del Excel viven dentro de la app, limpios y cuadrados contra el original, sin ensuciar la bandeja de aprobación.
**Depends on**: Phase 2 (esquema y catálogos estables) — puede correr en paralelo con Phases 3-5
**Requirements**: MIG-01, MIG-02, MIG-03
**Success Criteria** (what must be TRUE):
  1. El histórico queda cargado con alias de técnicos resueltos, las 11 variantes de rol mapeadas, proyectos duplicados consolidados, LR/NR en un catálogo único y máquinas normalizadas.
  2. Ninguna fila migrada aparece en la bandeja de aprobación: todas entran como aprobadas y marcadas `is_migrated`, con su `source_row_ref` (hoja!fila) visible desde el registro.
  3. Volver a correr la migración no duplica nada — el upsert por `source_*` es idempotente.
  4. El reporte de conciliación muestra totales Excel vs. app por técnico, proyecto, mes y concepto con las diferencias resaltadas, y permite navegar de una diferencia a las filas que la causan.
**Frontend cutover**: pantalla de conciliación (nueva)
**Plans**: TBD

### Phase 7: Tableros KPI en vivo
**Goal**: El admin abre un tablero, ve números que puede defender frente a FAVA porque salen solo de notas aprobadas con histórico completo, y las pantallas se actualizan solas sin recargar.
**Depends on**: Phase 4 (datos aprobados y eventos) y Phase 6 (histórico)
**Requirements**: KPI-01, KPI-02, KPI-03, KPI-04, KPI-05, KPI-06, RT-01, RT-02
**Success Criteria** (what must be TRUE):
  1. Vendido vs. ejecutado por proyecto con desglose rol×fase y delta calculado, contando únicamente notas aprobadas.
  2. Utilización por técnico con denominador que excluye IL, distribución por concepto por técnico y mes, días por cliente y país, y matriz técnico×semana con semáforo (sin registrar / borrador / enviado / aprobado).
  3. Todos los gráficos son Nivo con la paleta FAVA; ECharts ya no está en el bundle.
  4. Un técnico envía su semana y el badge de la bandeja del admin sube sin recargar la página; cuando el admin aprueba o devuelve, el técnico recibe la notificación en el centro in-app.
  5. Con la pestaña abierta e inactiva 20 minutos sobre Railway, la conexión SSE sigue viva o se reconecta sola, y el badge sigue siendo correcto.
**Frontend cutover**: `Kpis.tsx` (ECharts → Nivo), badge de `Layout.tsx`, centro de notificaciones; `data.ts` se elimina del repositorio
**Plans**: TBD

### Phase 8: Endurecimiento y puesta en producción
**Goal**: La app queda lista para apuntar al tenant real de FAVA, con respaldos que alguien ya restauró de verdad y controles escritos para la nube donde efectivamente corre.
**Depends on**: Phase 5 (PDFs firmados que respaldar), Phase 7
**Requirements**: INFRA-04
**Success Criteria** (what must be TRUE):
  1. Una restauración real de respaldo (ejecutada, no supuesta) devuelve datos y PDFs firmados a un punto en el tiempo, y el procedimiento queda escrito.
  2. Pasar del tenant dev al tenant de FAVA es solo cambiar variables de entorno — sin tocar una línea de código.
  3. Si falta o está mal una variable de entorno, la app no arranca; falla al iniciar, no en la primera petición del usuario.
  4. Existe una matriz de controles de seguridad para Railway que reemplaza el plan escrito para Azure (CONTEXTO §12), con la conexión a la base por red privada.
**Plans**: TBD

## Frontend Cutover Map

El frontend existe (`fava-control-tecnico/frontend/`) con datos mock en `data.ts`. Ninguna fase lo reconstruye; cada fase cablea sus pantallas al API real y retira su porción del mock.

| Fase | Pantallas / componentes conectados |
|------|------------------------------------|
| 1 | 1/6 | In Progress|  | Projects, ProjectDetail, Techs, Users, Config, NewProjectModal, InviteUserModal |
| 3 | Week, LogDayDrawer |
| 4 | Inbox, Notes, ReturnModal, Audit, bandeja de Home |
| 5 | PdfPreview, SignatureBox |
| 6 | Conciliación (pantalla nueva) |
| 7 | Kpis (ECharts → Nivo), badge SSE, centro de notificaciones; `data.ts` eliminado |

## Decisiones abiertas con FAVA

Deben resolverse antes de la fase indicada, no durante su ejecución.

| Pregunta | Bloquea |
|----------|---------|
| ¿Un MD puede repartirse entre 2 proyectos? (afecta UNIQUE técnico+fecha) | Phase 3 |
| ¿Se puede aprobar una nota sin firma del cliente, marcada como tal? | Phase 4 |
| ¿Existe un PDF rellenable (AcroForm) de la Nota? | Phase 5 |
| Nota multi-proyecto: ¿filas de otros proyectos en blanco o solo los días propios? | Phase 5 |
| Revisión legal del texto de la declaración de conformidad | Phase 5 |
| ¿Los técnicos históricos italianos migran sin capacidad de login? | Phase 6 |
| Denominador de utilización: ¿LR/NR/IL cuentan como días disponibles? | Phase 7 |
| Años de retención de PDFs firmados | Phase 8 |
| ¿Railway es mandato definitivo o IT de FAVA exige Azure? | Phase 8 |

## Progress

**Execution Order:**
Las fases se ejecutan en orden numérico. Phase 6 (migración) puede adelantarse en paralelo con Phases 3-5 una vez estable el esquema de Phase 2.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundación segura y desplegada | 0/6 | Not started | - |
| 2. Maestros y catálogos | 1/6 | In Progress|  |
| 3. Bitácora diaria | 0/TBD | Not started | - |
| 4. Flujo de aprobación y auditoría | 0/TBD | Not started | - |
| 5. Nota Semanal PDF y firma | 0/TBD | Not started | - |
| 6. Migración del histórico | 0/TBD | Not started | - |
| 7. Tableros KPI en vivo | 0/TBD | Not started | - |
| 8. Endurecimiento y producción | 0/TBD | Not started | - |

---
*Roadmap created: 2026-07-25*
*Granularity: standard (8 fases) — coverage: 41/41 requisitos v1*
