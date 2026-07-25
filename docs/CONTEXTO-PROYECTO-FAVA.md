# Proyecto: Control Técnico FAVA — Contexto completo y handoff

> Documento de traspaso. Contiene todo lo necesario para continuar el proyecto en una
> sesión/cuenta nueva sin pérdida de contexto. Última actualización: 2026-07-22.

---

## 0. Resumen en una línea

Construir una **aplicación web** que reemplaza un Excel de "Control Técnico" (14 hojas) y un PDF de
"Nota de Prestación Semanal", para gestionar los días trabajados por técnicos de campo por proyecto,
con 3 roles, aprobación, generación de PDF y KPIs en tiempo real. ~30 usuarios. Cliente usa Microsoft 365.

---

## 1. Cliente y dominio

- **Cliente:** FAVA Latino America S.A.S. (Bogotá, Colombia), filial de **FAVA SpA** (Italia).
  Por eso el Excel mezcla italiano y español (Resoconto, Viaggi, Cantiere, Montaggio, Collaudo, VENDUTO/ESEGUITO).
- **Negocio:** instalación y puesta en marcha de maquinaria industrial de pasta/molienda
  (líneas Pasta Larga, PC4500, CTA1000, PL6000, silos) en clientes de LatAm, EE.UU. y Europa
  (RD, Chile, Argentina, Brasil, Venezuela, Ecuador, México, USA, Grecia, Turquía).
- **Escala:** ~30 usuarios totales, ~15 técnicos. Carga baja → **monolito modular, NO microservicios**.

---

## 2. Archivos fuente (carpeta `C:/Users/maxim/Desktop/Andrea`)

| Archivo | Qué es |
|---|---|
| `2026_Control Técnico_VF .xls` | Excel de 14 hojas: bitácora diaria por técnico + tableros vendido/ejecutado por proyecto |
| `Reporte 02 - Ivan Cortés ... .pdf` | Ejemplo de la Nota de Prestación Semanal que el técnico entrega firmada al cliente |
| `Requerimientos-Tecnicos-Control-Tecnico-FAVA.pdf` | **Entregable v1** (requerimientos funcionales, 12 págs) generado por Claude |
| `CONTEXTO-PROYECTO-FAVA.md` | Este documento |

**Insight central:** el PDF semanal y el Excel diario contienen **el mismo dato capturado dos veces**.
El objetivo es **captura única**: el técnico registra el día una vez → se genera la Nota Semanal,
alimenta los KPIs y el control comercial por proyecto.

---

## 3. Análisis del Excel (14 hojas)

**Hojas núcleo `2025` (2.844 filas) y `2026` (4.745 filas)** — una fila por técnico por día:
`Técnico · Tipo(rol) · Proyecto · Máquina · Año · Mes · Día · Concepto(1-9) · Dato(código) · Novedad · Giorno(día semana)`

**Catálogo de conceptos (hoja `Parametros`):**

| Código | Significado |
|---|---|
| DC | Día completo — en fábrica |
| DFD | Día festivo/dominical — en fábrica |
| DVSF | Día de viaje — salida de fábrica |
| DVRC | Día de viaje — retorno a casa |
| LR | Libre remunerado (solo internos) |
| NR | No remunerado (solo externos) |
| MD | Medio día |
| IL | Reposo por incapacidad laboral |

**Hojas derivadas (todas son tablas dinámicas mantenidas a mano — la app las reemplaza por tableros vivos):**
- `Resoconto` → resumen general VENDUTO vs ESEGUITO vs DELTA por fase (Montaje/Colaudo) y rol.
- `Dettaglio anno 2025/2026` → conteo por proyecto → técnico → mes → concepto.
- `Calendar` → calendario de días de viaje del mes.
- `Viaggi` / `Viaggi (2)` → días de viaje por proyecto/técnico CON facturación (Euros, N° factura A-6xx, Fatturato FAVA SpA).
- `Cibao -Rep D`, `Lucchetti Chile`, `JAV Brasil`, `Pasta Sole - Ex Molino Fenix`, `J Macedo Brasil- final`
  → informe por proyecto con datos comerciales (N° OA, COMMESSA, valor contrato ~160.000) y VENDIDO/EJECUTADO/Delta por rol/fase.

