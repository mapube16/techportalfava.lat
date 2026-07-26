import { getToken } from '../auth/msal';
import { getDevToken } from '../auth/dev';
import type { Role } from '../../types';

// Tipos escritos a mano: en Fase 1 el contrato son 4 interfaces.
// El codegen desde OpenAPI llega en Fase 2, cuando haya ~20 endpoints.

export interface ApiUser {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  technicianId: string | null;
}

export interface EntraIdentity {
  displayName: string;
  email: string;
}

export type MeResponse =
  | { status: 'ok'; user: ApiUser }
  | { status: 'not_invited'; entra: EntraIdentity; requestPending: boolean }
  | { status: 'deactivated'; entra: EntraIdentity };

export interface AccessRequest {
  id: string;
  email: string;
  displayName: string;
  status: 'pending' | 'dismissed';
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// El provider de sesión se registra aquí para que CUALQUIER 401 (no solo el de
// /api/me) devuelva la app al estado anónimo. Un solo guard, todos los llamantes.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Con el login de desarrollo activo el token ya está en sessionStorage y MSAL
  // no pinta nada; sin él (o sin la variable) esto es null y todo sigue igual.
  const token = getDevToken() ?? (await getToken());
  // Mismo origen: el backend sirve el build de Vite, no hay CORS ni base URL.
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, await codigoDeError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * El backend responde `{ statusCode, message: 'YA_EXISTE', error }`: lo que la UI
 * necesita mostrar (y ramificar) es ese `message`, no el JSON entero. Se desenvuelve
 * aquí y no en cada llamante porque el formato es del servidor, no de la pantalla.
 */
async function codigoDeError(res: Response): Promise<string> {
  const texto = await res.text();
  try {
    const cuerpo: unknown = JSON.parse(texto);
    const msg = (cuerpo as { message?: unknown })?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
  } catch {
    /* no era JSON: se devuelve tal cual */
  }
  return texto || res.statusText;
}

/** POST/PATCH/PUT con cuerpo JSON: el `JSON.stringify` estaba copiado en cada llamada. */
export const apiSend = <T>(path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown) =>
  apiFetch<T>(path, { method, body: JSON.stringify(body) });

export const getMe = () => apiFetch<MeResponse>('/me');
export const requestAccess = () => apiFetch<void>('/access-requests', { method: 'POST' });
export const listAccessRequests = () => apiFetch<AccessRequest[]>('/access-requests');
export const dismissAccessRequest = (id: string) =>
  apiFetch<void>(`/access-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'dismissed' }),
  });
