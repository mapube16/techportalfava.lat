import { apiFetch, apiSend } from './client';

// BIT-01/02/04. La bitácora es del TÉCNICO: el servidor la aísla por `app.technician_id`
// (RLS), así que estas llamadas nunca mandan un id de técnico — lo pone el token.

export type ConceptCode = 'DC' | 'MD' | 'DFD' | 'DVSF' | 'DVRC' | 'LR' | 'NR' | 'IL';
export type Phase = 'MONTAJE' | 'COLLAUDO';
export type EntryStatus = 'draft' | 'submitted' | 'approved' | 'returned';

/** La fila del día tal cual la devuelve el API. `date` es 'YYYY-MM-DD', nunca un instante. */
export interface Entry {
  date: string;
  projectId: string | null;
  /** Denormalizado: un proyecto cerrado ya no sale del selector pero el día se pinta igual. */
  projectName: string | null;
  /** La máquina CONTRATADA. Es lo que distingue dos `PL 6000` del mismo proyecto. */
  orderId: string | null;
  orderLabel: string | null;
  /** Como se nombra la máquina en obra: «3428». */
  commessaShort: string | null;
  /** La etiqueta de la orden, o el modelo si la jornada viene migrada del Excel. */
  machineCode: string | null;
  conceptCode: ConceptCode | null;
  phase: Phase | null;
  /** «En Fabrica»: modificador de DC y DFD, no un concepto aparte. */
  inFactory: boolean;
  description: string | null;
  status: EntryStatus;
  /** Lo único contra lo que el borrador local puede detectar un conflicto. */
  updatedAt: string;
}

export interface Week {
  /** Los límites que impone el SERVIDOR, con tolerancia de huso. Mandan sobre los del cliente. */
  minDate: string;
  maxDate: string;
  entries: Entry[];
}

/** Lo que se escribe. El servidor calcula el resto (estado, técnico, fecha de la ruta). */
export interface EntryInput {
  projectId: string | null;
  orderId: string | null;
  conceptCode: ConceptCode | null;
  phase: Phase | null;
  inFactory: boolean;
  description: string | null;
}

/** Rango máximo de 30 días: sin techo un `from` lejano se trae la tabla entera. */
export const getWeek = (from: string, to: string) =>
  apiFetch<Week>(`/daily-entries?from=${from}&to=${to}`);

/**
 * PUT idempotente por clave natural `(técnico, fecha)`. Reintentar tras un timeout es
 * seguro: no hay cabecera de idempotencia porque no hace falta — verificado con 8
 * escrituras concurrentes sobre la misma clave (1 fila, cero P2002).
 */
export const putEntry = (date: string, body: EntryInput) =>
  apiSend<Entry>(`/daily-entries/${date}`, 'PUT', body);