**Técnicos (2026):** Leomar Klein, Ivan Cortes, Leomir Klein, Fredy Sarmiento, Luca Carraro, Andrea Scapin,
Vito Antonio Accini, Giuliano Lodi, Marco Bosi, Diego Bautista, Felice Ruocco, Camilo Cruz, Felipe Sena.

---

## 4. Análisis del PDF (Nota de Prestación Semanal)

Encabezado: Cliente, NIT, Localidad, Suministro, Contrato, Maquinaria, Cargo durante la semana, Técnico.
Cuerpo: 7 filas (una por día de la semana) con Fecha, Día, Descripción trabajos, Categoría (Día completo/
Festivo), Nota (= n° contrato). Luego: tabla de Gastos sostenidos por el técnico (Descripción/Fecha/Valor),
Anticipo del cliente, declaración de conformidad del cliente, y **firmas** (técnico + cliente) + fecha/timbre.

---

## 5. Problemas de calidad de datos detectados (resolver en migración)

| Problema real en el Excel | Acción en migración |
|---|---|
| Mismo técnico con 3 grafías: `Leomar Klein` / `Leomir Klein` / `Leomir Kleir` | Maestro de técnicos con mapa de alias |
| Roles sin estandarizar: 11 variantes (`Electtricista`, `Eletrico`, `Elettrico`, `Técnico Eléctrico`, `Eléctrico Senior`…) | Mapear al catálogo de roles |
| Proyectos duplicados entre años: `GRUPO BOCEL-RD` (2025) = `MOLINO CIBAO BOCEL - RD` (2026); `LUCCHETTI CHILE SA` vs `..._Ch` | Consolidar maestro de proyectos por cliente |
| Catálogo ambiguo: `LR` asignado a 2 conceptos (código 4 y 5); en datos 2025 aparece `NR` | Fijar catálogo único y reclasificar histórico |
| Campo Máquina texto libre con separadores mixtos (`CTA1000,PC4500` / `CTA1000/PL6000`) | Normalizar a lista de máquinas por proyecto |
| Deltas vendido/ejecutado calculados a mano, con errores aritméticos visibles | Recalcular por sistema |
| ~1.009 filas 2026 sin concepto (fechas futuras pre-cargadas) | Normal; no pre-cargar días ociosos en la app |

---

## 6. Los 3 roles y matriz de permisos

`T` = Técnico · `A` = Administrador · `S` = Super Admin

| Capacidad | T | A | S |
|---|:-:|:-:|:-:|
| Registrar su propia bitácora diaria | ✔ | ✔ | ✔ |
| Generar y firmar su Nota Semanal (PDF) | ✔ | ✔ | ✔ |
| Ver sus propios días, proyectos y viajes | ✔ | ✔ | ✔ |
| Ver la bitácora de otros técnicos | — | ✔ | ✔ |
| Validar / aprobar / devolver registros | — | ✔ | ✔ |
| Crear y editar proyectos (y días vendidos) | — | ✔ | ✔ |
| ABM de técnicos y catálogos | — | ✔ | ✔ |
| Gestionar usuarios y accesos (altas/bajas) | — | ✔ | ✔ |
| Ver todos los reportes PDF subidos | — | ✔ | ✔ |
| Tableros de KPIs globales | — | parcial | ✔ |
| Asignar rol Administrador a otros | — | — | ✔ |
| Configuración global y exportaciones maestras | — | — | ✔ |

---

## 7. Decisiones CONFIRMADAS por el cliente

