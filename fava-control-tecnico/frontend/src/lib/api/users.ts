import { apiFetch, apiSend } from './client';
import type { Role } from '../../types';

// Contrato de 01-03 ampliado por 02-04. Roles A · S.

export interface UserRow {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  isActive: boolean;
  /** El vínculo del que sale la GUC `app.technician_id` (aislamiento de la bitácora). */
  technicianId: string | null;
}

export const listUsers = () => apiFetch<UserRow[]>('/users');

/**
 * Invitar NO manda correo (el email transaccional es V1X-01, diferido): crea la fila
 * que el primer login real reclama por email. Sin `roles` se invita a un Técnico.
 */
export const inviteUser = (body: {
  email: string;
  displayName: string;
  roles?: Role[];
  technicianId?: string | null;
}) => apiSend<UserRow>('/users', 'POST', body);

/**
 * El vínculo es 1-a-1 por motor: reasignar un técnico ya vinculado responde
 * `409 TECNICO_YA_VINCULADO` y hay que desvincular (`null`) primero.
 */
export const linkTechnician = (id: string, technicianId: string | null) =>
  apiSend<UserRow>(`/users/${id}/technician`, 'PATCH', { technicianId });
