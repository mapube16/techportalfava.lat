import { AppProvider, useApp } from './state';
import Login from './Login';
import Layout from './Layout';
import NoAccess from './screens/NoAccess';
import { devAuthEnabled } from './lib/auth/dev';

function Root() {
  const { state, t } = useApp();
  // El árbol lo gobierna sessionStatus, que viene del servidor (GET /api/me).
  return (
    <div className="fava min-h-screen" data-theme={state.theme} data-density={state.density}>
      {/* Aviso permanente mientras el login de desarrollo esté activo: nadie debe
          confundir esta instancia con una asegurada por Microsoft Entra. */}
      {devAuthEnabled && (
        <div className="sticky top-0 z-[200] bg-warn text-white px-3.5 py-1.5 text-xs font-bold tracking-wide text-center">
          {t.dev_auth_banner}
        </div>
      )}
      {state.sessionStatus === 'ok' ? (
        <Layout />
      ) : state.sessionStatus === 'boot' || state.loading ? (
        <div className="grid place-items-center min-h-screen text-muted-foreground">
          <div className="text-center">
            <div
              className="size-8.5 border-[3px] border-border rounded-full mx-auto mb-3.5"
              style={{ borderTopColor: 'var(--primary)', animation: 'favaSpin .8s linear infinite' }}
            />
            <div className="text-[13px]">{t.loading}</div>
          </div>
        </div>
      ) : state.sessionStatus === 'anon' ? (
        <Login />
      ) : (
        <NoAccess />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
