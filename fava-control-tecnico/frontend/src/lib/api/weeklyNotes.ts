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
export const listNotes = (status?: NoteStatus) =>
  apiFetch<WeeklyNote[]>(`/weekly-notes${status ? `?status=${status}` : ''}`);

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
