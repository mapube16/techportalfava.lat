# Requirements: Control Técnico FAVA

**Defined:** 2026-07-25
**Core Value:** Captura única — el técnico registra el día una vez → Nota Semanal firmada + KPIs + control comercial salen solos.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Autenticación y acceso

- [ ] **AUTH-01**: Usuario inicia sesión con Microsoft Entra ID (SSO); la app no gestiona contraseñas (tenant dev → tenant FAVA solo por env vars)
  - *2026-07-25:* código construido y probado (12 unit + 45 e2e con tokens firmados localmente: firma, tenant equivocado, audiencia ajena, usuario desactivado). **Sin verificar contra Microsoft real** — el dev no tiene tenant propio; queda pendiente del tenant de FAVA. Mientras tanto opera el login de desarrollo (`DEV_AUTH_ENABLED`), que emite tokens validados por ese mismo guard.
- [x] **AUTH-02**: RBAC con 3 roles (Técnico/Admin/Super Admin) almacenados en BD y asignables en la app; solo Super Admin asigna el rol Admin
- [x] **AUTH-03**: Row-Level Security en Postgres: un técnico no puede leer registros de otro ni con bug de código (rol de BD sin BYPASSRLS + FORCE RLS, verificado por test e2e)
- [x] **AUTH-04**: Usuario desactivado (en app o en directorio) pierde acceso de inmediato

### Catálogos y maestros

- [ ] **CAT-01**: Catálogos cerrados: 8 conceptos de jornada, roles técnicos, monedas — sin texto libre
- [ ] **CAT-02**: Admin puede crear/editar técnicos (tipo interno/externo, activo) sin requerir cuenta Entra (técnicos históricos)
- [ ] **CAT-03**: Admin puede crear/editar proyectos con datos comerciales y de encabezado de Nota (cliente, NIT, localidad, suministro, n° contrato, país) y máquinas asociadas
- [ ] **CAT-04**: Admin carga días vendidos por rol×fase al proyecto; el delta nunca se digita
- [ ] **CAT-05**: Admin gestiona usuarios (invitar, asignar roles, activar/desactivar)
- [ ] **CAT-06**: Baja de técnico conserva toda la historia; el diálogo avisa notas pendientes y permite "aprobar en nombre de" con rastro en auditoría

### Bitácora diaria

- [ ] **BIT-01**: Técnico captura su semana en grilla de 7 días: proyecto, máquina, concepto, fase (Montaje/Collaudo), descripción
- [ ] **BIT-02**: Un registro por técnico por día — UNIQUE(técnico, fecha), fecha como DATE local del sitio (sin hora/tz)
- [ ] **BIT-03**: Conceptos sin proyecto (LR/NR/IL) permitidos vía project_id nullable + CHECK por concepto; sin proyecto centinela
- [ ] **BIT-04**: Borrador persiste localmente (conectividad pobre en planta) y el envío es idempotente (Idempotency-Key)
- [ ] **BIT-05**: Registros quedan en solo lectura al enviarse; la editabilidad la hereda del estado de la nota

### Nota Semanal

- [ ] **NOTA-01**: Al enviar la semana, el sistema deriva automáticamente una nota por proyecto (GROUP BY proyecto); el técnico nunca gestiona "notas"
- [ ] **NOTA-02**: Flujo draft → submitted → approved/returned con endpoints de transición dedicados (submit/approve/return/sign), nunca PATCH status genérico
- [ ] **NOTA-03**: Devolver exige comentario; el técnico lo ve, corrige y reenvía
- [ ] **NOTA-04**: Firma en canvas de técnico y cliente con expediente de evidencia: nombre, documento, cargo del firmante, aceptación explícita de la declaración, timestamp de servidor, IP, user-agent, SHA-256 del PDF
- [ ] **NOTA-05**: PDF fiel al formato real: encabezado completo (cliente, NIT, localidad, suministro, contrato, maquinaria, cargo durante la semana), columna NOTA, 7 filas de la semana con días de otros proyectos en blanco, gastos, anticipos del cliente, declaración de conformidad, doble firma + fecha/timbre
- [ ] **NOTA-06**: El PDF firmado se congela: bytes + hash inmutables en storage privado; nunca se re-renderiza
- [ ] **NOTA-07**: Reopen post-aprobación solo Super Admin con motivo obligatorio: version++, PDF anterior conservado, firma invalidada si cambia el contenido firmado (signed_content_hash)
- [ ] **NOTA-08**: Gastos y anticipos se capturan como informativos (sin flujo de reembolso)
- [ ] **NOTA-09**: El cargo del técnico puede variar por semana (campo en la nota, default del maestro)

