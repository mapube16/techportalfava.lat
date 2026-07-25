import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AUDIT, EXPENSES, NOTES, PROJECTS, USERS, WEEK } from './data';
import { D } from './i18n';
import type { Dict } from './i18n';
import type {
  AuditRow, DayEntry, Density, Expense, Lang, Note, Project, Role, Route, Theme, ToastData, User,
} from './types';

export type KpiSeg = 'project' | 'tech' | 'phase';

export interface AppState {
  loggedIn: boolean;
  theme: Theme;
  lang: Lang;
  density: Density;
  role: Role;
  route: Route;
  loading: boolean;
  toast: ToastData | null;
  kpiSeg: KpiSeg;
  logOpen: boolean;
  returnOpen: boolean;
  returnId: string | null;
  projOpen: boolean;
  inviteOpen: boolean;
  pdfOpen: boolean;
  mobile: boolean;
  search: string;
  onboard: boolean;
  onboardStep: number;
  selProject: string;
  users: User[];
  projects: Project[];
  notes: Note[];
  week: DayEntry[];
  expenses: Expense[];
  audit: AuditRow[];
}

const initialState: AppState = {
  loggedIn: false,
  theme: 'light',
  lang: 'es',
  density: 'comfortable',
  role: 'S',
  route: 'kpis',
  loading: false,
  toast: null,
  kpiSeg: 'project',
  logOpen: false,
  returnOpen: false,
  returnId: null,
  projOpen: false,
  inviteOpen: false,
  pdfOpen: false,
  mobile: false,
  search: '',
  onboard: false,
  onboardStep: 0,
  selProject: 'p2',
  users: USERS.map((u) => ({ ...u })),
  projects: PROJECTS.map((p) => ({ ...p })),
  notes: NOTES.map((n) => ({ ...n })),
  week: WEEK,
  expenses: EXPENSES,
  audit: AUDIT,
};

export interface AppCtx {
  state: AppState;
  t: Dict;
  patch: (p: Partial<AppState>) => void;
  go: (r: Route) => void;
  showToast: (kind: string) => void;
  inboxCount: () => number;
  login: () => void;
  logout: () => void;
  switchRole: (role: Role) => void;
  goInbox: () => void;
  toggleTheme: () => void;
  toggleLang: () => void;
  approve: (id: string) => void;
  returnNote: (id: string, comment: string) => void;
  resend: (id: string) => void;
  addUser: (u: User) => void;
  addProject: (p: Project) => void;
  closeOnboard: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toastTimer = useRef<number | undefined>(undefined);
  const loadTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    clearTimeout(loadTimer.current);
  }, []);

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }));
  const t = D[state.lang];

  const showToast = (kind: string) => {
    const dict = D[stateRef.current.lang] as unknown as Record<string, string>;
    patch({ toast: { title: dict['toast_' + kind], body: dict['toast_' + kind + '_b'], kind } });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => patch({ toast: null }), 3200);
  };

  const go = (r: Route) => {
    if (r === stateRef.current.route) return;
    patch({ loading: true });
    clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => patch({ route: r, loading: false }), 320);
  };

  const inboxCount = () => stateRef.current.notes.filter((n) => n.status === 'sent').length;

  const login = () => {
    patch({ loading: true });
    let seen = false;
    try {
      seen = localStorage.getItem('fava_onboard') === '1';
    } catch {
      /* almacenamiento no disponible */
    }
    window.setTimeout(
      () => patch({ loggedIn: true, loading: false, route: 'kpis', role: 'S', onboard: !seen, onboardStep: 0 }),
      400,
    );
  };

  const logout = () => patch({ loggedIn: false });

  const switchRole = (role: Role) => {
    const first: Record<Role, Route> = { T: 'home', A: 'inbox', S: 'kpis' };
    patch({ role });
    go(first[role]);
  };

  const goInbox = () => {
    if (stateRef.current.role === 'T') patch({ role: 'A' });
    go('inbox');
  };

  const toggleTheme = () => patch({ theme: stateRef.current.theme === 'dark' ? 'light' : 'dark' });
  const toggleLang = () => patch({ lang: stateRef.current.lang === 'es' ? 'it' : 'es' });

  const approve = (id: string) => {
    setState((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, status: 'approved' } : n)) }));
    showToast('approved');
  };

  const returnNote = (id: string, comment: string) => {
    setState((s) => ({
      ...s,
      notes: s.notes.map((n) => (n.id === id ? { ...n, status: 'returned', comment: comment || n.comment } : n)),
      returnOpen: false,
      returnId: null,
    }));
    showToast('returned');
  };

  const resend = (id: string) => {
    setState((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, status: 'sent', comment: '' } : n)) }));
    showToast('submitted');
  };

  const addUser = (u: User) => {
    setState((s) => ({ ...s, users: [...s.users, u], inviteOpen: false }));
    showToast('invite');
  };

  const addProject = (p: Project) => {
    setState((s) => ({ ...s, projects: [...s.projects, p], projOpen: false, selProject: p.id }));
    showToast('proj');
    go('project');
  };

  const closeOnboard = () => {
    try {
      localStorage.setItem('fava_onboard', '1');
    } catch {
      /* almacenamiento no disponible */
    }
    patch({ onboard: false, onboardStep: 0 });
  };

  const value: AppCtx = {
    state, t, patch, go, showToast, inboxCount, login, logout, switchRole, goInbox,
    toggleTheme, toggleLang, approve, returnNote, resend, addUser, addProject, closeOnboard,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
}