1. **Días vendidos** se definen **por proyecto**; el **Administrador** los carga al **crear el proyecto**.
2. **Aprobación:** el Administrador **valida** antes de que el dato cuente para KPIs / Nota definitiva.
3. **Firma del cliente:** se **digita/firma dentro de la app** (firma digital, no papel).
4. **Exportación:** operación en **tiempo real** + exportaciones a demanda (Excel/PDF) para la casa matriz italiana.
5. **Histórico:** se **migra todo** (2025 + 2026), con limpieza de datos.
6. **Autenticación:** **Microsoft 365 / Entra ID** para los ~30 usuarios.

---

## 8. Pendientes por definir (NO bloquean el MVP)

- **Fórmula de facturación de días de viaje** (hoja Viaggi, importes en €): no se deduce de los datos. Falta la regla.
- **Interno vs. externo** por técnico (define si aplica `LR` o `NR`): confirmar maestro de vínculos.
- **Granularidad de días vendidos:** las hojas de proyecto los abren por rol y fase — confirmar si se cargan así o totales.
- **Gastos/anticipos** de la Nota: ¿solo informativos o disparan flujo de reembolso?

---

## 9. Stack técnico DECIDIDO

**NestJS (backend, TypeScript) + React (frontend, TS, Vite) + PostgreSQL (Prisma ORM) + Entra ID SSO (MSAL/passport) + SSE para tiempo real.**
Monolito modular. Hosting orientado a Azure (coherencia con el tenant Microsoft del cliente).

Por qué PostgreSQL: datos relacionales/tabulares (fila por técnico/día), KPIs = agregaciones nativas,
Row-Level Security + pgAudit para seguridad, JSONB para gastos/anticipos.

Por qué NO tiempo real pesado: para 30 usuarios, **SSE + refetch tras mutación** es suficiente.
WebSocket/SignalR solo si luego piden edición colaborativa. No sobre-construir.

---

## 10. Esquema de datos (tablas núcleo)

```
role_types        (id, name)                         -- catálogo: Mecánico, Meccatronico…
concepts          (id, code, description, category)  -- DC, DFD, DVSF, DVRC, LR, NR, MD, IL
clients           (id, name, country, nit)
users             (id, entra_oid, email, name, role, technician_id?, is_active)
technicians       (id, full_name, role_type_id, employment_type, is_active)  -- interno/externo
projects          (id, client_id, name, oa_number, commessa, contract_value, currency, status, created_by)
project_sold_days (id, project_id, role_type_id, phase, sold_days)  -- días vendidos por rol/fase
machines          (id, project_id, code, description)
daily_entries     (id, technician_id, date, project_id?, machine_id?, concept_id,
                   description, status, weekly_note_id?, created_by, approved_by?, created_at, updated_at)
weekly_notes      (id, technician_id, project_id, week_start, week_end, status,
                   client_name, expenses JSONB, client_signature, signed_at, pdf_url,
                   submitted_at, approved_by?, approved_at?)
trips             (id, technician_id, project_id, month, days, concept_id, invoice_number, amount_eur)
audit_log         (id, actor_user_id, action, entity, entity_id, before JSONB, after JSONB, at)
```

**Reglas clave:**
- `UNIQUE(daily_entries.technician_id, date)` → una fila por técnico por día.
- `status` enum: `draft → submitted → approved / returned`.
- FKs a catálogos controlados → elimina de raíz los problemas de calidad de datos.
- Todo cambio de estado escribe en `audit_log`.

---

## 11. Endpoints (REST, bajo `/api`)

`T`=Técnico, `A`=Admin, `S`=Super Admin

