/**
 * El borrador de la semana, como modulo puro: sin React, sin `window` y sin
 * `localStorage` — el `Storage` entra por parametro. Eso es lo que lo hace probable
 * con `node --test` sin DOM simulado, y es la unica parte del criterio 4 que si no
 * viviera aqui no tendria forma de probarse.
 *
 * «Sin caducidad» (decision bloqueada) significa que ESTE CODIGO no lo borra: el ITP
 * de WebKit se lleva todo el almacenamiento escribible por script — localStorage,
 * IndexedDB, SessionStorage y Service Workers — tras 7 dias de Safari en uso sin
 * visitar el sitio, asi que cambiar de tecnologia no lo evitaria. La UI no debe
 * prometer que el borrador es eterno.
 */

/** La fila del dia, igual a la que devuelve el API de la bitacora (03-04). */
export interface FilaDia {
  date: string; // 'YYYY-MM-DD'
  projectId: string | null;
  machineModelId: string | null;
  conceptCode: string | null;
  phase: 'MONTAJE' | 'COLLAUDO' | null;
  description: string | null;
}

export interface Borrador {
  entries: Record<string, FilaDia>;
  /** Marca del reloj del DISPOSITIVO al guardar. La sella `guardar`, no quien llama. */
  savedAt: number;
}

/** Una clave por (tecnico, semana): dos semanas abiertas no se pisan. */
export const claveBorrador = (technicianId: string, lunes: string) =>
  `fava_draft_${technicianId}_${lunes}`;

/**
 * ponytail: try/catch en las DOS direcciones. `localStorage` lanza en modo privado de
 * Safari y al pasarse de cuota; un borrador que no se puede guardar no puede tumbar la
 * pantalla de captura. Devuelve si lo consiguio para que la UI avise en vez de mentir.
 */
export function guardar(st: Storage, clave: string, b: Borrador): boolean {
  try {
    st.setItem(clave, JSON.stringify({ ...b, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function leer(st: Storage, clave: string): Borrador | null {
  try {
    const crudo = st.getItem(clave);
    return crudo ? (JSON.parse(crudo) as Borrador) : null;
  } catch {
    return null; // JSON corrupto de una version anterior: se ignora, no se explota
  }
}

export function borrar(st: Storage, clave: string): void {
  try {
    st.removeItem(clave);
  } catch {
    /* si ni borrar se puede, no hay nada que hacer ni nada que contar */
  }
}

/**
 * Deteccion de conflicto BARATA: no compara campo a campo, compara la marca del
 * servidor contra la del borrador. `updatedAt` del servidor > `savedAt` significa que
 * ese dia se escribio desde OTRO sitio DESPUES de que este dispositivo guardara: hay
 * dos versiones y decide el tecnico (decision bloqueada). Una comparacion de enteros
 * frente a cinco de strings con trim, y responde la pregunta correcta en vez de una
 * aproximada.
 *
 * Devuelve QUE DIAS chocan, no un booleano: el aviso tiene que nombrarlos.
 */
export function enConflicto(b: Borrador, servidor: { date: string; updatedAt: string }[]): string[] {
  return servidor
    .filter((f) => b.entries[f.date] && Date.parse(f.updatedAt) > b.savedAt)
    .map((f) => f.date);
}
