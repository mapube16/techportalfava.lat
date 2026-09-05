import { apiFetch } from './client';
import type { ConceptCode } from './dailyEntries';

/**
 * Los KPIs OPERATIVOS del propio técnico (`GET /api/me/kpis`).
 *
 * Nunca manda un id de técnico: lo pone el token, igual que la bitácora. Y no toca
 * `/api/kpis`, que es capacidad de administrador — ahí vive el vendido/ejecutado, que
 * es información comercial y no es del técnico.
 */

export interface MiMaquina {
  orderId: string;
  /** La etiqueta de la hoja de proyecto: «PL 6000 KG - 1-3428». */
  label: string;
  /** Como se nombra en obra: «3428». Falta en parte de lo migrado del Excel. */
  commessaShort: string | null;
  projectName: string;
  days: number;
}

export interface MiProyecto {
  projectId: string;
  name: string;
  clientName: string;
  days: number;
  firstDate: string;
  lastDate: string;
}

export interface MiConcepto {
  code: ConceptCode;
  labelEs: string;
  labelIt: string;
  days: number;
}

/** Días por mes, 'YYYY-MM'. Para la línea de «Mis días por mes». */
export interface MiMes {
  month: string;
  days: number;
}

export interface MiUtilizacion {
  productive: number;
  denominator: number;
  /** `null` sin días disponibles. */
  pct: number | null;
}

export interface MisKpis {
  year: number | null;
  /** Los años CON jornadas suyas. El selector sale de aquí, no de un rango inventado. */
  years: number[];
  totalDays: number;
  projectCount: number;
  machineCount: number;
  notes: { submitted: number; approved: number; returned: number };
  machines: MiMaquina[];
  projects: MiProyecto[];
  concepts: MiConcepto[];
  months: MiMes[];
  /** La PROPIA, con la regla del admin (KPI-02). Solo la suya: aquí no hay nadie más. */
  utilization: MiUtilizacion;
}

/** `year` a `null` = todo su histórico. */
export const getMisKpis = (year: number | null) =>
  apiFetch<MisKpis>(`/me/kpis${year === null ? '' : `?year=${year}`}`);