| Método | Ruta | Qué hace | Rol |
|---|---|---|---|
| GET | `/api/me` | Perfil + rol del usuario logueado | T A S |
| GET/POST | `/api/users` | Listar / invitar usuarios | A S |
| PATCH | `/api/users/:id` | Cambiar rol, activar/desactivar | A S |
| PATCH | `/api/users/:id` (rol=admin) | Asignar rol Admin | **S** |
| GET/POST | `/api/technicians` | Listar / crear técnicos (GET propio: T) | A S / T |
| PATCH | `/api/technicians/:id` | Editar / dar de baja | A S |
| GET | `/api/catalogs/concepts` · `/role-types` | Catálogos para formularios | T A S |
| GET/POST | `/api/projects` | Listar / crear proyecto (con días vendidos) | A S |
| PATCH | `/api/projects/:id` | Editar proyecto, máquinas, días vendidos | A S |
| GET/POST | `/api/daily-entries` | Ver / registrar días (T solo los suyos) | T A S |
| PATCH/DELETE | `/api/daily-entries/:id` | Editar borrador propio | T A S |
| GET/POST | `/api/weekly-notes` | Listar / crear Nota Semanal | T A S |
| POST | `/api/weekly-notes/:id/submit` | Técnico envía a revisión | T |
| POST | `/api/weekly-notes/:id/approve` | Admin aprueba | A S |
| POST | `/api/weekly-notes/:id/return` | Admin devuelve con comentario | A S |
| POST | `/api/weekly-notes/:id/sign` | Registrar firma digital del cliente | T A S |
| GET | `/api/weekly-notes/:id/pdf` | Generar/descargar el PDF | T A S |
| GET | `/api/dashboards/kpis` | Métricas (vendido/ejecutado, utilización…) | A(parcial) S |
| GET | `/api/exports/:type` | Exportar a Excel/PDF formato matriz | A S |
| GET | `/api/audit` | Bitácora de auditoría | S |

**Importante:** `submit`/`approve`/`return`/`sign` son **endpoints de transición de estado**, no un
`PATCH status` genérico — cada uno valida reglas (p. ej. no aprobar una nota sin sus 7 días) y deja rastro en auditoría.

---

## 12. Seguridad

**Autenticación:** Entra ID (OIDC) único proveedor; la app no guarda contraseñas; baja en el directorio = pierde acceso.

**Autorización (defensa en profundidad, 2 capas):**
- App: middleware RBAC por los 3 roles en cada endpoint (`@Roles(...)`).
- Motor: **Row-Level Security en Postgres** — el técnico físicamente no puede leer filas de otro, aunque haya un bug de código.

**Protección de la base de datos:**
- No expuesta a internet (red privada/VNet, firewall solo al backend).
- Credenciales en **Azure Key Vault** / Managed Identity, rotadas. Cero secretos en el repo.
- Usuario de BD con mínimo privilegio (sin DDL en runtime).
- Cifrado TLS en tránsito + en reposo (TDE).
- Backups automáticos con point-in-time recovery + restauración de prueba periódica.
- pgAudit + tabla `audit_log`.

**Capa de app:** consultas parametrizadas/ORM (sin SQLi), validación de entrada (zod), cabeceras de seguridad
(helmet), CORS restringido, rate limiting, PDFs en storage privado con signed URLs de expiración corta,
validación de archivos subidos.

---

## 13. Tiempo real

"Tiempo real" = cuando el Admin aprueba, la bandeja y los KPIs se actualizan sin recargar.
**Solución elegida:** SSE (Server-Sent Events) para la bandeja de aprobación + refetch tras mutación.
Suficiente para 30 usuarios. No websockets pesados por ahora.

---

## 14. Estructura del proyecto (NestJS + React)

