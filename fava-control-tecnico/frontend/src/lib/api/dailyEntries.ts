import { apiFetch, apiSend } from './client';

// BIT-01/02/04. La bitácora es del TÉCNICO: el servidor la aísla por `app.technician_id`
// (RLS), así que estas llamadas nunca mandan un id de técnico — lo pone el token.

export type ConceptCode = 'DC' | 'MD' | 'DFD' | 'DVSF' | 'DVRC' | 'LR' | 'NR' | 'IL' | 'OTRO';
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
  /** La columna NOTA del papel: horario del dia, o algo que Andrea deba saber. */
  dayNote: string | null;
  /** BIT-10: las máquinas ADICIONALES del día, además de `orderId`. */
  extraOrders: { id: string; label: string }[];
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
  dayNote: string | null;
  /**
   * BIT-10: las máquinas ADICIONALES del día. Mandar la lista —aunque esté vacía—
   * REEMPLAZA la selección; omitirla deja la que hubiera.
   */
  extraOrderIds?: string[];
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

/**
 * BIT-06 — la misma jornada en VARIOS dias, cada uno con su descripcion.
 *
 * Todo o nada: el servidor escribe dentro de la transaccion de la peticion, asi que si
 * un dia esta bloqueado no se queda media semana escrita.
 */
export const putEntries = (
  days: { date: string; description: string | null }[],
  body: Omit<EntryInput, 'description'>,
) => apiSend<Entry[]>('/daily-entries', 'PUT', { ...body, days });

// ── GASTO-01: los gastos del DÍA en que ocurren ──
//
// Iván lo pidió en la capacitación del 31-ago: «a veces uno efectuó el gasto de una vez,
// tiene la factura». Antes solo se podían escribir al enviar la nota — el viernes, de
// memoria y con el ticket ya perdido.

export interface DailyExpense {
  id: string;
  descripcion: string;
  valor: string;
  /** `null` = todavía sin comprobante. Se puede anotar el gasto y subir la foto después. */
  mimeType: string | null;
  sizeBytes: number | null;
}

export const getExpenses = (date: string) =>
  apiFetch<DailyExpense[]>(`/daily-entries/${date}/expenses`);

/** El comprobante es opcional: sin `dataBase64` se guarda solo la línea. */
export const addExpense = (
  date: string,
  body: { descripcion: string; valor: string; mimeType?: string; dataBase64?: string },
) => apiSend<DailyExpense>(`/daily-entries/${date}/expenses`, 'POST', body);

export const deleteExpense = (date: string, gastoId: string) =>
  apiFetch<{ id: string }>(`/daily-entries/${date}/expenses/${gastoId}`, { method: 'DELETE' });

/** La URL para ver el comprobante en pantalla (no descarga: se abre inline). */
export const expenseFileUrl = (date: string, gastoId: string) =>
  `/api/daily-entries/${date}/expenses/${gastoId}/file`;
