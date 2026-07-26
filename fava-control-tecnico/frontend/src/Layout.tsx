import type { ReactNode } from 'react';
import { svg, ICON, FavaLogo } from './icons';
import { ghostBtn, ghostIconBtn, initials } from './ui';
import { useApp } from './state';
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

export default function Layout() {
  const { state, t, go, logout, switchRole, goInbox, toggleTheme, toggleLang, patch, inboxCount } = useApp();
  const tr = t as unknown as Record<string, string>;

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
      items: [mk('inbox', 'inbox', 'inbox', inboxCount()), mk('projects', 'projects', 'folder'), mk('techs', 'techs', 'users'), mk('users', 'users', 'users'), mk('kpis', 'kpis', 'chart')],
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
  const count = inboxCount();

  // Identidad real de /api/me. El switcher T·A·S solo existe para multi-rol y
  // solo con los roles del propio usuario (cambia navegación, nunca permisos).
  const me = state.me?.status === 'ok' ? state.me.user : null;
  const roleList = state.myRoles.map((r) => roleLabel[r]).join(' · ');

  return (
    <>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* SIDEBAR */}
        <aside style={{ width: 246, flex: 'none', background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
          <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid var(--border)' }}>
            <FavaLogo height={44} onDark={state.theme === 'dark'} />
            <div style={{ fontSize: 10, letterSpacing: '1.5px', color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 8 }}>{t.brand_sub}</div>
          </div>
          <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
            {groups.map((g) => (
              <div key={g.title} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'var(--text-3)', padding: '6px 10px' }}>{g.title}</div>
                {g.items.map((it) => {
                  const active = state.route === it.route;
                  return (
                    <button
                      key={it.key}
                      onClick={() => go(it.route)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', marginBottom: 2,
                        border: 0, borderRadius: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: active ? 600 : 500,
                        fontFamily: 'inherit', textAlign: 'left',
                        color: active ? 'var(--primary)' : 'var(--text-2)',
                        background: active ? 'var(--primary-tint)' : 'transparent',
                      }}
                    >
                      <span style={{ display: 'flex', width: 18, height: 18, flex: 'none' }}>{it.icon}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
                      {it.badge ? (
                        <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, display: 'grid', placeItems: 'center' }}>
                          {it.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-700)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>
                {initials(me?.displayName || '?')}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{roleList}</div>
              </div>
              <button onClick={logout} aria-label="logout" style={ghostIconBtn}>
                {svg(ICON.logout, { w: 16 })}
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <header style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleMap[state.route] || ''}</div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', height: 34, width: 220, color: 'var(--text-3)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              <input
                placeholder={t.search}
                value={state.search}
                onChange={(e) => patch({ search: e.target.value })}
                style={{ border: 0, background: 'transparent', outline: 'none', color: 'var(--text)', fontSize: 13, marginLeft: 8, width: '100%', fontFamily: 'inherit' }}
              />
            </div>
            {/* selector de rol — solo si el usuario tiene más de uno */}
            {state.myRoles.length > 1 ? (
              <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
                {state.myRoles.map((code) => (
                  <button
                    key={code}
                    onClick={() => switchRole(code)}
                    title={roleLabel[code]}
                    style={{
                      padding: '5px 11px', border: 0, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Roboto Mono',
                      background: state.role === code ? 'var(--primary)' : 'transparent',
                      color: state.role === code ? '#fff' : 'var(--text-3)',
                    }}
                  >
                    {code}
                  </button>
                ))}
              </div>
            ) : null}
            <button onClick={toggleLang} style={ghostBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
              {state.lang.toUpperCase()}
            </button>
            <button onClick={toggleTheme} aria-label="theme" style={ghostIconBtn}>{themeIcon}</button>
            {state.myRoles.some((r) => r !== 'T') ? (
              <button onClick={goInbox} aria-label="inbox" style={{ ...ghostIconBtn, position: 'relative' }}>
                {svg(ICON.bell, { w: 17 })}
                {count ? (
                  <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
                    {count}
                  </span>
                ) : null}
              </button>
            ) : null}
          </header>

          <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {state.loading ? (
              <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh', color: 'var(--text-3)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 34, height: 34, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'favaSpin .8s linear infinite', margin: '0 auto 14px' }} />
                  <div style={{ fontSize: 13 }}>{t.loading}</div>
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
      {state.pdfOpen ? <PdfPreview /> : null}
      {state.onboard ? <Onboarding /> : null}
      {state.toast ? <Toast /> : null}
    </>
  );
}
