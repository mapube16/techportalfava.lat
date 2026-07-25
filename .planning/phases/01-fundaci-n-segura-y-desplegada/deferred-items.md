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

## Desde 01-01 (backend)

- **`frontend/typescript` sin pinear.** El frontend declara `^5.5.3`; con TS 7.x
  publicado como `latest`, el caret sigue resolviendo a 5.x, así que hoy no rompe
  nada (npm hoista el 5.9.3 exacto del backend y ambos lo comparten). El research
  recomienda pinearlo también. `frontend/package.json` es de otra plan: dueño 01-06.
- **31 vulnerabilidades de `npm audit`** (3 moderate, 28 high), todas en
  dependencias transitivas del toolchain de build (`glob`/`inflight` viejos vía
  `@nestjs/cli`), no en código de runtime. Revisar antes del deploy del 01-06.
- **Sin Docker en la máquina de desarrollo.** `docker-compose.yml` se entrega
  igualmente (es la ruta reproducible y fija la major de Postgres). Local corre
  contra un cluster aparte creado con `initdb` en `C:/tmp/fava-pg/data`, puerto
  55432. Ver `backend/.env` y el SUMMARY de 01-01.
