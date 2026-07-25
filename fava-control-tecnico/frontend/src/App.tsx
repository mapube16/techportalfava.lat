import { AppProvider, useApp } from './state';
import Login from './Login';
import Layout from './Layout';

function Root() {
  const { state, t } = useApp();
  return (
    <div className="fava" data-theme={state.theme} data-density={state.density} style={{ minHeight: '100vh' }}>
      {state.loggedIn ? (
        <Layout />
      ) : state.loading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--text-3)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 34, height: 34, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'favaSpin .8s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 13 }}>{t.loading}</div>
          </div>
        </div>
      ) : (
        <Login />
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
