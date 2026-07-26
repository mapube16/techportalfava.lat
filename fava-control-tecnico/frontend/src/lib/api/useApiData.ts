import { useEffect, useState } from 'react';
import { ApiError } from './client';

/**
 * Cargar una vez, guardar el resultado, exponer el error como código del servidor.
 *
 * Es el patrón que la Fase 1 escribió a mano en `state.tsx` y en `Users.tsx`
 * (bandera `alive` incluida, para no llamar a `setState` sobre un componente ya
 * desmontado), factorizado porque el cutover lo repite en siete pantallas.
 *
 * ponytail: sin caché, sin reintentos, sin deduplicación de peticiones — eso es
 * React Query y la fase prohíbe dependencias nuevas. `setData` está expuesto para
 * que la pantalla refleje su propia escritura sin volver a pedir la lista entera.
 */
export function useApiData<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setError(null);
    cargar()
      .then((d) => {
        if (vivo) setData(d);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof ApiError ? e.message : 'ERROR_DE_RED');
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, error };
}

/** El código de error del servidor, o algo imprimible si el fallo fue de red. */
export const codigo = (e: unknown) => (e instanceof ApiError ? e.message : 'ERROR_DE_RED');
