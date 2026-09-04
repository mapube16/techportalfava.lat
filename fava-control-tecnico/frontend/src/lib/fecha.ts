/**
 * La fecha en el CLIENTE. Todo entra y sale como string 'YYYY-MM-DD': el objeto
 * `Date` solo existe dentro de estas funciones y nunca cruza la frontera del modulo.
 *
 * REGLA OPUESTA A LA DEL BACKEND (`backend/src/modules/daily-entries/fecha.ts`), y es
 * a proposito:
 *
 *   | Frontera                  | Correcto                          | Incorrecto              |
 *   |---------------------------|-----------------------------------|-------------------------|
 *   | Navegador -> string       | getters LOCALES                   | toISOString().slice(0,10)|
 *   | Servidor: string -> Postgres | new Date('YYYY-MM-DD') (UTC)   | new Date(y, m-1, d)     |
 *
 * Aqui el dia que importa es el del CALENDARIO DEL DISPOSITIVO: `toISOString()` daria
 * el dia ANTERIOR al este de UTC — verificado, las 00:30 del 14/07 en Roma salen como
 * '2026-07-13'. La aritmetica, en cambio, se hace toda sobre UTC justamente para que
 * el huso y el cambio de hora no la toquen.
 */

const dos = (n: number) => String(n).padStart(2, '0');

/** El dia del calendario del dispositivo. Getters LOCALES, nunca `toISOString`. */
export const hoyLocal = (ahora: Date = new Date()): string =>
  `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;

/**
 * Aritmetica de calendario SOBRE STRINGS: el `Date` solo existe dentro, y en UTC.
 * `setUTCDate` ya resuelve fin de mes, cambio de ano y bisiestos; sobre UTC el DST no
 * interviene (en Roma, el domingo del cambio de hora tiene 23 h locales y esto no se
 * entera). ponytail: por eso no hay date-fns — 4 lineas y cero dependencias.
 */
export const sumarDias = (s: string, n: number): string => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Lunes de la semana ISO de `s`. Domingo cuenta como el ultimo dia, no el primero. */
export const lunesDe = (s: string): string =>
  sumarDias(s, -((new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Los 7 dias de la semana que empieza en `lunes`. La grilla los pinta en este orden. */
export const diasDeSemana = (lunes: string): string[] =>
  Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

/**
 * Suelo de la ventana de registro en el CLIENTE: «mes en curso y el anterior».
 * Se calcula sobre el string, sin `Date`, porque el dia 1 no depende de nada.
 * El servidor calcula el suyo con tolerancia de huso y es el que manda (03-04).
 */
export const primerDiaMesAnterior = (hoy: string): string => {
  const [a, m] = hoy.split('-').map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${dos(m - 1)}-01`;
};

/**
 * La rejilla mensual de la bitacora: SIEMPRE 42 celdas (6 semanas de lunes a domingo)
 * que cubren el mes de `iso` y se completan con los dias de los meses vecinos.
 *
 * Fijo en 42 y no «las semanas que hagan falta» a proposito: con 35 unas veces y 42
 * otras, la rejilla cambia de alto al pasar de mes y el teclado de la derecha da un
 * salto. 42 es ademas el tope exacto del GET y del PUT del servidor, asi que el mes
 * entero cabe en una peticion de lectura y en una de escritura.
 */
export const rejillaDelMes = (iso: string): string[] => {
  const primero = `${iso.slice(0, 7)}-01`;
  return Array.from({ length: 42 }, (_, i) => sumarDias(lunesDe(primero), i));
};

/** Mueve `iso` `n` meses, quedandose en el dia 1. Sin `Date`: el dia 1 siempre existe. */
export const sumarMeses = (iso: string, n: number): string => {
  const [a, m] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}-01`;
};
