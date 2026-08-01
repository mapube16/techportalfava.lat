import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Globe, LogOut, Menu, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { svg, ICON, FavaLogo } from './icons';
import { initials } from './ui';
import { useApp } from './state';
import { useIsMobile } from './lib/useIsMobile';
import { useApiData } from './lib/api/useApiData';
import { listNotes } from './lib/api/weeklyNotes';
import type { Role, Route } from './types';
import Home from './screens/Home';
import Week from './screens/Week';
import Notes from './screens/Notes';
import Inbox from './screens/Inbox';
import Projects from './screens/Projects';
import ProjectDetail from './screens/ProjectDetail';
import Techs from './screens/Techs';
import Users from './screens/Users';
import Kpis from './screens/Kpis';
import Audit from './screens/Audit';
import Config from './screens/Config';
import LogDayDrawer from './components/LogDayDrawer';
import ReturnModal from './components/ReturnModal';
import NewProjectModal from './components/NewProjectModal';
import InviteUserModal from './components/InviteUserModal';
import PdfPreview from './components/PdfPreview';
import Onboarding from './components/Onboarding';
import Toast from './components/Toast';

function Screen() {
  const { state } = useApp();
  switch (state.route) {
    case 'home': return <Home />;
    case 'week': return <Week />;
    case 'notes': return <Notes />;
    case 'inbox': return <Inbox />;
    case 'projects': return <Projects />;
    case 'project': return <ProjectDetail />;
    case 'techs': return <Techs />;
    case 'users': return <Users />;
    case 'kpis': return <Kpis />;
    case 'audit': return <Audit />;
    case 'config': return <Config />;
    default: return <Kpis />;
  }
}

interface NavItem {
  key: string;
  route: Route;
  icon: ReactNode;
  label: string;
  badge?: number;
}

/**
 * El armazón de la app: barra lateral, encabezado y el hueco donde vive cada pantalla.
 *
 * Móvil primero, que es el orden de Tailwind: sin prefijo es teléfono y `md:` es
 * escritorio (≥900px). El padding de página, que antes era la variable `--gap-page`
 * cambiada por una media query, ahora es `p-3.5 md:p-6` — los mismos 14 y 24 píxeles,
 * pero dichos donde se usan.
 *
 * La barra lateral conserva la clase `.fava-aside` de `index.css`: en móvil sale del
 * flujo con `position: fixed` + `transform`, y ese estado se lee mejor junto en CSS que
 * repartido por el JSX.
 */
