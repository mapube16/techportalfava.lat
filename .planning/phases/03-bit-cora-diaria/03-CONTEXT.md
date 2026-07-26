# Phase 3: Bitácora diaria - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Phase Boundary

El técnico registra su semana desde el móvil en planta: 7 días con proyecto, máquina, concepto, fase y descripción. Un registro por técnico por día, fecha local del sitio, resistente a mala conectividad y a doble envío. Requisitos: BIT-01..BIT-04. Cutover: `Week.tsx`, `LogDayDrawer.tsx`.

El bloqueo al enviar (BIT-05), la derivación de notas semanales y la aprobación son Fase 4.

</domain>

<decisions>
## Implementation Decisions

### Forma de captura
- **La grilla semanal manda**; tocar una fila abre el drawer para editar ese día. Una sola fuente de verdad, y el técnico ve siempre qué días le faltan. El drawer deja de ser un alta suelta.
- **Móvil: lista vertical de tarjetas**, una por día — el patrón que ya usan las otras pantallas en vista móvil. No grilla con scroll horizontal.
- **Botón «igual que ayer»**: copia proyecto, máquina, concepto, fase y descripción del día anterior. Justificación real: el PDF de Ivan Cortés tiene 6 días seguidos con el mismo texto.
- Al entrar se abre **la semana en curso**, con navegación a anteriores y siguientes.

### Borrador local
- **Sin caducidad**: dura hasta que se envíe o se descarte. Perder trabajo escrito es la vía más rápida a que el técnico vuelva al papel.
- **No viaja entre dispositivos**: el borrador es local. Sincronizarlo exigiría un motor offline completo, descartado por sobredimensionado para ~1 registro/técnico/día.
- **Conflicto borrador local vs. servidor: avisar y que el técnico elija**, mostrando ambas versiones. No decidir por él en silencio en ninguna dirección.
- **Guarda mientras escribe, con retardo** (unos cientos de ms tras dejar de teclear), no solo al salir del campo: si la app muere a mitad de una frase no se pierde.

### Alcance de proyectos y máquinas
- **El técnico elige de todos los proyectos activos.** No se crea tabla de asignación técnico↔proyecto: con ~15 técnicos y pocas obras simultáneas la lista es corta, y evita que alguien quede bloqueado porque nadie lo asignó.
- **Hay que relajar el permiso de listar proyectos** (hoy `A·S`) — aviso que dejó el plan 02-06. Pero un técnico ve **solo nombre y máquinas**: el valor de contrato y los días vendidos son información comercial que no necesita. Implica una proyección distinta por rol, no el mismo DTO.
- **Proyectos cerrados no aparecen** en la lista. Los días ya registrados contra uno cerrado se conservan y se ven.
- **La máquina sale de las asociadas al proyecto**, no del catálogo global — es lo que el admin cargó en la Fase 2 y lo que imprimirá la Nota.

### Ventana temporal
- **No se puede registrar en el futuro**: hasta hoy inclusive. El Excel tenía 1.009 filas de fechas futuras precargadas que ensuciaban todas las agregaciones.
- **Hacia atrás: solo el mes en curso y el anterior.** Más antiguo exige intervención de un admin (no en esta fase).
- **Editable libremente mientras esté en borrador**, sin auditar cada cambio — es dato no confirmado. Al enviar queda en solo lectura, y eso es BIT-05 (Fase 4).
- **El duplicado por fecha lo hace imposible la grilla**: una fila por día, registrar sobre un día con dato es editarlo. La restricción única de la base es la red de seguridad, no la interfaz.

### Claude's Discretion
- Diseño del indicador de borrador sin enviar y del aviso de conflicto.
- Cómo se presenta la navegación entre semanas.
- Formato de la clave de idempotencia y su ventana de validez.
- Textos ES/IT de los mensajes nuevos.

</decisions>

<specifics>
## Specific Ideas

- La fecha es **DATE local del sitio**, sin hora ni zona: el mismo día debe verse igual con el dispositivo en Bogotá, Roma o São Paulo. Nunca `new Date()` en el servidor para la fecha de trabajo.
- Conceptos sin proyecto (LR/NR/IL) se registran sin proyecto; un día de trabajo en obra sin proyecto se rechaza. La restricción `CHECK` por concepto ya existe en el esquema desde la Fase 2.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/screens/Week.tsx` y `components/LogDayDrawer.tsx`: ambas pantallas ya construidas con mocks (`LOG_PROJECTS`, `MACHINES` en `data.ts`).
- `frontend/src/lib/api/useApiData.ts` + `ui.tsx` `ApiState`: patrón de carga/error creado en 02-06, a reutilizar.
- `frontend/src/lib/api/projects.ts`, `catalogs.ts`: clientes tipados ya existentes.
- Backend: `daily_entries` ya tiene todas sus columnas desde la Fase 2 — incluidas `role_type_id`, `phase` nullable y las `source_*` de la Fase 6. **No hace falta migración de esquema.**

### Established Patterns
- Módulo por dominio; controladores con ruta completa (`@Controller('api/daily-entries')`); sin `setGlobalPrefix`.
- Transacción por petición con contexto RLS vía `AsyncLocalStorage`; `app.technician_id` sale de `users.technician_id`, ya cableado en 02-04.
- TDD estricto: commit en rojo antes del verde, y verificar en rojo que el test detecta el fallo real.
- `check:no-free-text` está enganchado al build: concepto, rol y moneda no pueden venir de un `<input>`.

### Integration Points
- `GET /api/projects` necesita relajar `@Roles` a `T` con proyección reducida (nombre + máquinas).
- `data.ts` pierde `LOG_PROJECTS` y `MACHINES` al cerrar esta fase; quedan notas, gastos y auditoría.

</code_context>

<deferred>
## Deferred Ideas

- Asignación técnico↔proyecto como tabla — solo si la lista de proyectos activos crece hasta molestar.
- Registrar más atrás del mes anterior (regularizar atrasos antiguos) — necesitaría una acción de admin.
- Sincronización del borrador entre dispositivos — descartada por diseño, no diferida.

</deferred>

---

*Phase: 03-bit-cora-diaria*
*Context gathered: 2026-07-26*
