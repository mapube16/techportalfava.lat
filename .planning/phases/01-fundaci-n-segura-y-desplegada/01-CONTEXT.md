# Phase 1: Fundación segura y desplegada - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Login Microsoft Entra real (tenant dev, swap a FAVA por env), RBAC 3 roles + RLS en Postgres, scaffold NestJS modular, primer deploy en Railway, y frontend cableado en Login/Layout (usuario y rol reales vía cliente API tipado + MSAL React). Requisitos: AUTH-01..04, INFRA-01..03. Los CRUD de dominio, bitácora, notas, KPIs son fases posteriores.

</domain>

<decisions>
## Implementation Decisions

### Acceso de usuarios nuevos
- Usuario con cuenta Microsoft válida pero no invitado → pantalla «sin acceso»: muestra el nombre de su cuenta MS, «tu cuenta no está habilitada», botón salir. NO auto-registro — solo Admin da altas (matriz §6).
- La pantalla incluye botón **«solicitar acceso»**: crea una solicitud que los Admins ven en la pantalla de Usuarios (lista/badge de solicitudes pendientes). El centro de notificaciones completo es Fase 7 — en Fase 1 la solicitud aterriza en la pantalla de Usuarios, no en un feed.
- Vinculación Entra↔app: el Admin invita con email corporativo; el primer login cuyo email coincida exactamente se vincula y **se guarda el OID de Entra como identidad definitiva** (el email pasa a ser dato informativo; cambios de email no rompen la cuenta).
- Usuario desactivado que intenta entrar → mensaje específico «tu cuenta fue desactivada» (app interna, claridad sobre opacidad). Distinto del mensaje de no-invitado.

### Claude's Discretion
Áreas no discutidas — defaults razonables, ajustables durante planning sin volver al usuario:

- **Selector de rol T·A·S**: en la app real el switcher solo aparece para usuarios con más de un rol, limitado a SUS roles (Ivan con T+A+S lo conserva completo; un técnico raso no lo ve). El header deja de ser un toggle de demo.
- **URL pública**: subdominio de Railway ahora; dominio propio después (solo env vars + redirect URIs de Entra). La app es públicamente alcanzable pero solo pasa quien autentica en Entra y está invitado.
- **Semilla día 1**: la cuenta del dev en el tenant dev entra como Super Admin (seed). Datos demo de dominio llegan en fases posteriores.
- Detalles técnicos ya fijados por research/STATE (no re-decidir): `jose` para validación, roles desde BD no desde claims, transacción-por-petición con `set_config(..., true)`, dos roles de Postgres, TS 5.9.x pineado, Prisma 7 `cjs`.

</decisions>

<specifics>
## Specific Ideas

- La pantalla de login ya diseñada (Login.tsx) se conserva visualmente; el botón «Iniciar sesión con Microsoft» pasa de stub a MSAL real.
- El riesgo técnico señalado en STATE.md se honra en esta fase: prototipar la transición multi-tabla con RLS + `$transaction` ANTES de construir encima (criterio de éxito 5 del roadmap).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/Login.tsx`: pantalla completa con branding FAVA y botón Microsoft — solo cambia el handler `doLogin`.
- `frontend/src/state.tsx`: provider central con `login/logout/switchRole` — punto único donde inyectar MSAL + sesión real.
- `frontend/src/Layout.tsx`: sidebar/header con usuario, rol y switcher — consumirá `/api/me`.
- `frontend/src/types.ts`: tipos Role/Route ya definidos — base del cliente API tipado.

### Established Patterns
- Frontend sin Tailwind, estilos inline + variables CSS `.fava` — el cliente API debe ser TS puro, sin traer UI kits.
- Mock data en `data.ts` se retira pantalla por pantalla — en esta fase solo se toca lo de sesión (usuario actual), el resto de mocks sigue vivo.

### Integration Points
- Backend nuevo en `fava-control-tecnico/backend/` (NestJS modular, §14 del CONTEXTO).
- Railway: servicio app + Postgres; dos roles de BD (owner/app) creados por script de setup documentado (restricción: migración de cuenta personal→empresa sin arqueología).

</code_context>

<deferred>
## Deferred Ideas

- Notificación in-app real de solicitudes de acceso → Fase 7 (RT-02); en Fase 1 solo lista en Usuarios.

</deferred>

---

*Phase: 01-fundaci-n-segura-y-desplegada*
*Context gathered: 2026-07-25*
