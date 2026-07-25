import { useState } from 'react';
import { useApp } from '../state';
import { requestAccess } from '../lib/api/client';
import { initials } from '../data';
import { FavaLogo, svg, ICON } from '../icons';
import { gbtn, pbtn, ghostBtn, ghostIconBtn } from '../ui';

/**
 * Dos pantallas de una: cuenta MS válida sin invitación (con «solicitar acceso»)
 * y cuenta desactivada (mensaje propio, sin acción). Decisiones locked del CONTEXT:
 * NO hay auto-registro y el desactivado ve un mensaje distinto al del no invitado.
 */
export default function NoAccess() {
  const { state, t, logout, toggleLang, toggleTheme } = useApp();
  const me = state.me;
  const entra = me && me.status !== 'ok' ? me.entra : null;
  const deactivated = me?.status === 'deactivated';

  const [sent, setSent] = useState(me?.status === 'not_invited' && me.requestPending);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await requestAccess();
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const themeIcon = state.theme === 'dark' ? svg(ICON.sun, { w: 17 }) : svg(ICON.moon, { w: 17 });

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, right: 24, display: 'flex', gap: 8 }}>
        <button onClick={toggleLang} style={ghostBtn}>{state.lang.toUpperCase()}</button>
        <button onClick={toggleTheme} aria-label="theme" style={ghostIconBtn}>{themeIcon}</button>
      </div>

      <div style={{ width: '100%', maxWidth: 430, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'favaIn .35s ease both' }}>
        <div style={{ height: 108, background: 'linear-gradient(140deg,var(--primary-700),var(--primary))', display: 'grid', placeItems: 'center' }}>
          <FavaLogo height={56} onDark />
        </div>

        <div style={{ padding: 24 }}>
          {/* Identidad de la cuenta Microsoft con la que entró */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 18 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--primary-700)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>
              {initials(entra?.displayName || '?')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entra?.displayName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entra?.email}</div>
            </div>
          </div>

          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
            {deactivated ? t.deactivated_title : t.no_access_title}
          </h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)', margin: '0 0 20px' }}>
            {deactivated ? t.deactivated_body : t.no_access_body}
          </p>

          {!deactivated && sent ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', background: 'var(--ok-tint)', border: '1px solid var(--ok)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontWeight: 700, color: 'var(--ok)', marginBottom: 3 }}>{t.no_access_sent}</div>
              {t.no_access_sent_body}
            </div>
          ) : null}

          {failed ? (
            <div style={{ fontSize: 12.5, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 10, padding: '10px 14px', marginBottom: 18 }}>
              {t.no_access_error}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10 }}>
            {!deactivated ? (
              <button onClick={send} disabled={sent || busy} style={{ ...pbtn, flex: 1, justifyContent: 'center', opacity: sent || busy ? 0.55 : 1, cursor: sent || busy ? 'not-allowed' : 'pointer' }}>
                {sent ? t.no_access_sent : t.no_access_request}
              </button>
            ) : null}
            <button onClick={logout} style={{ ...gbtn, flex: deactivated ? 1 : 'none', justifyContent: 'center' }}>
              {t.btn_signout}
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', margin: '22px 0 0' }}>{t.login_foot}</p>
        </div>
      </div>
    </div>
  );
}
