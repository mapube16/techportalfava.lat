import { apiFetch, apiSend } from './client';

// Contrato de 02-03. Roles A · S. `aliases` no se expone (es de la Fase 6).

export type EmploymentType = 'INTERNO' | 'EXTERNO';

export interface Technician {
  id: string;
  fullName: string;
  roleTypeId: string;
  /** Resuelto del catálogo por el servidor: la pantalla no cruza listas. */
  roleTypeName: string;
  employmentType: EmploymentType;
  isActive: boolean;
  /** La cuenta Entra vinculada, si la hay. Un técnico puede no tenerla. */
  userId: string | null;
}

export interface TechnicianInput {
  fullName: string;
  roleTypeId: string;
  employmentType: EmploymentType;
}

/** Activos e inactivos, ORDER BY fullName. */
export const listTechnicians = () => apiFetch<Technician[]>('/technicians');

export const createTechnician = (body: TechnicianInput) =>
  apiSend<Technician>('/technicians', 'POST', body);

export const updateTechnician = (id: string, body: Partial<TechnicianInput>) =>
  apiSend<Technician>(`/technicians/${id}`, 'PATCH', body);

/** La baja es un campo, no un DELETE: la bitácora histórica sigue apuntando aquí. */
export const setTechnicianActive = (id: string, isActive: boolean) =>
  apiSend<Technician>(`/technicians/${id}/active`, 'PATCH', { isActive });
