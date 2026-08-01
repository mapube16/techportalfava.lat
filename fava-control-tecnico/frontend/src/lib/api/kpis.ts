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
