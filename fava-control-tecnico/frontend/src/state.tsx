import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AUDIT, EXPENSES, NOTES, PROJECTS, USERS, WEEK } from './data';
import { D } from './i18n';
import type { Dict } from './i18n';
import { initAuth, login as msalLogin, logout as msalLogout } from './lib/auth/msal';
import { devLogin as devSignIn, devLogout, getDevToken } from './lib/auth/dev';
import { getMe, setUnauthorizedHandler } from './lib/api/client';
import type { MeResponse } from './lib/api/client';
import type {
  AuditRow, DayEntry, Density, Expense, Lang, Note, Project, Role, Route, Theme, ToastData, User,
} from './types';

export type KpiSeg = 'project' | 'tech' | 'phase';

/** 'boot' = aún no sabemos; el resto lo dicta GET /api/me. */
export type SessionStatus = 'boot' | 'anon' | 'ok' | 'not_invited' | 'deactivated';

const FIRST_ROUTE: Record<Role, Route> = { T: 'home', A: 'inbox', S: 'kpis' };
// Si el usuario tiene varios roles, el más alto manda al entrar.
const ROLE_RANK: Role[] = ['S', 'A', 'T'];

export interface AppState {
  sessionStatus: SessionStatus;
  me: MeResponse | null;
  myRoles: Role[];
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
  sessionStatus: 'boot',
  me: null,
  myRoles: [],
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
  /** Solo con VITE_DEV_AUTH=true; ver lib/auth/dev.ts. */
  devLogin: (email: string, password: string) => Promise<void>;
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

  const applyMe = (me: MeResponse) => {
    if (me.status !== 'ok') {
      patch({ sessionStatus: me.status, me, myRoles: [], loggedIn: false, loading: false });
      return;
    }
    const roles = me.user.roles;
    const role = ROLE_RANK.find((r) => roles.includes(r)) ?? 'T';
    let seen = false;
    try {
      seen = localStorage.getItem('fava_onboard') === '1';
    } catch {
      /* almacenamiento no disponible */
    }
    patch({
      sessionStatus: 'ok', me, myRoles: roles, loggedIn: true, loading: false,
      role, route: FIRST_ROUTE[role], onboard: !seen, onboardStep: 0,
    });
  };

  // Sesión real: MSAL resuelve la cuenta y GET /api/me decide qué pantalla ve el
  // usuario (ok / no invitado / desactivado). Ni el rol ni el acceso salen del cliente.
  useEffect(() => {
    let alive = true;
    setUnauthorizedHandler(() => {
      // Token muerto en cualquier llamada: vuelta a anónimo.
      devLogout(); // si era una sesión de desarrollo, el token muerto se tira
      if (alive) patch({ sessionStatus: 'anon', me: null, myRoles: [], loggedIn: false });
    });
    (async () => {
      try {
        // Sesión de desarrollo ya abierta en esta pestaña: MSAL no interviene.
        if (getDevToken()) {
          const meDev = await getMe();
          if (alive) applyMe(meDev);
          return;
        }
        const account = await initAuth();
        if (!alive) return;
        if (!account) {
          patch({ sessionStatus: 'anon' });
          return;
        }
        const me = await getMe();
        if (alive) applyMe(me);
      } catch (e) {
        console.error('sesión', e);
        if (alive) patch({ sessionStatus: 'anon', me: null, myRoles: [], loggedIn: false });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // loginRedirect sale de la página; al volver, el efecto de arriba retoma la sesión.
  const login = () => {
    patch({ loading: true });
    void msalLogin();
  };

  // Email + contraseña compartida contra POST /api/dev-auth/login. El servidor
  // decide igual que siempre: esto solo consigue el token, no el acceso.
  const devLogin = async (email: string, password: string) => {
    patch({ loading: true });
    try {
      await devSignIn(email, password);
      applyMe(await getMe());
    } catch (e) {
      patch({ loading: false });
      throw e; // Login.tsx muestra el error genérico
    }
  };

  const logout = () => {
    patch({ sessionStatus: 'anon', me: null, myRoles: [], loggedIn: false });
    if (getDevToken()) {
      devLogout(); // no hay sesión de Microsoft que cerrar
      return;
    }
    void msalLogout();
  };

  // Cambiar de rol cambia navegación y filtros, NUNCA permisos: los permisos son
  // del servidor. Solo se permiten los roles que el API asignó a este usuario.
  const switchRole = (role: Role) => {
    if (!stateRef.current.myRoles.includes(role)) return;
    patch({ role });
    go(FIRST_ROUTE[role]);
  };

  const goInbox = () => {
    const { role, myRoles } = stateRef.current;
    const admin = ROLE_RANK.find((r) => r !== 'T' && myRoles.includes(r));
    if (!admin) return; // un técnico raso no tiene bandeja de aprobación
    if (role === 'T') patch({ role: admin });
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
    state, t, patch, go, showToast, inboxCount, login, devLogin, logout, switchRole, goInbox,
    toggleTheme, toggleLang, approve, returnNote, resend, addUser, addProject, closeOnboard,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
}
