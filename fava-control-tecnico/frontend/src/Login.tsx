import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { svg, ICON, FavaLogo } from './icons';
import { inputStyle } from './ui';
import { useApp } from './state';
import { devAuthEnabled } from './lib/auth/dev';

/**
 * La pantalla de acceso. Dos paneles en escritorio y uno solo apilado en móvil.
 *
 * Las tres medidas que antes eran variables cambiadas por media query
 * (`--pad-brand`, `--pad-login`, `--fs-hero`) ahora son variantes de Tailwind dichas
 * donde se usan: `p-5 md:p-12`, `p-4.5 md:p-10` y `text-[26px] md:text-[38px]`.
 */
export default function Login() {
  const { state, t, login, devLogin, toggleLang, toggleTheme } = useApp();
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
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.05fr_.95fr] bg-background">
      {/* Panel de marca */}
      <div className="relative flex flex-col justify-between gap-5 p-5 md:p-12 bg-gradient-to-br from-primary-700 via-primary to-primary-600 text-white overflow-hidden">
        {/* La retícula de fondo: un patrón repetido, no un valor de diseño que quepa
            en una clase de utilidad. */}
        <div
          className="absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 64px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 64px)',
          }}
        />
        <div className="relative">
          <FavaLogo height={64} onDark />
        </div>
        <div className="relative max-w-[400px]">
          <div className="text-xs tracking-[3px] uppercase opacity-70 mb-3.5">Control Técnico</div>
          <h1 className="serif text-[26px] md:text-[38px] leading-tight font-bold mb-4">{t.login_head}</h1>
          <p className="text-[15px] leading-relaxed opacity-80">{t.login_body}</p>
        </div>
        <div className="relative flex flex-wrap gap-x-6 gap-y-1 text-xs opacity-70">
          <span>Montaggio</span>
          <span>Collaudo</span>
          <span>Cantiere</span>
          <span>Venduto / Eseguito</span>
        </div>
      </div>

      {/* Panel de acceso. El `pt` extra en móvil deja hueco a los botones de idioma y
          tema, que van posicionados en absoluto y si no caerían sobre el título. */}
      <div className="relative flex flex-col justify-center items-center p-4.5 md:p-10 pt-16 md:pt-10">
        <div className="absolute top-4.5 md:top-10 right-4.5 md:right-10 flex gap-2">
          <Button variant="outline" size="sm" onClick={toggleLang} className="min-h-11 md:min-h-9">
            {state.lang.toUpperCase()}
          </Button>
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="theme" className="size-11 md:size-9">
            {themeIcon}
          </Button>
        </div>

        <div className="w-full max-w-[360px] fava-anim">
          <h2 className="text-[22px] font-bold mb-1.5">{t.login_signin}</h2>
          <p className="text-[13.5px] text-muted-foreground mb-7">{t.login_sub}</p>

          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 min-h-11 bg-card text-foreground border border-input rounded-card text-[15px] font-medium cursor-pointer shadow-card hover:bg-muted transition-colors"
          >
            {/* Los colores del logotipo de Microsoft son de su marca, no del tema. */}
            <svg width="20" height="20" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {t.login_ms}
          </button>

          <div className="flex items-center gap-3 my-6 text-muted-foreground text-[11.5px]">
            <div className="flex-1 h-px bg-border" />
            {t.login_or}
            <div className="flex-1 h-px bg-border" />
          </div>

          {devAuthEnabled && (
            <form onSubmit={onDevSubmit} className="grid gap-2.5 mb-6">
              <div className="text-[12.5px] font-bold text-warn">{t.dev_login_title}</div>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                placeholder={t.dev_login_email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputStyle}
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                placeholder={t.dev_login_password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyle}
              />
              {error && <div className="text-[12.5px] text-warn">{t.dev_login_error}</div>}
              <Button type="submit" className="min-h-11 md:min-h-10">
                {t.dev_login_submit}
              </Button>
            </form>
          )}

          <div className="text-[12.5px] text-muted-foreground leading-relaxed bg-muted border border-border rounded-card px-4 py-3.5">
            <div className="font-semibold text-foreground mb-1">{t.login_note}</div>
            {t.login_note_body}
          </div>

          <p className="text-center text-[11.5px] text-muted-foreground mt-7">{t.login_foot}</p>
        </div>
      </div>
    </div>
  );
}
