import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AUDIT, EXPENSES, NOTES, WEEK } from './data';
import { D } from './i18n';
import type { Dict } from './i18n';
import { initAuth, login as msalLogin, logout as msalLogout } from './lib/auth/msal';
import { devLogin as devSignIn, devLogout, getDevToken } from './lib/auth/dev';
import { getMe, setMyLang, setUnauthorizedHandler } from './lib/api/client';
import { textoError } from './lib/errores';
import type { MeResponse } from './lib/api/client';
import type {
  AuditRow, DayEntry, Density, Expense, Lang, Note, Role, Route, Theme, ToastData,
} from './types';

export type KpiSeg = 'project' | 'tech' | 'phase';

/** 'boot' = aún no sabemos; el resto lo dicta GET /api/me. */
export type SessionStatus = 'boot' | 'anon' | 'ok' | 'not_invited' | 'deactivated';

// El tecnico entra DONDE TRABAJA. Antes aterrizaba en «Inicio», que era la lista de
// notas con dos botones encima y un contador roto («67 / 7», porque contaba notas de
// todos los tiempos en vez de dias de la semana). No tenia ni un dato que no
// estuviera en «Mis notas».
const FIRST_ROUTE: Record<Role, Route> = { T: 'week', A: 'inbox', S: 'kpis' };
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
  /** Fecha 'YYYY-MM-DD' que abre el drawer. `null` = hoy. Sale de la fila de la semana. */
  logDate: string | null;
  returnOpen: boolean;
  returnId: string | null;
  /** El `updated_at` que se leyó al abrir el modal: el bloqueo optimista del devolver. */
  returnUpdatedAt: string | null;
  projOpen: boolean;
  inviteOpen: boolean;
  /** La vista previa del PDF es SIEMPRE de una nota concreta: sin id no hay qué pintar. */
  /**
   * Las notas que quedan POR FIRMAR del envio recien hecho, en orden.
   *
   * Firmar es el consentimiento del envio, asi que se pide al enviar y no despues. Era
   * `firmarId` —una sola— y ahi estaba el fallo: una semana en dos proyectos genera DOS
   * notas y solo se ofrecia firmar la primera. La segunda se quedaba sin firma y sin
   * que nadie la pidiera. Al firmar una se abre la siguiente hasta que no queda ninguna.
   */
  porFirmar: string[];
  pdfOpen: boolean;
  pdfNoteId: string | null;
  /** Firmada = se piden los bytes congelados; si no, el borrador renderizado al vuelo. */
  pdfSigned: boolean;
  search: string;
  onboard: boolean;
  onboardStep: number;
  selProject: string;
  /**
   * Contador que las pantallas cableadas al API llevan en las deps de su carga.
   * Un modal que crea algo lo incrementa (`refresh()`) y la lista de detrás se
   * recarga. Es lo que sustituye a los arrays de mocks que vivían aquí.
   */
  dataVersion: number;
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
  logDate: null,
  returnOpen: false,
  returnId: null,
  returnUpdatedAt: null,
  projOpen: false,
  inviteOpen: false,
  porFirmar: [],
  pdfOpen: false,
  pdfNoteId: null,
  pdfSigned: false,
  search: '',
  onboard: false,
  onboardStep: 0,
  selProject: '',
  dataVersion: 0,
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
  /**
   * El código de error del servidor, en cristiano y en el idioma de la sesión.
   *
   * Vive en el contexto y no como import suelto para que ninguna pantalla tenga que
   * andar pasando `state.lang`: son 35 sitios que muestran errores y el idioma no es
   * asunto suyo.
   */
  errTexto: (codigo: string) => string;
  /** Recargar las listas que leen del API (ver `dataVersion`). */
  refresh: () => void;
  inboxCount: () => number;
  login: () => void;
  /** Solo con VITE_DEV_AUTH=true; ver lib/auth/dev.ts. */
  devLogin: (email: string, password: string) => Promise<void>;
  logout: () => void;
  goInbox: () => void;
  toggleTheme: () => void;
  toggleLang: () => void;
  approve: (id: string) => void;
  returnNote: (id: string, comment: string) => void;
  resend: (id: string) => void;
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
      // El idioma vuelve del servidor: elegirlo una vez vale para todos los
      // dispositivos, y es el mismo con el que se le escriben los correos.
      lang: me.user.lang,
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

  const refresh = () => setState((s) => ({ ...s, dataVersion: s.dataVersion + 1 }));

  const go = (r: Route) => {
    if (r === stateRef.current.route) return;
    patch({ loading: true });
    clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => patch({ route: r, loading: false }), 320);
  };

  const inboxCount = () => stateRef.current.notes.filter((n) => n.status === 'submitted').length;

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

  // `switchRole` se retiró con el selector T·A·S: cada persona entra con SU cuenta.
  // `state.role` sigue existiendo porque gobierna la navegación, pero ya no se conmuta
  // desde la interfaz — lo fija `applyMe` con el rol más alto que trae /api/me.

  const goInbox = () => {
    const { role, myRoles } = stateRef.current;
    const admin = ROLE_RANK.find((r) => r !== 'T' && myRoles.includes(r));
    if (!admin) return; // un técnico raso no tiene bandeja de aprobación
    if (role === 'T') patch({ role: admin });
    go('inbox');
  };

  const toggleTheme = () => patch({ theme: stateRef.current.theme === 'dark' ? 'light' : 'dark' });
  /**
   * Tres idiomas y UN botón: el que hay en el encabezado muestra el idioma actual y
   * pasa al siguiente. Se queda en botón y no en desplegable porque el rótulo ya dice
   * dónde estás (ES → IT → PT → ES) y son tres, no doce.
   *
   * El ciclo sale de las claves de `D`, no de una lista aparte: añadir un idioma al
   * diccionario lo mete en la rueda sin tocar esto.
   */
  const toggleLang = () => {
    const langs = Object.keys(D) as Lang[];
    const i = langs.indexOf(stateRef.current.lang);
    const lang = langs[(i + 1) % langs.length];
    patch({ lang });
    // Y se guarda en el servidor, que es de donde salen los correos de la Fase 9. La
    // interfaz cambia al instante y no espera a la respuesta: si la llamada falla, lo
    // que se pierde es el idioma del PRÓXIMO correo, no la traducción de la pantalla.
    if (stateRef.current.loggedIn) void setMyLang(lang).catch(() => {});
  };

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
  returnUpdatedAt: null,
    }));
    showToast('returned');
  };

  const resend = (id: string) => {
    setState((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, status: 'submitted', comment: '' } : n)) }));
    showToast('submitted');
  };

  const closeOnboard = () => {
    try {
      localStorage.setItem('fava_onboard', '1');
    } catch {
      /* almacenamiento no disponible */
    }
    patch({ onboard: false, onboardStep: 0 });
  };

  const errTexto = (codigo: string) => textoError(codigo, state.lang);

  const value: AppCtx = {
    state, t, patch, go, showToast, errTexto, refresh, inboxCount, login, devLogin, logout, goInbox,
    toggleTheme, toggleLang, approve, returnNote, resend, closeOnboard,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
}
