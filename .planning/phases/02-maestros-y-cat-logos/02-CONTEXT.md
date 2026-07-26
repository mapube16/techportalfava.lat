# Phase 2: Maestros y catálogos - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

ABM de los datos maestros que alimentan todo lo demás: técnicos, proyectos (con los campos de encabezado que imprime la Nota Semanal), días vendidos por rol×fase, usuarios, y los catálogos cerrados (conceptos, roles técnicos, monedas, máquinas). Requisitos: CAT-01..CAT-05. Cutover de frontend: `Projects.tsx`, `ProjectDetail.tsx`, `Techs.tsx`, `Users.tsx`, `Config.tsx`, `NewProjectModal.tsx`, `InviteUserModal.tsx`.

La captura de bitácora, notas semanales y KPIs son fases posteriores.

</domain>

<decisions>
## Implementation Decisions

### Matriz de días vendidos (rol × fase)
- **Autoguardado por celda**: cada celda persiste al salir del campo, sin botón Guardar. Implica indicador visual de guardado y manejo de error por celda (revertir + avisar si falla).
- **Bajar vendidos por debajo de lo ejecutado se permite**, y el delta se muestra en negativo. Es un hecho real del negocio (el proyecto se pasó de lo vendido); ocultarlo falsearía el KPI que justifica el proyecto.
- **Editable por Admin y Super Admin**, coherente con la matriz §6 del documento de requerimientos ("crear y editar proyectos (y días vendidos)" es capacidad de Admin).
- **Las tres columnas existen desde esta fase**: vendido (editable), ejecutado (calculado, sale 0 hasta que exista bitácora en Fase 3) y delta (calculado, nunca digitable). Evita rehacer la pantalla después.

### Catálogos
- **Conceptos de jornada (DC/MD/DFD/DVSF/DVRC/LR/NR/IL): códigos y semántica FIJOS**; el Super Admin solo puede editar las **etiquetas visibles** en ES/IT. No se pueden añadir ni eliminar conceptos — la lógica de KPIs, la Nota y la migración dependen de esos códigos exactos.
- **Roles técnicos: ABM completo** por Super Admin. El Excel tenía 11 variantes reales y FAVA puede necesitar más especialidades. Consecuencia de diseño: **las filas de la matriz vendido/ejecutado se generan desde este catálogo**, no están cableadas.
- **Monedas: ABM simple** (código y símbolo). Sin tasas de cambio — fuera de alcance.
- **Regla transversal: desactivar, nunca borrar.** Un elemento de catálogo en uso deja de ofrecerse en formularios nuevos, pero los registros históricos lo siguen mostrando. Misma regla ya aplicada a técnicos y usuarios en Fase 1.

### Máquinas
- **Catálogo global de modelos + selección por proyecto.** El Super Admin mantiene la lista de modelos que FAVA fabrica; cada proyecto elige cuáles se instalan. Habilita el KPI "días por máquina" del documento §07 y elimina la causa raíz del Excel (texto libre con separadores mixtos).
- **Cada máquina lleva código + descripción libre**, siguiendo la tabla `machines` del CONTEXTO §10.
- **Selección con botones tipo chip** (marcar/desmarcar), como el prototipo actual: cómodo en móvil y suficiente con pocos modelos.
- **Quitar una máquina de un proyecto con jornadas registradas: se avisa y se permite.** Deja de ofrecerse en capturas nuevas; las jornadas históricas conservan su máquina.

### Claude's Discretion
No discutido — aplicar por coherencia con lo anterior y decidir durante planning:

- **Borrado vs. desactivación de proyectos y técnicos**: misma regla que catálogos — desactivar siempre, nunca borrado físico ni cascade delete. Un proyecto sin ningún registro asociado puede ofrecer borrado real, pero no es obligatorio.
- Diseño del indicador de autoguardado, textos de error, validaciones de formato (NIT, n° de contrato), paginación/búsqueda en las listas.
- Orden de retirada de los mocks de `data.ts` pantalla por pantalla.

</decisions>

<specifics>
## Specific Ideas

- El campo **"Cargo durante la semana"** de la Nota real varía por semana y NO pertenece al maestro de técnicos (hallazgo del research de features). En esta fase el técnico lleva su rol por defecto; el override semanal se implementa en la Fase 4 (NOTA-09).
- Los campos de encabezado del proyecto deben ser **exactamente** los que imprime la Nota: cliente, NIT, localidad, suministro, n° de contrato, maquinaria, país. Ver el PDF de ejemplo en `docs/`.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/lib/api/client.ts`: `apiFetch` tipado ya construido en Fase 1 — todas las pantallas nuevas lo usan.
- `frontend/src/ui.tsx`: `Card`, `CardHead`, `chip()`, estilos de tabla (`th`/`td`), `FieldError`, `filterBy` — la UI de estas pantallas ya está construida contra estos primitivos.
- `frontend/src/screens/Projects.tsx`, `ProjectDetail.tsx`, `Techs.tsx`, `Config.tsx`: pantallas completas con datos mock; el trabajo es sustituir la fuente de datos, no rediseñarlas.
- `frontend/src/components/NewProjectModal.tsx`: formulario con validación ya implementada (campos obligatorios, valor > 0, al menos una máquina).
- Backend: módulo `users` con RBAC y anti-lockout ya funcionando (Fase 1) — patrón a replicar en los módulos nuevos.

### Established Patterns
- Módulo por dominio en su carpeta; controladores declaran ruta completa (`@Controller('api/projects')`) — no hay `setGlobalPrefix`.
- `EnvService` en vez de `@nestjs/config`; `ThrottlerGuard` con `@UseGuards`, nunca global.
- Transacción por petición con contexto RLS vía `AsyncLocalStorage` — las escrituras multi-tabla (proyecto + máquinas + días vendidos) deben ir dentro de ese patrón.
- `data.ts` sigue vivo: solo salen los mocks de las pantallas que esta fase cablea.

### Integration Points
- Tablas nuevas en `backend/prisma/schema.prisma` (hoy solo existen `users`, `access_requests`, `daily_entries`, `weekly_notes`): `technicians`, `projects`, `project_sold_days`, `machines`, `role_types`, `currencies`, `concepts`.
- `daily_entries` ya tiene columnas creadas en Fase 1 — las FKs a `projects`/`machines` se conectan aquí.

</code_context>

<deferred>
## Deferred Ideas

- Override del "cargo durante la semana" en la nota — Fase 4 (NOTA-09).
- Número de serie / línea de la máquina instalada — solo si FAVA lo pide; hoy modelo + descripción basta.
- Tasas de cambio entre monedas — fuera de alcance del proyecto.

</deferred>

---

*Phase: 02-maestros-y-cat-logos*
*Context gathered: 2026-07-25*