### KPIs y tableros

- [ ] **KPI-01**: Vendido vs. ejecutado por proyecto, desglosado rol×fase, delta calculado, solo con datos aprobados
- [ ] **KPI-02**: Utilización por técnico — denominador excluye IL; LR/NR cuentan como no productivos (definición centralizada y ajustable)
- [ ] **KPI-03**: Distribución por concepto por técnico y mes
- [ ] **KPI-04**: Días por cliente y país
- [ ] **KPI-05**: Estado de reportes: matriz técnico×semana con semáforo (sin registrar/borrador/enviado/aprobado)
- [ ] **KPI-06**: Todos los gráficos con Nivo aplicando la paleta FAVA (reemplaza ECharts)

### Tiempo real y notificaciones

- [ ] **RT-01**: SSE como bus de invalidación (eventos {tipo, id} + refetch), badge de bandeja en vivo, heartbeat 25s, reconexión automática, token por header (no query string)
- [ ] **RT-02**: Centro de notificaciones in-app: nota devuelta, nota aprobada, pendientes de aprobar

### Migración del histórico

- [ ] **MIG-01**: Migración 2025+2026 con limpieza: alias de técnicos, mapeo de 11 variantes de rol, consolidación de proyectos duplicados, catálogo LR/NR único, máquinas normalizadas
- [ ] **MIG-02**: Filas migradas entran como approved + is_migrated + source_row_ref (hoja!fila) — nunca a la bandeja
- [ ] **MIG-03**: Reporte de conciliación navegable: totales Excel vs. app por técnico/proyecto/mes/concepto con diferencias resaltadas

### Auditoría

- [ ] **AUD-01**: audit_log append-only en toda transición y cambio: quién, cuándo, antes, después, reason (obligatorio en return/reopen), on_behalf_of
- [ ] **AUD-02**: Visor de auditoría para Super Admin (pantalla ya existente en el frontend)

### Plataforma e integración

- [x] **INFRA-01**: Backend NestJS monolito modular — un módulo por dominio en su propia carpeta — con Prisma 7 (cjs) + PostgreSQL; TypeScript pineado 5.9.x
- [x] **INFRA-02**: Deploy en Railway desde el inicio con dos roles de Postgres (owner para migraciones, app sin BYPASSRLS) y secretos en env vars
- [x] **INFRA-03**: Frontend conectado al API real con cliente tipado + MSAL React; los mocks de data.ts se retiran pantalla por pantalla
- [ ] **INFRA-04**: Backups automáticos con PITR cubriendo datos y PDFs firmados

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### v1.x (al primer disparador real)

- **V1X-01**: Email vía Resend (nota devuelta + digest diario) — Railway bloquea SMTP
- **V1X-02**: Ruta de escape de firma: subir PDF firmado escaneado con el mismo expediente
- **V1X-03**: Vista calendario de la bitácora (detección visual de huecos)
- **V1X-04**: Idioma del PDF por cliente (pdf_locale) — no es traducción automática
- **V1X-05**: Resaltado de anomalías en la bandeja (delta > vendido)
- **V1X-06**: Export a Excel de tableros
- **V1X-07**: Historial de versiones de nota visible en UI

### Fase 2/3 (declaradas)

