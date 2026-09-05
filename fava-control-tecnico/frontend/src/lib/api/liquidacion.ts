import { apiBlob, apiFetch } from './client';
import type { ConceptCode } from './dailyEntries';

/**
 * La liquidación del mes (`GET /api/liquidacion?period=YYYY-MM&mode=cut|calendar`).
 * Solo días APROBADOS; lo pendiente viaja aparte. Ni un importe: cantidades.
 */

export type Modo = 'cut' | 'calendar';

export interface Celda {
  /** `null` = el concepto no aplica a este tipo de técnico (LR externo, NR interno). */
  approved: number | null;
  pending: number;
}

export type EstadoFila =
  | { kind: 'ready' }
  | { kind: 'unapproved'; n: number }
  | { kind: 'unsent'; n: number }
  | { kind: 'none' };

export interface FilaLiquidacion {
  technicianId: string;
  name: string;
  employmentType: string;
  cells: Record<string, Celda>;
  total: number;
  state: EstadoFila;
}

export interface Liquidacion {
  period: string;
  mode: Modo;
  from: string;
  to: string;
  concepts: { code: ConceptCode; labelEs: string; labelIt: string }[];
  summary: { tecnicos: number; listos: number; pendientes: number; dias: number };
  rows: FilaLiquidacion[];
}

export const getLiquidacion = (period: string, mode: Modo) =>
  apiFetch<Liquidacion>(`/liquidacion?period=${period}&mode=${mode}`);

/** El .xlsx, como bytes. La pantalla lo ofrece con `<a download>`. */
export const liquidacionXlsx = (period: string, mode: Modo) =>
  apiBlob(`/liquidacion/xlsx?period=${period}&mode=${mode}`);
