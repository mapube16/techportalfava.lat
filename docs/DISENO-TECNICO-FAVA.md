# Control Técnico FAVA — Diseño técnico (endpoints, stack, seguridad)

> Complementa `CONTEXTO-PROYECTO-FAVA.md`. Aquí se detallan: (1) el ajuste de stack/nube
> al presupuesto real (~US$20/mes en Railway), (2) el modelo RBAC **multi-rol**, (3) los
> endpoints por rol, (4) la arquitectura de protección de datos para producción.
> Última actualización: 2026-07-23.

---

## 0. Cambios respecto al contexto original

El documento de contexto asumía Azure. Con el presupuesto real y el despliegue en Railway, se
ajustan **hosting, secretos y red**, pero se conservan **PostgreSQL, RLS, NestJS, React y Entra ID**.

| Tema | Contexto original (Azure) | Decisión ajustada (Railway ~US$20/mes) |
|---|---|---|
| Hosting backend | Azure App Service | **Railway** (servicio Node/NestJS) |
| Base de datos | Azure Postgres Flexible | **Railway PostgreSQL** (red privada de Railway) |
| Frontend | Azure Static Web Apps | **Cloudflare Pages** (gratis, fuera del presupuesto) |
| CDN / WAF / anti-DDoS | Azure Front Door | **Cloudflare** (plan gratuito, proxy delante de todo) |
| Almacenamiento de PDFs | Azure Blob + signed URL | **Cloudflare R2** (10 GB gratis) + signed URL |
| Secretos | Azure Key Vault + Managed Identity | **Variables/secretos de Railway** (ver §5, con sus límites) |
| Identidad (SSO) | Entra ID | **Entra ID (sin cambios)** — es solo el IdP, es gratis con M365 |

**Punto clave:** Entra ID como proveedor de identidad **no** depende de hostear en Azure. El cliente ya
paga Microsoft 365; usarlo como IdP OIDC desde Railway no cuesta extra. Así se conserva el SSO
confirmado por el cliente sin salir del presupuesto.

### Presupuesto estimado (mensual)

| Componente | Costo |
|---|---|
| Railway (backend + Postgres, tráfico bajo, ~30 usuarios) | ~US$10–20 |
| Cloudflare (DNS, proxy, WAF, rate-limit, Pages) | US$0 (plan free) |
| Cloudflare R2 (PDFs, <10 GB) | US$0 |
| Entra ID (SSO con M365 existente) | US$0 |
| **Total** | **≈ US$10–20/mes** |

> ⚠️ Railway es facturación por uso; con ~30 usuarios el consumo es bajo, pero hay que **poner
> alertas de gasto** y un tope. El frontend en Cloudflare Pages evita gastar cómputo de Railway en
> servir estáticos.

---

## 1. Modelo de roles: multi-rol asignado por el administrador

Cada usuario puede acumular **varios roles**; el permiso efectivo es la **unión** de todos sus roles.
Los roles los **asigna el administrador** (con una restricción jerárquica).

- Modelado como **muchos-a-muchos**: `users` — `user_roles` — `roles` (ver `backend/prisma/schema.prisma`).
- Cada asignación guarda **quién la hizo** (`assigned_by`) y **cuándo** → auditable.
- Regla de escalamiento (validada en el endpoint, no solo en UI):
  - **Admin** puede asignar/quitar el rol **Técnico**.
  - **Solo Super Admin** puede asignar/quitar **Admin** o **Super Admin**.
- Un usuario con rol **Técnico** se enlaza a su ficha `technicians` (`users.technician_id`).

**Permiso efectivo** = ¿alguno de mis roles habilita esta capacidad? Se implementa con un guard
`@Roles('ADMIN','SUPER_ADMIN')` que comprueba intersección entre los roles del usuario y los permitidos.

---

## 2. Endpoints por rol

Convención: `T` = Técnico · `A` = Admin · `S` = Super Admin. Base: `/api`. Un usuario con varios
roles obtiene la unión de las columnas marcadas.

### 2.1 Identidad y usuarios

| Método | Ruta | Qué hace | T | A | S |
|---|---|---|:-:|:-:|:-:|
| GET | `/api/me` | Perfil + **lista de roles** del usuario logueado | ✔ | ✔ | ✔ |
| GET | `/api/users` | Listar usuarios (paginado) | — | ✔ | ✔ |
| POST | `/api/users/invite` | Invitar usuario (se crea al primer login Entra) | — | ✔ | ✔ |
| PATCH | `/api/users/:id` | Activar/desactivar, editar datos | — | ✔ | ✔ |
| GET | `/api/users/:id/roles` | Ver roles asignados de un usuario | — | ✔ | ✔ |
| POST | `/api/users/:id/roles` | **Asignar** rol (Técnico → A; Admin/Super → **S**) | — | ✔* | ✔ |
| DELETE | `/api/users/:id/roles/:roleId` | **Quitar** rol (misma regla jerárquica) | — | ✔* | ✔ |

