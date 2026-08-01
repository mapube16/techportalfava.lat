# Control Técnico FAVA

## What This Is

Aplicación web que reemplaza el Excel de 14 hojas y la Nota de Prestación Semanal en PDF de FAVA Latino America S.A.S. (filial de FAVA SpA, Italia). Los técnicos de campo registran su jornada una sola vez; de ahí se generan la Nota Semanal firmada por el cliente, los KPIs en tiempo real y el control comercial vendido/ejecutado por proyecto. ~30 usuarios hoy, dimensionada para ~50 en producción.

El **frontend React ya existe** (`fava-control-tecnico/frontend/`, datos mock): 11 pantallas, roles T/A/S, ES/IT, tema claro/oscuro, firma canvas, logo oficial. Esta etapa construye el **backend NestJS** y conecta el frontend a datos reales.

## Core Value

Captura única: el técnico registra el día una vez → Nota Semanal + KPIs + control comercial salen solos, sin doble digitación ni tablas dinámicas manuales. Si todo lo demás falla, la bitácora diaria con flujo de aprobación debe funcionar.

## Requirements

### Validated

- ✓ Frontend React+TS (Vite) con 11 pantallas, 3 roles, ES/IT, claro/oscuro — existente (mock)
- ✓ Diseño aprobado en Claude Design con identidad FAVA (logo oficial integrado) — existente
- ✓ Análisis completo del Excel fuente (14 hojas, 7.589 filas) y del formato de Nota Semanal — documentado

### Active

- [ ] Backend NestJS modular (un módulo por dominio, cada uno en su carpeta) + PostgreSQL/Prisma
- [ ] Autenticación Microsoft Entra ID real desde el inicio (tenant dev propio → tenant FAVA vía env vars)
- [ ] Bitácora diaria con flujo draft → submitted → approved/returned; registros bloqueados al enviar
- [ ] Nota Semanal PDF **fiel al formato real**: NIT, localidad, suministro, contrato, cargo semanal, columna NOTA, gastos, anticipos del cliente, declaración de conformidad, firma técnico + firma/timbre cliente
- [ ] KPIs con **Nivo** (reemplaza ECharts): vendido/ejecutado, utilización, distribución por concepto, días por cliente/país, estado de reportes
- [ ] Tiempo real vía SSE: bandeja y tableros se actualizan sin recargar
- [ ] Migración del histórico 2025+2026 con limpieza (alias técnicos, roles, proyectos duplicados, catálogo LR/NR, máquinas texto libre) + reporte de conciliación Excel vs. app
- [ ] Frontend conectado al API (adiós mocks); auditoría; RBAC + RLS
- [ ] Deploy en Railway (app + Postgres)
- [ ] Edge cases resueltos: técnico con 2 proyectos por semana, zonas horarias, corrección post-aprobación, baja de técnico con notas pendientes, concepto "Sin Proyecto"

### Out of Scope

- Nómina/liquidación salarial — la app entrega insumos, no calcula sueldos (documento §02)
- Contabilidad/facturación fiscal — la factura la emite el sistema de la matriz
- Inventario de repuestos / logística — fuera del dominio
- Módulo viajes con facturación (hoja Viaggi) — Fase 2; fórmula de € por día de viaje aún sin definir por el cliente
- Exportaciones formato casa matriz (Resoconto/Dettaglio/Viaggi) — Fase 2
- Alertas de desviación y planeación de técnicos — Fase 3
- Traducción automática de contenido libre ES↔IT — el toggle UI/catálogos existente es suficiente (decisión 2026-07-25)
- WebSockets/edición colaborativa — SSE alcanza para esta escala

## Context

- **Fuentes:** `CONTEXTO-PROYECTO-FAVA.md` (handoff completo), `Requerimientos-Tecnicos-Control-Tecnico-FAVA.pdf` (v1.0 para validación), `Reporte 02 - Ivan Cortés...pdf` (formato real de Nota Semanal), `2026_Control Técnico_VF .xls` (datos fuente).
- **Esquema de datos ya diseñado** (CONTEXTO §10): users, technicians, projects, project_sold_days (rol×fase), machines, daily_entries (UNIQUE técnico+fecha), weekly_notes, trips, audit_log.
- **Endpoints ya diseñados** (CONTEXTO §11): REST bajo /api, transiciones de estado como endpoints propios (submit/approve/return/sign), no PATCH status genérico.
- **Hallazgos de revisión 2026-07-25:** el formato real de Nota tiene campos que el mock no captura (cargo varía por semana; anticipos; doble firma); KPIs del PDF §07 incluyen tableros que el frontend aún no tiene; falta vista calendario de bitácora; falta bloqueo de registros enviados.
- **Técnicos capturan desde el móvil en planta** (conectividad variable); admins desde escritorio.

## Constraints

