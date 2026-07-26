import { apiFetch, apiSend } from './client';

// Contrato cerrado de 02-03 (§ «Contrato definitivo del API»). Las 4 listas incluyen
// los INACTIVOS: filtra el selector, no el endpoint.

/** Los 8 conceptos son fijos por enum de Postgres: solo cambian sus etiquetas. */
export interface Concept {
  code: string;
  labelEs: string;
  labelIt: string;
  sortOrder: number;
}

export interface RoleType {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Currency {
  code: string;
  symbol: string;
  isActive: boolean;
}

export interface MachineModel {
  id: string;
  code: string;
  description: string | null;
  isActive: boolean;
}

export interface Catalogs {
  concepts: Concept[];
  roleTypes: RoleType[];
  currencies: Currency[];
  machineModels: MachineModel[];
}

/** Los 4 catálogos en UNA petición. Abierto a T · A · S. */
export const getCatalogs = () => apiFetch<Catalogs>('/catalogs');

// --- Todo lo que sigue es solo Super Admin (403 para Admin y Técnico).

export const updateConcept = (code: string, body: { labelEs?: string; labelIt?: string }) =>
  apiSend<Concept>(`/catalogs/concepts/${code}`, 'PATCH', body);

export const createRoleType = (name: string) =>
  apiSend<RoleType>('/catalogs/role-types', 'POST', { name });

export const updateRoleType = (id: string, body: { name?: string; isActive?: boolean }) =>
  apiSend<RoleType>(`/catalogs/role-types/${id}`, 'PATCH', body);

export const createCurrency = (code: string, symbol: string) =>
  apiSend<Currency>('/catalogs/currencies', 'POST', { code, symbol });

/** El código es la clave: solo se editan símbolo y estado. */
export const updateCurrency = (code: string, body: { symbol?: string; isActive?: boolean }) =>
  apiSend<Currency>(`/catalogs/currencies/${code}`, 'PATCH', body);

export const createMachineModel = (code: string, description?: string) =>
  apiSend<MachineModel>('/catalogs/machine-models', 'POST', { code, description });

export const updateMachineModel = (
  id: string,
  body: { code?: string; description?: string; isActive?: boolean },
) => apiSend<MachineModel>(`/catalogs/machine-models/${id}`, 'PATCH', body);

/** Regla transversal de la fase: un elemento de baja no se ofrece, pero sigue existiendo. */
export const activos = <T extends { isActive: boolean }>(xs: T[]) => xs.filter((x) => x.isActive);
