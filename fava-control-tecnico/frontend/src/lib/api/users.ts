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

/**
 * La escalada es del servidor (solo un Super Admin concede o quita A/S) y también los
 * dos anti-lockout, que se evalúan ANTES que el permiso: la app no se puede quedar sin
 * Super Admin ni nadie puede quitarse a sí mismo el último rol que le da acceso.
 */
export const setUserRoles = (id: string, roles: Role[]) =>
  apiSend<UserRow>(`/users/${id}/roles`, 'PATCH', { roles });

/** Desactivar corta el acceso en la siguiente petición: el guard relee `users` cada vez. */
export const setUserActive = (id: string, isActive: boolean) =>
  apiSend<UserRow>(`/users/${id}/active`, 'PATCH', { isActive });
