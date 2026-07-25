# FAVA — Control Técnico

App web que reemplaza el Excel de Control Técnico (ver `../CONTEXTO-PROYECTO-FAVA.md`).

## frontend/

React + TypeScript (Vite). Implementación del diseño aprobado en Claude Design
(login SSO demo, roles T/A/S, bitácora, nota semanal con firma, bandeja de
aprobación, proyectos, KPIs con ECharts, auditoría; ES/IT, claro/oscuro).
Datos mock en `src/data.ts` — se cablean al backend NestJS cuando exista.

```
cd frontend
npm install
npm run dev
```

## Pendiente

- `backend/` (NestJS + Prisma + PostgreSQL, §14 del contexto).
- Sustituir mock por cliente API; MSAL para Entra ID real.
- Logo real (marca centralizada en `frontend/src/icons.tsx` → `FavaLogo`).
