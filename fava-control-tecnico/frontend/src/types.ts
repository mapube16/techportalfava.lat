export type Lang = 'es' | 'it';
export type Theme = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type Role = 'T' | 'A' | 'S';
export type Route =
  | 'home' | 'week' | 'notes' | 'inbox' | 'projects' | 'project'
  | 'techs' | 'users' | 'kpis' | 'audit' | 'config';
export type NoteStatus = 'draft' | 'sent' | 'approved' | 'returned';
export type Phase = 'Montaje' | 'Collaudo';
export type RoleType = 'Mecánico' | 'Meccatronico' | 'Eléctrico';
export type PhaseMatrix = Record<Phase, Record<RoleType, number>>;

export interface Project {
  id: string;
  name: string;
  client: string;
  oa: string;
  country: string;
  value: number;
  cur: string;
  nh: number;
  machines: string[];
  sold: PhaseMatrix;
  done: PhaseMatrix;
}

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

export interface Tech {
  n: string;
  type: 'mechanic' | 'mecatronic' | 'electric';
  ext: boolean;
  active: boolean;
  util: number;
}

export interface User {
  n: string;
  mail: string;
  roles: Role[];
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