`✔*` = Admin solo puede gestionar el rol **Técnico**; asignar Admin/Super Admin exige Super Admin.

### 2.2 Catálogos y maestros

| Método | Ruta | Qué hace | T | A | S |
|---|---|---|:-:|:-:|:-:|
| GET | `/api/catalogs/concepts` | Conceptos (DC, DFD, …) para formularios | ✔ | ✔ | ✔ |
| GET | `/api/catalogs/role-types` | Tipos de rol técnico | ✔ | ✔ | ✔ |
| GET | `/api/technicians` | Listar técnicos (T: solo su ficha) | ✔ | ✔ | ✔ |
| POST | `/api/technicians` | Crear técnico | — | ✔ | ✔ |
| PATCH | `/api/technicians/:id` | Editar / dar de baja | — | ✔ | ✔ |
| GET | `/api/clients` · `POST` | Listar / crear clientes | — | ✔ | ✔ |

### 2.3 Proyectos

| Método | Ruta | Qué hace | T | A | S |
|---|---|---|:-:|:-:|:-:|
| GET | `/api/projects` | Listar proyectos (T: solo en los que participa) | ✔ | ✔ | ✔ |
| GET | `/api/projects/:id` | Detalle + máquinas + días vendidos | ✔ | ✔ | ✔ |
| POST | `/api/projects` | Crear proyecto **con días vendidos por rol/fase** | — | ✔ | ✔ |
| PATCH | `/api/projects/:id` | Editar proyecto / máquinas / días vendidos | — | ✔ | ✔ |

### 2.4 Bitácora diaria (núcleo)

| Método | Ruta | Qué hace | T | A | S |
|---|---|---|:-:|:-:|:-:|
| GET | `/api/daily-entries` | Listar (T: **solo las suyas**, forzado por RLS) | ✔ | ✔ | ✔ |
| POST | `/api/daily-entries` | Registrar un día (respeta `UNIQUE(técnico,fecha)`) | ✔ | ✔ | ✔ |
| PATCH | `/api/daily-entries/:id` | Editar **borrador propio** | ✔ | ✔ | ✔ |
| DELETE | `/api/daily-entries/:id` | Borrar borrador propio | ✔ | ✔ | ✔ |

### 2.5 Nota Semanal (transiciones de estado)

| Método | Ruta | Qué hace | T | A | S |
|---|---|---|:-:|:-:|:-:|
| GET | `/api/weekly-notes` | Listar (T: propias; A/S: todas) | ✔ | ✔ | ✔ |
| POST | `/api/weekly-notes` | Crear nota a partir de los 7 días | ✔ | ✔ | ✔ |
| POST | `/api/weekly-notes/:id/submit` | Técnico envía a revisión | ✔ | — | — |
| POST | `/api/weekly-notes/:id/approve` | Admin aprueba (valida los 7 días) | — | ✔ | ✔ |
| POST | `/api/weekly-notes/:id/return` | Admin devuelve con comentario | — | ✔ | ✔ |
| POST | `/api/weekly-notes/:id/sign` | Registrar **firma digital** del cliente | ✔ | ✔ | ✔ |
| GET | `/api/weekly-notes/:id/pdf` | Generar/descargar PDF (signed URL) | ✔ | ✔ | ✔ |

> `submit`/`approve`/`return`/`sign` son **endpoints de transición**, no un `PATCH status` genérico:
> cada uno valida reglas (p. ej. no aprobar sin los 7 días) y escribe en `audit_log`.

### 2.6 KPIs, exportaciones y auditoría

| Método | Ruta | Qué hace | T | A | S |
|---|---|---|:-:|:-:|:-:|
| GET | `/api/dashboards/kpis` | Vendido/ejecutado, utilización | — | ✔ (parcial) | ✔ |
| GET | `/api/exports/:type` | Exportar Excel/PDF formato matriz | — | ✔ | ✔ |
| GET | `/api/realtime/stream` | Canal **SSE** (bandeja/KPIs en vivo) | ✔ | ✔ | ✔ |
| GET | `/api/audit` | Bitácora de auditoría | — | — | ✔ |

---

## 3. Stack decidido

