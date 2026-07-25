# Deferred items — Fase 1

Hallazgos fuera del alcance de la tarea en curso. No se arreglan aquí.

## Desde 01-05 (frontend)

- **`frontend/package-lock.json` redundante.** El Plan 01-01 convirtió
  `fava-control-tecnico/` en un workspace npm con lock único en la raíz. El lock
  anidado del frontend (versionado en el baseline de 01-05) ya no lo usa `npm ci`
  desde la raíz, y un `npm install` dentro de `frontend/` puede resolver un árbol
  distinto al de CI. Dueño: 01-01 / 01-06 (borrarlo al cerrar el deploy).
- **`echarts` sigue en las dependencias del frontend.** El research decide Nivo
  para los gráficos (Fase 7). Retirar en la fase que haga el cutover de KPIs.
- **Bundle principal > 1.5 MB** (aviso de Rollup). Code-splitting no es asunto de
  esta fase; revisar cuando entre Nivo y el peso cambie de todos modos.
