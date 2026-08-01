import { useState } from 'react';
import type { FormEvent } from 'react';
import { svg, ICON, FavaLogo } from './icons';
import { ghostBtn, ghostIconBtn, inputStyle, pbtn } from './ui';
import { useApp } from './state';
import { devAuthEnabled } from './lib/auth/dev';
import { useIsMobile } from './lib/useIsMobile';

export default function Login() {
  const { state, t, login, devLogin, toggleLang, toggleTheme } = useApp();
  const movil = useIsMobile();
  const themeIcon = state.theme === 'dark' ? svg(ICON.sun, { w: 17 }) : svg(ICON.moon, { w: 17 });
  // Estado del acceso temporal de desarrollo. Sin la variable, nada de esto se pinta.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const onDevSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(false);
    // El error es siempre el mismo: el servidor no dice qué falló y el cliente tampoco.
    devLogin(email.trim(), password).catch(() => setError(true));
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: movil ? '1fr' : '1.05fr .95fr', background: 'var(--bg)' }}>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20, padding: 'var(--pad-brand)', background: 'linear-gradient(150deg,var(--primary-700),var(--primary) 60%,var(--primary-600))', color: '#fff', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.09, backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 64px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 64px)' }} />
        <div style={{ position: 'relative' }}>
          <FavaLogo height={64} onDark />
        </div>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <div style={{ fontSize: 12, letterSpacing: '3px', textTransform: 'uppercase', opacity: 0.7, marginBottom: 14 }}>Control Técnico</div>
          <h1 className="serif" style={{ fontSize: 'var(--fs-hero)', lineHeight: 1.15, fontWeight: 700, margin: '0 0 16px' }}>{t.login_head}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.82, margin: 0 }}>{t.login_body}</p>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 26, fontSize: 12, opacity: 0.72 }}>
          <span>Montaggio</span><span>Collaudo</span><span>Cantiere</span><span>Venduto / Eseguito</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 'var(--pad-login)', position: 'relative',
        // En móvil el panel se ajusta a su contenido: sin este hueco, los botones de
        // idioma y tema (posicionados en absoluto) caerían encima del título.
        paddingTop: movil ? 'calc(var(--pad-login) + 44px)' : undefined }}>
        <div style={{ position: 'absolute', top: 'var(--pad-login)', right: 'var(--pad-login)', display: 'flex', gap: 8 }}>
          <button onClick={toggleLang} className={ghostBtn}>{state.lang.toUpperCase()}</button>
          <button onClick={toggleTheme} aria-label="theme" className={ghostIconBtn}>{themeIcon}</button>
        </div>
        <div style={{ width: '100%', maxWidth: 360, animation: 'favaIn .4s ease both' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: 'var(--text)' }}>{t.login_signin}</h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 30px' }}>{t.login_sub}</p>
          <button
            onClick={login}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius)', fontSize: 15, fontWeight: 500, cursor: 'pointer', boxShadow: 'var(--shadow)' }}
          >
            <svg width="20" height="20" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {t.login_ms}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0', color: 'var(--text-3)', fontSize: 11.5 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            {t.login_or}
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          {devAuthEnabled && (
            <form onSubmit={onDevSubmit} style={{ display: 'grid', gap: 10, marginBottom: 26 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)' }}>{t.dev_login_title}</div>
              <input
                type="email" required autoComplete="username" value={email} placeholder={t.dev_login_email}
                onChange={(e) => setEmail(e.target.value)} className={inputStyle}
              />
              <input
                type="password" required autoComplete="current-password" value={password} placeholder={t.dev_login_password}
                onChange={(e) => setPassword(e.target.value)} className={inputStyle}
              />
              {error && <div style={{ fontSize: 12.5, color: 'var(--warn)' }}>{t.dev_login_error}</div>}
              <button type="submit" className={`${pbtn} justify-center px-4 py-2.5 min-h-11`}>
                {t.dev_login_submit}
              </button>
            </form>
          )}
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t.login_note}</div>
            {t.login_note_body}
          </div>
          <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', margin: '30px 0 0' }}>{t.login_foot}</p>
        </div>
      </div>
    </div>
  );
}
