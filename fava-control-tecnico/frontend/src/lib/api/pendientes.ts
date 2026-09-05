import { apiFetch } from './client';

/**
 * Lo que al propio técnico le falta por hacer (`GET /api/me/pendientes`) — diseño 3b.
 *
 * El servidor devuelve TODAS las semanas de la ventana editable con sus cuentas; la
 * pantalla decide cuáles están sin enviar (borradores > 0 o nada registrado), cuál es la
 * de hoy, y si el corte del 25 ya está encima. Las notas devueltas y las que faltan por
 * firmar salen de `listNotes`, que ya lo trae todo.
 */

export interface SemanaPendiente {
  /** Lunes, 'YYYY-MM-DD'. */
  lunes: string;
  registrados: number;
  borradores: number;
}

export interface Pendientes {
  minDate: string;
  maxDate: string;
  /** El día en que Andrea cierra el mes (25). Viene del servidor: la regla vive allí. */
  diaCorte: number;
  semanas: SemanaPendiente[];
}

export const getPendientes = () => apiFetch<Pendientes>('/me/pendientes');