export default function Layout() {
  const { state, t, go, logout, goInbox, toggleTheme, toggleLang, patch } = useApp();
  const tr = t as unknown as Record<string, string>;
  const movil = useIsMobile();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const btnMenu = useRef<HTMLButtonElement>(null);

  // El contador de la bandeja sale del API, no del mock del prototipo: hasta ahora
  // pintaba un 3 fijo que venía de `data.ts` y no se movía por mucho que se aprobaran
  // notas. Solo lo pide quien tiene bandeja — a un técnico el endpoint le devolvería
  // sus propias notas (RLS) y el número no significaría lo mismo.
  const esAdmin = state.role === 'A' || state.role === 'S';
  const { data: porAprobar } = useApiData(
    () => (esAdmin ? listNotes('submitted') : Promise.resolve([])),
    [esAdmin, state.dataVersion],
  );
  const count = porAprobar?.length ?? 0;

  // Si la ventana crece con el panel abierto, la barra vuelve a ser fija y el estado
  // «abierto» quedaria sin boton con el que cerrarlo.
  useEffect(() => {
    if (!movil) setMenuAbierto(false);
  }, [movil]);

  // Mientras el panel esta abierto: Escape lo cierra, el cuerpo no hace scroll por
  // detras del fondo oscurecido, y al cerrarse el foco vuelve al boton que lo abrio
  // (la limpieza corre tanto al cerrar como al desmontar; ahi el ref ya es null).
  useEffect(() => {
    if (!menuAbierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAbierto(false);
    };
    document.addEventListener('keydown', alPulsar);
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = scrollPrevio;
      btnMenu.current?.focus();
    };
  }, [menuAbierto]);

  const irA = (r: Route) => {
    go(r);
    setMenuAbierto(false); // navegar cierra el panel: en movil tapa la pantalla entera
  };

  const mk = (key: string, route: Route, icon: string, badge?: number): NavItem => ({
    key, route, icon: svg(ICON[icon], { w: 17 }), label: tr['nav_' + key], badge,
  });
  const groups: { title: string; items: NavItem[] }[] = [];
  if (state.role === 'T') {
    groups.push({ title: t.grp_tecnico, items: [mk('home', 'home', 'home'), mk('week', 'week', 'doc'), mk('notes', 'notes', 'doc')] });
  }
  if (state.role === 'A' || state.role === 'S') {
    groups.push({
      title: t.grp_admin,
      items: [mk('inbox', 'inbox', 'inbox', count), mk('projects', 'projects', 'folder'), mk('techs', 'techs', 'users'), mk('users', 'users', 'users'), mk('kpis', 'kpis', 'chart')],
    });
  }
  if (state.role === 'S') {
    groups.push({ title: t.grp_super, items: [mk('audit', 'audit', 'shield'), mk('config', 'config', 'gear')] });
  }

  const titleMap: Record<string, string> = {
    home: t.t_home, week: t.t_week, notes: t.t_notes, inbox: t.t_inbox, projects: t.t_projects,
    project: t.t_project, techs: t.t_techs, users: t.t_users, kpis: t.t_kpis, audit: t.t_audit, config: t.t_config,
  };

  const themeIcon = state.theme === 'dark' ? svg(ICON.sun, { w: 17 }) : svg(ICON.moon, { w: 17 });
  const roleLabel: Record<Role, string> = { T: t.role_t, A: t.role_a, S: t.role_s };

  // Identidad real de /api/me. `roleList` es informativo: dice qué rol tiene esta
  // cuenta, no ofrece cambiarlo.
  const me = state.me?.status === 'ok' ? state.me.user : null;
  const roleList = state.myRoles.map((r) => roleLabel[r]).join(' · ');

  // Buscador, idioma y tema. En escritorio van en el encabezado; en
  // movil no caben (el buscador solo ya son 220px de los 390 del telefono) y bajan al
  // panel. Declarados una vez para que no haya dos copias que se desincronicen.
  const controles = (
    <>
      <div className="relative flex items-center gap-2 bg-muted border border-border rounded-md px-2.5 h-11 md:h-9 w-full md:w-[220px] text-muted-foreground focus-within:border-primary">
        <Search className="size-4 shrink-0" />
        <input
          placeholder={t.search}
          value={state.search}
          onChange={(e) => patch({ search: e.target.value })}
          className="w-full border-0 bg-transparent outline-none text-foreground text-base md:text-sm font-sans placeholder:text-muted-foreground"
        />
      </div>

      {/* El selector T·A·S se retiró: cada persona entra con SU cuenta y ve SU rol.
          Servía para enseñar la app desde una sola sesión, pero no para probarla — con
          un usuario que tiene los tres roles ningún 403 salta nunca y un endpoint mal
          protegido pasa desapercibido. Si alguien conserva varios roles, manda el más
          alto (ROLE_RANK en state.tsx) y no hay nada que conmutar. */}

      <Button variant="outline" size="sm" onClick={toggleLang} className="min-h-11 md:min-h-9">
        <Globe className="size-4" />
        {state.lang.toUpperCase()}
      </Button>
      <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="theme" className="size-11 md:size-9">
        {themeIcon}
      </Button>
    </>
  );

  return (
    <>
      {/* Fondo oscurecido: cierra al tocar fuera y tapa el contenido de detras. Solo
          existe con el panel abierto, asi que en escritorio no hay nada que pintar. */}
      {menuAbierto ? (
        <div
          onClick={() => setMenuAbierto(false)}
          className="fixed inset-0 z-40 bg-black/50 fava-anim"
        />
      ) : null}

      <div className="flex min-h-screen">
        {/* SIDEBAR — en movil es un panel deslizante; ver `.fava-aside` en index.css */}
        <aside
          id="fava-nav"
          className="fava-aside bg-card border-r border-border"
          data-open={menuAbierto ? 'true' : 'false'}
        >
          <div className="px-[18px] pt-[18px] pb-3.5 border-b border-border">
            <FavaLogo height={44} onDark={state.theme === 'dark'} />
            <div className="text-[10px] tracking-[1.5px] text-muted-foreground uppercase mt-2">
              {t.brand_sub}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2.5 py-3">
            {groups.map((g) => (
              <div key={g.title} className="mb-3.5">
                <div className="text-[10px] font-bold tracking-[1.4px] uppercase text-muted-foreground px-2.5 py-1.5">
                  {g.title}
                </div>
                {g.items.map((it) => {
                  const active = state.route === it.route;
                  return (
                    <button
                      key={it.key}
                      onClick={() => irA(it.route)}
                      className={`w-full flex items-center gap-3 px-3 py-2 mb-0.5 min-h-11 md:min-h-0 rounded-md text-[13.5px] text-left cursor-pointer transition-colors ${
                        active
                          ? 'font-semibold text-primary bg-primary-tint'
                          : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <span className="flex size-[18px] shrink-0">{it.icon}</span>
                      <span className="flex-1 text-left">{it.label}</span>
                      {it.badge ? (
                        <span className="bg-accent-brand text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full grid place-items-center">
                          {it.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {movil ? (
            <div className="p-3 border-t border-border flex flex-wrap gap-2">{controles}</div>
          ) : null}

          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-muted">
              <div className="size-8 rounded-full bg-primary-700 text-white grid place-items-center text-xs font-bold shrink-0">
                {initials(me?.displayName || '?')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{me?.displayName}</div>
                <div className="text-[11px] text-muted-foreground truncate">{me?.email}</div>
                <div className="text-[11px] text-muted-foreground">{roleList}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={logout} aria-label="logout" className="shrink-0">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-15 flex-none flex items-center gap-3.5 px-3.5 md:px-6 bg-card border-b border-border sticky top-0 z-20">
            {movil ? (
              <Button
                ref={btnMenu}
                variant="outline"
                size="icon"
                onClick={() => setMenuAbierto((v) => !v)}
                aria-label={menuAbierto ? t.menu_close : t.menu_open}
                aria-expanded={menuAbierto}
                aria-controls="fava-nav"
                className="size-11 shrink-0"
              >
                {menuAbierto ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            ) : null}

            <div className="flex-1 min-w-0">
              <div className="text-base font-bold truncate">{titleMap[state.route] || ''}</div>
            </div>

            {/* En movil estos cuatro no caben en 390px: viven dentro del panel. Se
                renderizan en un sitio o en el otro, nunca en los dos. */}
            {movil ? null : controles}

            {state.myRoles.some((r) => r !== 'T') ? (
              <Button
                variant="outline"
                size="icon"
                onClick={goInbox}
                aria-label="inbox"
                className="relative shrink-0 size-11 md:size-9"
              >
                {svg(ICON.bell, { w: 17 })}
                {count ? (
                  <span className="absolute top-0.5 right-0.5 bg-accent-brand text-white text-[9px] font-bold min-w-[15px] h-[15px] px-1 rounded-full grid place-items-center">
                    {count}
                  </span>
                ) : null}
              </Button>
            ) : null}
          </header>

          <main className="flex-1 overflow-y-auto p-3.5 md:p-6">
            {state.loading ? (
              <div className="grid place-items-center min-h-[50vh] text-muted-foreground">
                <div className="text-center">
                  <div
                    className="size-9 border-[3px] border-border rounded-full mx-auto mb-3.5"
                    style={{ borderTopColor: 'var(--primary)', animation: 'favaSpin .8s linear infinite' }}
                  />
                  <div className="text-[13px]">{t.loading}</div>
                </div>
              </div>
            ) : (
              <div key={state.route} className="fava-anim">
                <Screen />
              </div>
            )}
          </main>
        </div>
      </div>

      {state.logOpen ? <LogDayDrawer /> : null}
      {state.returnOpen ? <ReturnModal /> : null}
      {state.projOpen ? <NewProjectModal /> : null}
      {state.inviteOpen ? <InviteUserModal /> : null}
      {state.pdfOpen && state.pdfNoteId ? <PdfPreview noteId={state.pdfNoteId} firmado={state.pdfSigned} /> : null}
      {state.onboard ? <Onboarding /> : null}
      {state.toast ? <Toast /> : null}
    </>
  );
}
