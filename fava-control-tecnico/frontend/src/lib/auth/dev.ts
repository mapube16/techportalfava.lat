/**
 * Login de desarrollo temporal (Plan 01-07): existe solo mientras FAVA no tenga
 * su tenant de Entra. Sin `VITE_DEV_AUTH=true` este modulo no hace nada — no hay
 * token que leer, no hay formulario y la pantalla de login queda exactamente
 * como la dejo el Plan 01-05.
 *
 * El token que guarda aqui es un JWT firmado por el backend que el servidor
 * valida con el MISMO guard que un token de Microsoft: esto no es una sesion
 * simulada de cliente, y no da acceso a nada que el servidor no conceda.
 */
const KEY = 'fava_dev_token';

/** Horneado en el bundle por Vite: cambiarlo exige reconstruir el frontend. */
export const devAuthEnabled = import.meta.env.VITE_DEV_AUTH === 'true';

// sessionStorage y no localStorage, igual que MSAL: al cerrar la pestaña se va.
export function getDevToken(): string | null {
  if (!devAuthEnabled) return null;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null; // almacenamiento no disponible
  }
}

export async function devLogin(email: string, password: string): Promise<void> {
  const res = await fetch('/api/dev-auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`dev-auth ${res.status}`);
  const { access_token } = (await res.json()) as { access_token: string };
  sessionStorage.setItem(KEY, access_token);
}

export function devLogout(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
