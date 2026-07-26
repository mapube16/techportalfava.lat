import { useEffect, useState } from 'react';

/**
 * El punto de ruptura de la app, en un solo sitio del lado TypeScript.
 *
 * El mismo numero esta escrito en `index.css` (`@media (max-width: 899px)`), porque
 * CSS no puede leer un modulo TS. Que los dos valores no se separen NO se deja a la
 * disciplina: `useIsMobile.test.ts` lee el CSS y compara.
 *
 * Por debajo de 900px: la barra lateral sale del flujo, los objetivos tactiles suben
 * a 44px y los campos de texto a 16px (por debajo, Safari hace zoom al enfocar).
 */
export const CONSULTA_MOVIL = '(max-width: 899px)';

/**
 * Lo minimo de `MediaQueryList` que usa este modulo. Declarado a mano para que el
 * test pueda inyectar un doble: `MediaQueryList` entero son 20 miembros de DOM que
 * aqui no pinta nada.
 */
export interface MediaLike {
  matches: boolean;
  addEventListener(tipo: 'change', oyente: (e: { matches: boolean }) => void): void;
  removeEventListener(tipo: 'change', oyente: (e: { matches: boolean }) => void): void;
}

/** `window`, o el doble del test. `matchMedia` es opcional: no todo entorno lo trae. */
export interface VentanaLike {
  matchMedia?: (consulta: string) => MediaLike;
}

/** `window` de verdad, o `null` fuera del navegador (un test que importe esto). */
const ventana = (): VentanaLike | null => (typeof window === 'undefined' ? null : window);

/** Ancho actual. Sin `window` responde `false` (escritorio) en vez de lanzar. */
export function esMovil(win: VentanaLike | null = ventana()): boolean {
  return win?.matchMedia?.(CONSULTA_MOVIL).matches ?? false;
}

/**
 * Suscribe `cb` a los cambios de ancho y devuelve la limpieza. No invoca `cb` con el
 * valor inicial a proposito: ese lo da `esMovil` en el primer render, que es lo que
 * evita el parpadeo de un layout de escritorio en un telefono.
 */
export function observarMovil(
  cb: (movil: boolean) => void,
  win: VentanaLike | null = ventana(),
): () => void {
  const mql = win?.matchMedia?.(CONSULTA_MOVIL);
  if (!mql) return () => {};
  const alCambiar = (e: { matches: boolean }) => cb(e.matches);
  mql.addEventListener('change', alCambiar);
  return () => mql.removeEventListener('change', alCambiar);
}

/**
 * `true` por debajo de 900px de ancho real, reaccionando al giro y al redimensionado.
 *
 * Sustituye al toggle falso de «vista movil» que vivia en `state.tsx`: las ramas de
 * tarjetas que ya tenian las pantallas de admin se activan ahora por ancho, no por
 * un boton de demostracion en el encabezado.
 */
export function useIsMobile(): boolean {
  const [movil, setMovil] = useState(esMovil);
  useEffect(() => observarMovil(setMovil), []);
  return movil;
}
