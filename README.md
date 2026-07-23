# Control Técnico FAVA

Aplicación web para **FAVA Latino America S.A.S.** (filial de FAVA SpA, Italia) que reemplaza
el Excel de "Control Técnico" (14 hojas) y la "Nota de Prestación Semanal" en PDF por un sistema
de **captura única**: el técnico de campo registra su día una sola vez y con ese dato se generan la
Nota Semanal firmada, los KPIs de vendido/ejecutado por proyecto y el control comercial en tiempo real.

> ⚠️ **Estado:** Fase de definición / arranque. El repositorio contiene la documentación de
> requerimientos y contexto; el código de la aplicación (backend NestJS + frontend React) se
> incorporará en las próximas iteraciones. Ver el [plan por fases](#alcance-por-fases).

## Contexto de negocio

FAVA instala y pone en marcha maquinaria industrial de pasta/molienda (líneas Pasta Larga, PC4500,
CTA1000, PL6000, silos) para clientes en LatAm, EE. UU. y Europa. Unos **30 usuarios** (~15 técnicos)
gestionan los días trabajados por proyecto. Por la baja carga, la arquitectura es un **monolito
modular** (no microservicios).

**Los 3 roles:** Técnico (registra y firma su bitácora/nota), Administrador (valida, aprueba,
gestiona proyectos/técnicos/usuarios) y Super Admin (KPIs globales, auditoría, configuración).

## Documentación del proyecto

Toda la información de negocio, análisis de datos y decisiones técnicas está en `docs/`:

| Documento | Descripción |
| --------- | ----------- |
| [`docs/CONTEXTO-PROYECTO-FAVA.md`](docs/CONTEXTO-PROYECTO-FAVA.md) | **Documento de traspaso completo**: contexto, análisis del Excel/PDF, modelo de datos, endpoints, seguridad y fases. Empieza por aquí. |
| `docs/Requerimientos-Tecnicos-Control-Tecnico-FAVA.pdf` | Entregable v1 — requerimientos funcionales (12 págs). |
| `docs/2026_Control Técnico_VF .xls` | Fuente de datos actual: Excel de 14 hojas (bitácora diaria + tableros vendido/ejecutado). |
| `docs/Reporte 02 - Ivan Cortés ... .pdf` | Ejemplo de la Nota de Prestación Semanal firmada por el cliente. |

## Stack técnico

- **Backend:** NestJS (TypeScript) — monolito modular, un módulo por dominio.
- **Frontend:** React + TypeScript (Vite), autenticación con MSAL.
- **Base de datos:** PostgreSQL con Prisma ORM y Row-Level Security.
- **Autenticación:** Microsoft 365 / Entra ID (SSO OIDC) — la app no guarda contraseñas.
- **Tiempo real:** SSE (Server-Sent Events) + refetch tras mutación.
- **Hosting:** orientado a Azure (coherencia con el tenant Microsoft del cliente).

## Alcance por fases

- **MVP (Entrega 1):** bitácora diaria + captura semanal, flujo de aprobación, Nota Semanal en PDF
  con firma digital, ABM de proyectos/técnicos/usuarios, SSO Microsoft, tableros de vendido/ejecutado
  y utilización, y migración del histórico 2025–2026.
- **Fase 2 (comercial y matriz):** módulo de viajes con facturación, exportaciones formato casa matriz,
  tableros económicos avanzados y reportes por cliente/país.
- **Fase 3 (inteligencia operativa):** alertas de desviación, planeación de asignación de técnicos y
  notificaciones de reportes por vencer.

## Estructura prevista del repositorio

```
techportalfava.lat/
├─ backend/            # NestJS + Prisma (pendiente)
├─ frontend/           # React + Vite (pendiente)
├─ docs/               # requerimientos, contexto y fuentes de datos
├─ docker-compose.yml  # PostgreSQL local para desarrollo (pendiente)
└─ README.md
```

## Próximos pasos

1. Escribir `schema.prisma` concreto (tablas, enums y relaciones) para fijar el contrato de datos.
2. Scaffold del repo (NestJS + React + Prisma + docker-compose).
3. Script de migración del Excel 2025/2026 con reglas de limpieza + reporte de conciliación.
4. Implementar los módulos del MVP: catálogos → técnicos → proyectos → daily-entries → weekly-notes → dashboards.

Los detalles de cada paso (modelo de datos, endpoints REST, matriz de permisos y seguridad) están en
[`docs/CONTEXTO-PROYECTO-FAVA.md`](docs/CONTEXTO-PROYECTO-FAVA.md).
