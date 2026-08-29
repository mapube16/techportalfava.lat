import { getToken } from '../auth/msal';
import { getDevToken } from '../auth/dev';
import type { Lang, Role } from '../../types';

// Tipos escritos a mano: en Fase 1 el contrato son 4 interfaces.
// El codegen desde OpenAPI llega en Fase 2, cuando haya ~20 endpoints.

export interface ApiUser {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  technicianId: string | null;
  /** Idioma de SUS correos. El botón del encabezado lo persiste con `setMyLang`. */
  lang: Lang;
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
    /* no era JSON: cae abajo */
  }
  /**
   * Lo que llega aquí NO lo escribió esta aplicación.
   *
   * Antes se devolvía `texto` tal cual, y el usuario acabó leyendo en pantalla
   * `Cannot POST /api/weekly-notes/9a6f…/receipts` — el 404 por defecto de Express,
   * en inglés y con la ruta interna dentro. Lo mismo valía para una página de error
   * del proxy o un HTML de mantenimiento.
   *
   * Se convierte en un código propio, que `textoError` sí sabe traducir. El cuerpo
   * crudo no se pierde: va a la consola, que es donde sirve.
   */
  if (texto) console.error('respuesta no JSON del servidor:', res.status, texto.slice(0, 300));
  if (res.status === 404) return 'RUTA_NO_ENCONTRADA';
  // 413: el cuerpo se paso del limite y el parser lo corto ANTES de enrutar, asi que
  // el servidor no llego a dar su 'ARCHIVO_DEMASIADO_GRANDE'. Es el mismo problema del
  // usuario —una foto que pesa de mas— y merece el mismo mensaje, no uno en ingles.
  if (res.status === 413) return 'ARCHIVO_DEMASIADO_GRANDE';
  return 'RESPUESTA_INESPERADA';
}

/** POST/PATCH/PUT con cuerpo JSON: el `JSON.stringify` estaba copiado en cada llamada. */
export const apiSend = <T>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) =>
  apiFetch<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/**
 * Como `apiFetch` pero devuelve los bytes: el PDF de la Nota no es JSON y pasarlo por
 * `res.json()` lo rompería. Repite el manejo de token y de error a propósito — es más
 * corto que parametrizar `apiFetch` con un modo de respuesta que solo usa el PDF.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const token = getDevToken() ?? (await getToken());
  const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, await codigoDeError(res));
  }
  return res.blob();
}

export const getMe = () => apiFetch<MeResponse>('/me');

/** Persiste el idioma del botón del encabezado: los correos se escriben en el servidor
    y hasta ahora el idioma vivía solo en el estado de React. */
export const setMyLang = (lang: Lang) => apiSend<{ lang: Lang }>('/me/lang', 'PUT', { lang });
export const requestAccess = () => apiFetch<void>('/access-requests', { method: 'POST' });
export const listAccessRequests = () => apiFetch<AccessRequest[]>('/access-requests');
export const dismissAccessRequest = (id: string) =>
  apiFetch<void>(`/access-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'dismissed' }),
  });
