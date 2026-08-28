import { apiFetch } from './client';

// KPI-07: la cuadrícula de días por concepto. Reemplaza la tabla dinámica que hoy se
// mantiene a mano en el Excel y que sólo Andrea sabe refrescar.

export type ConceptCode = 'DC' | 'MD' | 'DFD' | 'DVSF' | 'DVRC' | 'LR' | 'NR' | 'IL';

/** Ausente = 0. La celda se pinta vacía y no «0»: una cuadrícula de ceros no se lee. */
export type Counts = Partial<Record<ConceptCode, number>>;

export interface GridMonth {
  month: number; // 1-12
  counts: Counts;
  total: number;
}

export interface GridTechnician {
  technicianId: string;
  technicianName: string;
  counts: Counts;
  total: number;
  months: GridMonth[];
}

export interface GridProject {
  /** `null` = «Sin Proyecto»: libres, no remunerados y días de fábrica. */
  projectId: string | null;
  projectName: string;
  counts: Counts;
  total: number;
  technicians: GridTechnician[];
}

export interface DayGrid {
  year: number | null;
  /** Las columnas, en el orden del catálogo, con su etiqueta ES/IT. */
  concepts: { code: ConceptCode; labelEs: string; labelIt: string }[];
  projects: GridProject[];
  counts: Counts;
  total: number;
}

export const getGridYears = () => apiFetch<number[]>('/kpis/years');

/** Sin `year`, todo el histórico junto. Los totales los calcula el servidor. */
export const getDayGrid = (year: number | null) =>
  apiFetch<DayGrid>(`/kpis/day-grid${year ? `?year=${year}` : ''}`);

// ── KPI-02: utilización por técnico ──

export interface UtilizationRow {
  technicianId: string;
  technicianName: string;
  technicianActive: boolean;
  counts: Counts;
  productive: number;
  nonProductive: number;
  excluded: number;
  /** Productivos + no productivos. Varía entre técnicos: no todos tienen el mismo
      tramo registrado, y por eso se muestra al lado del porcentaje. */
  denominator: number;
  /** `null` = sin días disponibles. No es 0 %: es que no hay porcentaje que dar. */
  utilizationPct: number | null;
}

export interface Utilization {
  year: number | null;
  /** La regla con la que se calculó, para poder imprimirla y no suponerla. */
  rule: { productive: ConceptCode[]; nonProductive: ConceptCode[]; excluded: ConceptCode[] };
  technicians: UtilizationRow[];
  productive: number;
  excluded: number;
  /** Días futuros pre-rellenados en el Excel que el servidor dejó fuera. */
  futureExcluded: number;
  denominator: number;
  utilizationPct: number | null;
}

export const getUtilization = (year: number | null) =>
  apiFetch<Utilization>(`/kpis/utilization${year ? `?year=${year}` : ''}`);

// KPI-01 / KPI-08: lo VENDIDO del contrato contra lo EJECUTADO en la bitacora.

export interface SoldRow {
  role: string;
  /** `null` = el ejecutado no dice de que fase es; el Excel no la registra en la hoja
      diaria. Se muestra tal cual en vez de repartirlo a ojo entre montaje y collaudo. */
  phase: 'MONTAJE' | 'COLLAUDO' | null;
  sold: number;
  executed: number;
}

export interface SoldProject {
  id: string;
  name: string;
  isActive: boolean;
  normalHours: number | null;
  rows: SoldRow[];
  sold: number;
  executed: number;
}

export const getSoldVsExecuted = (year: number | null) =>
  apiFetch<SoldProject[]>(`/kpis/sold-vs-executed${year ? `?year=${year}` : ''}`);