- **Tech stack**: NestJS + TypeScript, React (existente), PostgreSQL + Prisma, Nivo para gráficos — decidido en CONTEXTO §9 + decisión Nivo 2026-07-25
- **Arquitectura**: monolito modular, un módulo por dominio en su propia carpeta, legible — pedido explícito; NO microservicios (~50 usuarios)
- **Auth**: Entra ID real desde el inicio; tenant dev propio hasta que FAVA entregue acceso; cambio = solo variables de entorno
- **Hosting**: Railway (app + Postgres) — decisión 2026-07-25; Railway bloquea SMTP saliente (usar Resend u otro API si hay email)
- **Cuenta cloud**: se crea con la cuenta personal del dev; migrará a cuenta de empresa cuando exista. Implica: cero config manual sin documentar — todo scripteado o anotado (Dockerfile, railway.toml, env vars, migraciones) para que el traspaso sea transferir el proyecto o recrear + restore, sin arqueología
- **Producción**: ~50 personas, fiabilidad sobre performance; decenas de miles de registros/año
- **Seguridad**: RBAC en app + Row-Level Security en Postgres, auditoría de toda transición, PDFs en storage privado con URLs firmadas (CONTEXTO §12)
- **Idioma**: interfaz ES/IT (toggle existente); tolerar términos italianos heredados en catálogos y exportaciones

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Backend + conectar frontend en esta etapa | App funcional de punta a punta, no solo API | — Pending |
| Entra ID real desde el inicio (tenant dev) | Evita re-trabajo del stub; swap a tenant FAVA por env | — Pending |
| Migración histórico en esta etapa | Es parte del MVP; KPIs sin histórico no sirven | — Pending |
| Railway como hosting | Deploy rápido sin depender del cliente; experiencia previa | — Pending |
| Nivo reemplaza ECharts en KPIs | KPIs actuales "se ven feos"; Nivo tiene los mejores defaults sin Tailwind | — Pending |
| Nota Semanal formato fiel completo | El PDF debe ser aceptable por los clientes finales de FAVA | — Pending |
| Gastos/anticipos solo informativos en v1 | Default del documento §12; no bloquea MVP | — Pending |
| Días vendidos por rol×fase | Como las hojas de proyecto y el frontend actual | — Pending |
| SSE (no WebSockets) para tiempo real | Suficiente para ~50 usuarios (CONTEXTO §13) | — Pending |
| Railway con cuenta personal, migrar a cuenta empresa después | La cuenta de empresa aún no existe; setup 100% reproducible hace la migración trivial | — Pending |
| Contrato (OA, commessa, valor) vive en la MÁQUINA, no en el proyecto (2026-07-26) | Las hojas del Excel lo demuestran: JAV Marata tiene 3 líneas con 3 OA y 3 valores distintos. Ver HALLAZGOS-EXCEL-HOJAS-PROYECTO.md | — Pending |
| ~~Días vendidos llevan técnico titular~~ **CORREGIDA 2026-07-28** | La grabación de Andrea lo explica: el vendido sale de la cotización y es POR ROL cubriendo N personas («en este caso son dos mecánicos», 10/144/104). El nombre en la celda es quién fue asignado, no un titular con cuota propia. Modelar: personas vendidas por rol + asignación aparte | ⚠️ Revisar |
| La bitácora debe capturar la COMMESSA, no solo la máquina (2026-07-28) | Andrea: «las máquinas se llaman igual pero tienen commessa diferente» (JAV tiene dos PL 6000, commesse 3428 y 3429). Hoy solo el 5,6% de las filas de 2026 dice máquina y la commessa no se registra en ningún sitio: por eso ella atribuye a mano | — Pending |
| Catálogo de máquinas: instancia contratada, no modelo (2026-07-28) | Cada línea contratada es una entidad con su commessa, OA y valor. `machine_models` como catálogo de modelos no distingue dos PL 6000 del mismo proyecto | — Pending |
| ~~Catálogo de roles amplía a Supervisore, Software y Test~~ **REVERTIDA 2026-07-28** | El usuario corrigió: no son roles nuevos, son la ESPECIALIDAD del técnico (columna `Tipo` de las hojas diarias). No se añade nada al catálogo hasta terminar la lectura completa del Excel | ✗ Revertida |
| KPIs incluyen las dos cuadrículas del Excel (KPI-07 y KPI-08) (2026-07-26) | Reemplazan el Dettaglio y el Resoconto, que hoy se mantienen a mano | — Pending |
| Login de desarrollo temporal en vez de tenant Entra propio (2026-07-25) | El dev no tiene tenant (lo que ve es el "Microsoft Services tenant" del sistema, sin directorio). Crear uno exige cuenta Azure con tarjeta, y la verificación habría que repetirla con el tenant real de FAVA. El guard de Entra ya está probado con 12 unit + 45 e2e | — Pending |

---
*Last updated: 2026-07-25 after initialization*
