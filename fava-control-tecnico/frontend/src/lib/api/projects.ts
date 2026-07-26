import { apiFetch, apiSend } from './client';

// Contrato cerrado de 02-05 (§ «Contrato definitivo del API»). Roles A · S.

export type Phase = 'MONTAJE' | 'COLLAUDO';

export interface ProjectListItem {
  id: string;
  name: string;
  clientName: string;
  country: string;
  oaNumber: string | null;
  contractNumber: string;
  /** `number`, NO string: el servicio convierte el Decimal de Prisma (hallazgo 02-05). */
  contractValue: number | null;
  currencyCode: string | null;
  normalHours: number | null;
  isActive: boolean;
  /** Códigos ordenados, listos para los chips. */
  machineCodes: string[];
}

export interface ProjectMachine {
  machineModelId: string;
  code: string;
  description: string | null;
  /** Jornadas de ESTE proyecto con ese modelo: > 0 → avisar antes de quitarla. */
  entryCount: number;
}

export interface MatrixRow {
  roleTypeId: string;
  roleTypeName: string;
  /** false = rol de baja que sigue apareciendo porque tiene datos. */
  roleTypeActive: boolean;
  /** null = bucket «sin fase» (histórico del Excel). */
  phase: Phase | null;
  sold: number;
  executed: number;
  /**
   * `sold − executed`, calculado por el servidor en la ÚNICA línea del repo que resta
   * estas dos cantidades. Negativo = sobreejecución. El cliente NO resta.
   */
  delta: number;
}

export interface Project {
  id: string;
  name: string;
  // Encabezado literal de la Nota Semanal
  clientName: string;
  /** OJO Fase 5: el «NIT:» del PDF es el de FAVA, no este. */
  clientNit: string | null;
  locality: string;
  country: string;
  supply: string;
  contractNumber: string;
  // Comercial
  oaNumber: string | null;
  contractValue: number | null;
  currencyCode: string | null;
  normalHours: number | null;
  isActive: boolean;
  machines: ProjectMachine[];
  /** Una fila por (rol × fase) generada del catálogo: nada cableado. */
  matrix: MatrixRow[];
}

export interface ProjectInput {
  name: string;
  clientName: string;
  locality: string;
  country: string;
  supply: string;
  contractNumber: string;
  clientNit?: string | null;
  oaNumber?: string | null;
  contractValue?: number | null;
  currencyCode?: string | null;
  normalHours?: number | null;
}

/** Respuesta del autoguardado de una celda: trae el delta ya calculado. */
export interface SoldDaysCell {
  roleTypeId: string;
  phase: Phase | null;
  sold: number;
  executed: number;
  delta: number;
}

/** ORDER BY name, incluye inactivos: filtra el selector, no el endpoint. */
export const listProjects = () => apiFetch<ProjectListItem[]>('/projects');

export const getProject = (id: string) => apiFetch<Project>(`/projects/${id}`);

/** POST y PATCH devuelven el proyecto SIN `machines` ni `matrix`: eso es del GET. */
export const createProject = (body: ProjectInput) =>
  apiSend<Project>('/projects', 'POST', body);

export const updateProject = (id: string, body: Partial<ProjectInput>) =>
  apiSend<Project>(`/projects/${id}`, 'PATCH', body);

export const setProjectActive = (id: string, isActive: boolean) =>
  apiSend<Project>(`/projects/${id}/active`, 'PATCH', { isActive });

/** Reemplaza la selección completa (idempotente). `[]` es válido. */
export const setProjectMachines = (id: string, machineModelIds: string[]) =>
  apiSend<ProjectMachine[]>(`/projects/${id}/machines`, 'PUT', { machineModelIds });

/** UNA celda: es el endpoint del autoguardado al salir del campo. */
export const setSoldDays = (
  id: string,
  body: { roleTypeId: string; phase: Phase; soldDays: number },
) => apiSend<SoldDaysCell>(`/projects/${id}/sold-days`, 'PUT', body);