- **Backend:** NestJS + TypeScript. Monolito modular (un módulo por dominio).
- **ORM/DB:** Prisma + PostgreSQL (Railway). Migraciones versionadas.
- **Frontend:** React + TypeScript (Vite) + MSAL para login Entra. Desplegado en Cloudflare Pages.
- **Auth:** Entra ID (OIDC). El backend valida el JWT (JWKS de Entra); no hay contraseñas locales.
- **Tiempo real:** SSE + refetch tras mutación (suficiente para ~30 usuarios).
- **Archivos:** PDFs de notas en Cloudflare R2, acceso por signed URL de expiración corta.
- **Borde:** Cloudflare delante de Railway (DNS proxied) → TLS, WAF, rate-limit, anti-DDoS.

---

## 4. Arquitectura de protección de datos

Defensa en profundidad: cada amenaza se ataca en más de una capa.

### 4.1 SQL Injection
- **Prisma** genera consultas parametrizadas; se prohíbe `$queryRawUnsafe`. Cualquier `\$queryRaw`
  necesario va parametrizado y revisado en PR.
- **Validación de entrada con Zod** en cada endpoint (tipos, rangos, longitudes) antes de tocar la BD.
- Usuario de BD de aplicación con **privilegio mínimo** (sin DDL en runtime).

### 4.2 Autorización (2 capas)
- **App:** guard RBAC multi-rol (`@Roles(...)`) en cada endpoint.
- **Motor:** **Row-Level Security en Postgres** — el técnico físicamente no puede leer filas de otro,
  aunque haya un bug de código. Se fija `SET app.current_technician` por request en un middleware.

### 4.3 DoS / DDoS ("dedos")
- **Cloudflare** delante de todo: mitigación DDoS L3/L7, reglas de WAF y **rate-limiting** por IP/ruta.
- **Rate-limit en la app** (`@nestjs/throttler`) como segunda barrera, más estricto en `login`,
  `submit`, `approve` y generación de PDF.
- Límite de tamaño de payload y timeouts de request; paginación obligatoria en listados.

### 4.4 Superficie y red
- La **base de datos no se expone a internet**: se accede por la **red privada de Railway**; el único
  servicio público es el backend, y este va detrás de Cloudflare.
- **CORS** restringido al dominio del frontend. **Helmet** para cabeceras de seguridad (CSP, HSTS…).

### 4.5 Secretos
- En Railway: **variables de entorno / secretos del proyecto** (no en el repo; `.env` está en `.gitignore`).
- Limitación honesta vs. Azure Key Vault: Railway no rota secretos automáticamente → se documenta un
  **procedimiento de rotación manual** (DB, client secret de Entra, llaves R2) y accesos mínimos al panel.

### 4.6 Datos en tránsito y en reposo
- **TLS** de extremo a extremo (Cloudflare ↔ Railway ↔ Postgres).
- Cifrado en reposo del volumen gestionado de Railway. PDFs en R2 privado (sin acceso público).

### 4.7 Auditoría y respaldo
- Tabla `audit_log` inmutable + interceptor NestJS: registra actor, acción, entidad, antes/después, IP.
- **Backups:** snapshots de Railway **+** `pg_dump` periódico a R2 como copia externa (defensa ante
  fallo del proveedor). Prueba de restauración periódica.

### 4.8 Archivos subidos
- Validación de tipo/tamaño de firmas y adjuntos; almacenamiento privado; servido solo por signed URL.

---

## 5. Riesgos abiertos del presupuesto Railway (a validar contigo)

1. **Sin VNet ni Key Vault nativos:** se compensa con red privada de Railway + secretos + rotación
   manual. Aceptable para ~30 usuarios; revisable si el cliente exige controles Azure.
2. **PITR limitado:** Railway no ofrece point-in-time recovery fino como Azure; se mitiga con
   `pg_dump` frecuente a R2. Definir **RPO/RTO** aceptables.
3. **Tope de gasto:** configurar alerta y límite en Railway para no exceder los US$20.

---

## 6. Próximos pasos

1. **Auditar este modelo** (`backend/prisma/schema.prisma`) y estos endpoints. ← *estás aquí*
2. Escribir la **migración RLS** (políticas por técnico) junto a la migración inicial de Prisma.
3. Scaffold del repo (NestJS + React + Prisma + docker-compose para Postgres local).
4. Seed de catálogos (`concepts`, `role_types`, `roles`).
5. Script de migración del Excel 2025/2026 con reglas de limpieza (§5 del contexto) + conciliación.
6. Implementar módulos MVP: catálogos → técnicos → proyectos → daily-entries → weekly-notes → dashboards.
