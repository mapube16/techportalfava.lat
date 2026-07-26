# Fase 2 — Items diferidos

Hallazgos fuera del alcance del plan que los encontró. No se arreglan donde se ven.

## Del plan 02-01 (esquema)

- **`frontend/src/screens/Kpis.tsx` va a romper el build cuando `types.ts` deje de ser el
  contrato.** `Kpis.tsx` lee `state.projects` (líneas 7-11 y 127-128) y `PhaseMatrix` /
  `RoleType` de `types.ts`. El build del frontend es `tsc && vite build`, así que un cambio
  de tipo en una pantalla no migrada **rompe el deploy entero**, no solo esa pantalla.
  Salida limpia (una línea): `Kpis.tsx` pasa a importar `PROJECTS` directamente de `data.ts`
  y se queda 100 % mock hasta la Fase 7.
  **Dueño: plan 02-06** (wave 4, cutover de frontend). No se toca desde 02-01: este plan es
  solo backend y el frontend actual compila sin cambios.

- **La fila de la Phase 1 en la tabla de progreso de `ROADMAP.md` está desfasada** (`0/6 · Not started`,
  cuando la fase tiene 7 planes, 5 summaries y un `01-VERIFICATION.md` con 6/7 requisitos).
  No se corrige desde aquí: es un dato de otra fase y `roadmap update-plan-progress 1` la dejaría
  como `5/7 · In Progress`, que tampoco refleja que la fase se verificó. Dueño: la verificación de
  fase / el cierre de AUTH-01.

- **`npm audit`: 31 vulnerabilidades en dependencias transitivas del toolchain de build**
  (heredado del Plan 01-01, sin cambios: esta fase no añadió ni una dependencia).
  Dueño: revisión previa al deploy de producción.