- **F2-01**: Módulo Viaggi con facturación € (fórmula pendiente de FAVA)
- **F2-02**: Exportaciones formato casa matriz (Resoconto/Dettaglio/Viaggi)
- **F3-01**: Alertas de desviación de proyecto
- **F3-02**: Planeación/asignación de técnicos
- **F3-03**: MD repartido entre 2 proyectos (solo si FAVA confirma que ocurre)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Nómina/liquidación salarial | La app entrega insumos, no calcula sueldos (documento §02) |
| Contabilidad/facturación fiscal | La emite el sistema de la matriz |
| Inventario/logística de maquinaria | Fuera del dominio |
| GPS/geocercas/control de presencia | Destruye confianza, habeas data (Ley 1581/2012), la firma del cliente ya prueba presencia |
| Granularidad de horas | El dominio entero está en días; MD cubre el caso fraccionario |
| Portal de login para el cliente final | Identidad externa (B2B) para usuarios de 4 usos/año; firma presencial en el móvil del técnico |
| Traducción automática ES↔IT de texto libre | Decisión 2026-07-25; toggle UI + catálogos bilingües |
| WebSockets/edición colaborativa | SSE alcanza para ~50 usuarios |
| Email por cada evento | Fatiga de notificación; in-app + badge SSE |
| Firma digital certificada | Decreto 2364/2012 permite firma simple de empresa; el valor probatorio está en el expediente |
| Motor offline-first completo | Costo enorme para ~1 registro/día; borrador local + idempotencia cubre el caso |
| Cadenas de aprobación multinivel | 2 admins y ~15 técnicos; el Super Admin siempre puede |
| Pre-cargar días futuros vacíos | Vicio del Excel actual; ensucia agregaciones |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 — Fundación segura y desplegada | Complete |
| AUTH-02 | Phase 1 — Fundación segura y desplegada | Complete |
| AUTH-03 | Phase 1 — Fundación segura y desplegada | Complete |
| AUTH-04 | Phase 1 — Fundación segura y desplegada | Complete |
| CAT-01 | Phase 2 — Maestros y catálogos | Pending |
| CAT-02 | Phase 2 — Maestros y catálogos | Pending |
| CAT-03 | Phase 2 — Maestros y catálogos | Pending |
| CAT-04 | Phase 2 — Maestros y catálogos | Pending |
| CAT-05 | Phase 2 — Maestros y catálogos | Pending |
| CAT-06 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| BIT-01 | Phase 3 — Bitácora diaria | Pending |
| BIT-02 | Phase 3 — Bitácora diaria | Pending |
| BIT-03 | Phase 3 — Bitácora diaria | Pending |
| BIT-04 | Phase 3 — Bitácora diaria | Pending |
| BIT-05 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| NOTA-01 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| NOTA-02 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| NOTA-03 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| NOTA-04 | Phase 5 — Nota Semanal PDF y firma | Pending |
| NOTA-05 | Phase 5 — Nota Semanal PDF y firma | Pending |
| NOTA-06 | Phase 5 — Nota Semanal PDF y firma | Pending |
| NOTA-07 | Phase 5 — Nota Semanal PDF y firma | Pending |
| NOTA-08 | Phase 5 — Nota Semanal PDF y firma | Pending |
| NOTA-09 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| KPI-01 | Phase 7 — Tableros KPI en vivo | Pending |
| KPI-02 | Phase 7 — Tableros KPI en vivo | Pending |
| KPI-03 | Phase 7 — Tableros KPI en vivo | Pending |
| KPI-04 | Phase 7 — Tableros KPI en vivo | Pending |
| KPI-05 | Phase 7 — Tableros KPI en vivo | Pending |
| KPI-06 | Phase 7 — Tableros KPI en vivo | Pending |
| RT-01 | Phase 7 — Tableros KPI en vivo | Pending |
| RT-02 | Phase 7 — Tableros KPI en vivo | Pending |
| MIG-01 | Phase 6 — Migración del histórico | Pending |
| MIG-02 | Phase 6 — Migración del histórico | Pending |
| MIG-03 | Phase 6 — Migración del histórico | Pending |
| AUD-01 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| AUD-02 | Phase 4 — Flujo de aprobación y auditoría | Pending |
| INFRA-01 | Phase 1 — Fundación segura y desplegada | Complete |
| INFRA-02 | Phase 1 — Fundación segura y desplegada | Complete |
| INFRA-03 | Phase 1 — Fundación segura y desplegada | Complete |
| INFRA-04 | Phase 8 — Endurecimiento y producción | Pending |

**Coverage:**
- v1 requirements: 41 total (el conteo previo de 38 era incorrecto — verificado por ID)
- Mapped to phases: 41 ✓
- Unmapped: 0
- Duplicados (un requisito en 2 fases): 0

**Por fase:**

| Phase | Requisitos |
|-------|-----------|
| 1. Fundación segura y desplegada | 7 |
| 2. Maestros y catálogos | 5 |
| 3. Bitácora diaria | 4 |
| 4. Flujo de aprobación y auditoría | 8 |
| 5. Nota Semanal PDF y firma | 5 |
| 6. Migración del histórico | 3 |
| 7. Tableros KPI en vivo | 8 |
| 8. Endurecimiento y producción | 1 |

---
*Requirements defined: 2026-07-25*
*Last updated: 2026-07-25 after roadmap creation (traceability mapped)*
