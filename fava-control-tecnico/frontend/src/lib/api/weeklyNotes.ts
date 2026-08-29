import { apiBlob, apiFetch, apiSend } from './client';

// NOTA-01/02/03, CAT-06 y AUD-02.

export type NoteStatus = 'draft' | 'submitted' | 'approved' | 'returned';

/** NOTA-08. Máximo 4 de cada uno: son las filas fijas que imprime la Nota. */
export interface Gasto {
  descripcion: string;
  valor: string;
}

export interface WeeklyNote {
  id: string;
  technicianId: string;
  technicianName: string;
  projectId: string;
  projectName: string;
  clientName: string;
  /** Lunes de la semana, 'YYYY-MM-DD'. */
  weekStart: string;
  status: NoteStatus;
  /** NOTA-09: el cargo de ESA semana, que puede no ser el del maestro. */
  roleTypeId: string | null;
  roleTypeName: string | null;
  /** NOTA-03: lo que el técnico lee para saber qué corregir. */
  returnComment: string | null;
  /**
   * Se devuelve tal cual en la siguiente transición. Es lo que hace que dos admins
   * aprobando a la vez no se pisen: el segundo recibe 409 en vez de ganar por llegar
   * más tarde.
   */
  updatedAt: string;
  /** NOTA-07: sube con cada reapertura. El PDF de cada versión se conserva aparte. */
  version: number;
  /** Hay firma para la versión actual. El hash en sí no se expone al cliente. */
  signed: boolean;
  gastosTecnico: Gasto[];
  anticiposCliente: Gasto[];
}

/**
 * La MISMA ruta sirve al admin y al técnico: RLS filtra por `app.technician_id` cuando
 * no es admin, así que no hay dos endpoints ni un parámetro de técnico que falsear.
 */
/** `technicianId` solo lo mandan las pantallas de técnico: ver el comentario del @Get()
    en weekly-notes.controller.ts (una cuenta admin NO está acotada por RLS). */
export const listNotes = (status?: NoteStatus, technicianId?: string | null) => {
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (technicianId) q.set('technicianId', technicianId);
  const qs = q.toString();
  return apiFetch<WeeklyNote[]>(`/weekly-notes${qs ? `?${qs}` : ''}`);
};

/** NOTA-01: el técnico manda SU semana y recibe las notas ya derivadas, una por proyecto. */
export const submitWeek = (weekStart: string) =>
  apiSend<WeeklyNote[]>('/weekly-notes/submit', 'POST', { weekStart });

export const approveNote = (id: string, expectedUpdatedAt: string, onBehalfOfId?: string) =>
  apiSend<WeeklyNote>(`/weekly-notes/${id}/approve`, 'POST', { expectedUpdatedAt, onBehalfOfId });

/** Sin comentario no se devuelve: lo exigen el servicio Y un CHECK del motor. */
export const returnNote = (id: string, reason: string, expectedUpdatedAt: string) =>
  apiSend<WeeklyNote>(`/weekly-notes/${id}/return`, 'POST', { reason, expectedUpdatedAt });

export const reopenNote = (id: string, reason: string, expectedUpdatedAt: string) =>
  apiSend<WeeklyNote>(`/weekly-notes/${id}/reopen`, 'POST', { reason, expectedUpdatedAt });

export const setNoteRole = (id: string, roleTypeId: string | null) =>
  apiSend<WeeklyNote>(`/weekly-notes/${id}/role`, 'PUT', { roleTypeId });

// ── Fase 5: gastos, firma y PDF ──

export const setNoteExpenses = (id: string, gastosTecnico: Gasto[], anticiposCliente: Gasto[]) =>
  apiSend<WeeklyNote>(`/weekly-notes/${id}/expenses`, 'PUT', { gastosTecnico, anticiposCliente });

/** Una de las dos firmas del `POST /sign`. `imagePng` va en base64, sin el `data:`. */
export interface FirmaEntrada {
  signerName: string;
  signerDocument?: string;
  signerRole?: string;
  declarationAccepted: true;
  imagePng: string;
}

/**
 * Las dos firmas viajan JUNTAS porque el PDF se renderiza una sola vez con ambas
 * casillas estampadas: firmar es atómico o no es. El servidor congela los bytes y
 * devuelve la nota ya marcada como firmada.
 */