```
fava-control-tecnico/
├─ backend/                       # NestJS + TypeScript
│  ├─ prisma/
│  │  ├─ schema.prisma            # tablas de la §10
│  │  ├─ migrations/
│  │  └─ seed.ts                  # catálogos: concepts, role_types
│  ├─ src/
│  │  ├─ main.ts                  # bootstrap, helmet, CORS, rate-limit
│  │  ├─ app.module.ts
│  │  ├─ common/
│  │  │  ├─ auth/
│  │  │  │  ├─ jwt.strategy.ts    # valida token de Entra ID
│  │  │  │  ├─ roles.guard.ts     # RBAC: @Roles('admin')
│  │  │  │  └─ rls.middleware.ts  # fija el técnico en la sesión Postgres (RLS)
│  │  │  ├─ audit/                # interceptor → audit_log
│  │  │  └─ prisma/prisma.service.ts
│  │  ├─ modules/
│  │  │  ├─ users/                # invitar, rol, alta/baja
│  │  │  ├─ technicians/          # ABM técnicos + catálogo de roles
│  │  │  ├─ projects/             # proyectos + días vendidos + máquinas
│  │  │  ├─ catalogs/             # concepts, role-types (solo lectura)
│  │  │  ├─ daily-entries/        # bitácora diaria (núcleo)
│  │  │  ├─ weekly-notes/         # Nota Semanal: submit/approve/return/sign/pdf
│  │  │  │  └─ pdf/               # generación PDF (plantilla del formato actual)
│  │  │  ├─ dashboards/           # queries de KPIs (agregaciones)
│  │  │  ├─ trips/                # viajes (Fase 2)
│  │  │  ├─ exports/              # Excel/PDF matriz (Fase 2)
│  │  │  └─ realtime/             # SSE
│  │  └─ config/                  # env validado (zod), Key Vault
│  └─ test/                       # e2e por módulo
│
├─ frontend/                      # React + TypeScript (Vite)
│  ├─ src/
│  │  ├─ lib/api/                 # cliente tipado del backend
│  │  ├─ lib/auth/                # MSAL React (login Entra)
│  │  ├─ routes/
│  │  │  ├─ tecnico/              # captura semanal, mis días, mis notas
│  │  │  ├─ admin/                # bandeja aprobación, proyectos, técnicos, usuarios
│  │  │  └─ super/                # KPIs globales, auditoría, config
│  │  ├─ features/                # bitácora, notas, proyectos, dashboards
│  │  └─ components/              # UI compartida
│  └─ ...
│
├─ docker-compose.yml             # postgres local para desarrollo
└─ README.md
```

Decisiones: un módulo por dominio (no por capa); guard de roles + middleware RLS globales;
interceptor de auditoría transversal; `trips`/`exports` son stubs de Fase 2 (no código muerto).

---

## 15. Alcance por fases

- **MVP (Entrega 1):** bitácora diaria + captura semanal · flujo de aprobación · Nota Semanal PDF + firma digital ·
  ABM proyectos/técnicos/usuarios · SSO Microsoft · tableros vendido/ejecutado y utilización · migración del histórico.
- **Fase 2 (Comercial y matriz):** módulo de viajes con facturación · exportaciones formato casa matriz ·
  tableros económicos avanzados · reportes por cliente/país.
- **Fase 3 (Inteligencia operativa):** alertas de desviación de proyecto · planeación de asignación de técnicos ·
  notificaciones (reportes por vencer).

---

## 16. Próximos pasos sugeridos (en orden)

1. **Escribir `schema.prisma`** concreto (tablas con tipos, enums, relaciones) — fija el contrato de datos. *(recomendado siguiente)*
2. **Scaffold del repo** (NestJS + React + Prisma + docker-compose).
3. **Script de migración** del Excel 2025/2026 con las reglas de limpieza de la §5 + reporte de conciliación
   (totales Excel vs. app, para que FAVA valide que ningún día se perdió ni duplicó).
4. Implementar módulos MVP en orden: catálogos → técnicos → proyectos → daily-entries → weekly-notes → dashboards.

---

## 17. Herramienta para leer el Excel (referencia)

El `.xls` es formato OLE2/BIFF antiguo. Se leyó con Python:
```
pip install xlrd
python -c "import xlrd; wb=xlrd.open_workbook('control.xls', on_demand=True); print(wb.sheet_names())"
```
(La generación del PDF de requerimientos v1 se hizo renderizando HTML con Chrome headless `--print-to-pdf`.)
