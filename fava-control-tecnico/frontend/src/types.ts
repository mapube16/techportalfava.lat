export type Lang = 'es' | 'it' | 'pt';
export type Theme = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type Role = 'T' | 'A' | 'S';
export type Route =
  | 'home' | 'week' | 'notes' | 'inbox' | 'allnotes' | 'projects' | 'project'
  | 'techs' | 'users' | 'kpis' | 'audit' | 'config';
export type NoteStatus = 'draft' | 'sent' | 'approved' | 'returned';

// Los tipos del dominio que ya tiene backend viven junto a su cliente tipado
// (`lib/api/*.ts`), que es donde está el contrato: proyecto, fase, matriz, técnico,
// usuario, catálogos. Aquí solo quedan los tipos de interfaz y los mocks que aún
// no tienen endpoint.

export interface Note {
  id: string;
  tech: string;
  ini: string;
  project: string;
  week: string;
  status: NoteStatus;
  days: number;
  expenses: number;
  comment: string;
}

export interface DayEntry {
  concept: string;
  desc: string;
}

export interface Expense {
  desc: string;
  date: string;
  val: string;
}

export interface AuditRow {
  actor: string;
  act: 'approve' | 'return' | 'submit' | 'edit' | 'grant' | 'create';
  ent: string;
  before: string;
  after: string;
  when: string;
}

export interface ToastData {
  title: string;
  body: string;
  kind: string;
}
