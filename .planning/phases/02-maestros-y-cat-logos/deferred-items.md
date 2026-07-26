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

## Del plan 02-05 (proyectos y matriz)

- **`ProjectDetail.tsx:35` calcula el delta AL REVÉS** (`const dl = dn - s`, o sea
  ejecutado − vendido) y pinta `warn` cuando sale negativo. Con esa convención, pasarse de
  lo vendido saldría **positivo y verde**. El backend ya devuelve `delta` calculado
  (`sold − executed`, la convención del Excel) en cada fila de la matriz: la corrección del
  cliente es **borrar la resta**, no cambiarla de signo — el cliente solo pinta.
  **Dueño: plan 02-06.** No se toca desde aquí: este plan es solo backend.

- **El botón «Guardar» de la matriz (`ProjectDetail.tsx:83`) tiene que desaparecer.**
  El autoguardado por celda es `PUT /api/projects/:id/sold-days` con una celda por petición;
  un botón que mande la matriz entera no tiene endpoint al que llamar. **Dueño: 02-06.**

- **`SMOKE_DEV_EMAIL` / `SMOKE_DEV_PASSWORD` no están en la config de deploy.** El check
  autenticado del smoke (el único que caza el Pitfall 7) se **omite** sin ellas y el smoke
  sigue saliendo verde. Para que el próximo deploy de Railway lo ejecute de verdad hay que
  ponerlas en el entorno del job de smoke, mientras `DEV_AUTH_ENABLED` siga encendido.
  **Dueño: el plan que cierre el deploy de la fase.**

- **`npm audit`: 31 vulnerabilidades en dependencias transitivas del toolchain de build**
  (heredado del Plan 01-01, sin cambios: esta fase no añadió ni una dependencia).
  Dueño: revisión previa al deploy de producción.