export const signNote = (
  id: string,
  technician: FirmaEntrada,
  client: FirmaEntrada,
  expectedUpdatedAt: string,
) => apiSend<WeeklyNote>(`/weekly-notes/${id}/sign`, 'POST', { technician, client, expectedUpdatedAt });

/** Un día de la nota, tal cual se pinta. Menos campos que la bitácora: aquí solo se lee. */
export interface DiaNota {
  date: string;
  conceptCode: string | null;
  description: string | null;
  inFactory: boolean;
  commessaShort: string | null;
  /** La máquina contratada, o el texto crudo del Excel en las jornadas migradas. */
  machine: string | null;
}

/**
 * Los 7 días de la nota. Se piden por la NOTA y no por la bitácora del técnico porque
 * `GET /daily-entries` exige un técnico vinculado y el admin no lo tiene: le devolvía
 * 409 y los días salían en blanco.
 */
export const noteDays = (id: string) => apiFetch<DiaNota[]>(`/weekly-notes/${id}/dias`);

/** Se renderiza al vuelo y no congela nada: es el borrador de antes de firmar. */
export const previewNotePdf = (id: string) => apiBlob(`/weekly-notes/${id}/pdf/preview`);

/** Los bytes YA firmados. 404 mientras la nota no tenga firma. */
export const downloadNotePdf = (id: string) => apiBlob(`/weekly-notes/${id}/pdf`);

/** CAT-06: lo que el diálogo de baja necesita ANTES de desactivar a nadie. */
export const pendingNotes = (technicianId: string) =>
  apiFetch<{ count: number }>(`/technicians/${technicianId}/pending-notes`);

// ── AUD-02 ──

export interface AuditRow {
  id: string;
  actorId: string;
  actorName: string;
  onBehalfOfId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

/** Solo Super Admin. El log no se escribe desde el cliente: no existe POST. */
export const listAudit = (p: { entity?: string; entityId?: string; take?: number } = {}) => {
  const q = new URLSearchParams();
  if (p.entity) q.set('entity', p.entity);
  if (p.entityId) q.set('entityId', p.entityId);
  if (p.take) q.set('take', String(p.take));
  const s = q.toString();
  return apiFetch<AuditRow[]>(`/audit${s ? `?${s}` : ''}`);
};

// NOTA-08b — los comprobantes de gasto: la foto del ticket.

export interface Receipt {
  id: string;
  label: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const listReceipts = (noteId: string) =>
  apiFetch<Receipt[]>(`/weekly-notes/${noteId}/receipts`);

/**
  * Los bytes de un comprobante, para pintarlo.
  *
  * NO se puede poner la ruta en un `<img src>`: el endpoint va con Bearer y una etiqueta
  * `img` no manda cabeceras, asi que devolveria 401 y saldria la imagen rota. Se trae
  * con `apiBlob` —igual que el PDF firmado— y se pinta desde un objeto de URL.
  */
export const receiptBlob = (noteId: string, receiptId: string) =>
  apiBlob(`/weekly-notes/${noteId}/receipts/${receiptId}`);

export const uploadReceipt = (
  noteId: string,
  body: { label: string; mimeType: string; dataBase64: string },
) => apiSend<Receipt[]>(`/weekly-notes/${noteId}/receipts`, 'POST', body);

export const deleteReceipt = (noteId: string, receiptId: string) =>
  apiSend<Receipt[]>(`/weekly-notes/${noteId}/receipts/${receiptId}`, 'DELETE', undefined);

/**
 * Reduce la foto ANTES de subirla, y no es un adorno: una foto de movil son 3-8 MB y
 * los bytes acaban en una columna de Postgres cuyo volumen tiene 5 GB. A 1600px de
 * lado mayor un ticket sigue siendo perfectamente legible y pesa ~300 KB.
 *
 * Devuelve base64 SIN la cabecera `data:`, que es lo que espera el servidor.
 */
export function reducirImagen(file: File, maxLado = 1600, calidad = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    // Un PDF no se redimensiona: se sube tal cual y el tope del servidor decide.
    if (file.type === 'application/pdf') return resolve(leerBase64(file));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      const ctx = lienzo.getContext('2d');
      if (!ctx) return reject(new Error('SIN_CANVAS'));
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      resolve(lienzo.toDataURL('image/jpeg', calidad).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGEN_ILEGIBLE'));
    };
    img.src = url;
  });
}

const leerBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(new Error('LECTURA_FALLIDA'));
    fr.readAsDataURL(file);
  });
