import { useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent } from 'react';
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

  /**
   * Parallax del panel de marca: −1..1 en cada eje según dónde esté el ratón.
   *
   * Se guarda el valor NORMALIZADO y no los píxeles: cada capa decide cuánto se mueve
   * multiplicándolo, y así la profundidad se ajusta cambiando un número en el JSX.
   *
   * Sin efecto en táctil, que es donde entra el técnico: no hay `mousemove` en un
   * teléfono, el estado se queda en 0 y no se anima nada. Es un detalle para quien
   * abre esto en un escritorio.
   */
  const [par, setPar] = useState({ x: 0, y: 0 });
  const mover = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPar({
      x: (e.clientX - r.left) / r.width - 0.5,
      y: (e.clientY - r.top) / r.height - 0.5,
    });
  };

  const onDevSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(false);
    // El error es siempre el mismo: el servidor no dice qué falló y el cliente tampoco.
    devLogin(email.trim(), password).catch(() => setError(true));
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.05fr_.95fr] bg-background">
      {/* Panel de marca */}
      <div
        onMouseMove={mover}
        onMouseLeave={() => setPar({ x: 0, y: 0 })}
        className="relative flex flex-col justify-between gap-5 p-5 md:p-12 bg-gradient-to-br from-primary-700 via-primary to-primary-600 text-white overflow-hidden"
      >
        {/* La retícula de fondo: un patrón repetido, no un valor de diseño que quepa
            en una clase de utilidad.

            Se desplaza MENOS que el contenido (la mitad) al mover el ratón: es lo que
            crea la sensación de profundidad, un fondo que va por detrás. Solo
            `translate3d`, que la GPU resuelve sin recalcular nada. */}
        <div
          className="absolute -inset-8 opacity-[0.09] fava-parallax"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 64px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 64px)',
            transform: `translate3d(${par.x * 12}px, ${par.y * 12}px, 0)`,
          }}
        />
        {/* Halo: da volumen al degradado plano y se mueve al contrario que la retícula,
            que es lo que separa los dos planos. */}
        <div
          className="absolute -inset-8 pointer-events-none fava-parallax"
          style={{
            background:
              'radial-gradient(40% 40% at 30% 25%, rgba(255,255,255,.16), transparent 70%)',
            transform: `translate3d(${par.x * -26}px, ${par.y * -26}px, 0)`,
          }}
        />

        <div className="relative fava-cascade contents">
          <div className="relative" style={{ '--i': 0 } as CSSProperties}>
            <FavaLogo height={64} onDark />
          </div>
          <div className="relative max-w-[400px]" style={{ '--i': 1 } as CSSProperties}>
            <div className="text-xs tracking-[3px] uppercase opacity-70 mb-3.5">Control Técnico</div>
            <h1 className="serif text-[26px] md:text-[38px] leading-tight font-bold mb-4">{t.login_head}</h1>
            <p className="text-[15px] leading-relaxed opacity-80">{t.login_body}</p>
          </div>
          <div
            className="relative flex flex-wrap gap-x-6 gap-y-1 text-xs opacity-70"
            style={{ '--i': 2 } as CSSProperties}
          >
            <span>Montaggio</span>
            <span>Collaudo</span>
            <span>Cantiere</span>
            <span>Venduto / Eseguito</span>
          </div>
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

        {/* Dos divs y no uno, a propósito: `fava-anim` usa `animation-fill-mode: both`,
            y en la cascada de CSS una animación con relleno GANA a las declaraciones
            normales — el `transform` del `:hover` de `fava-lift` no llegaría a aplicarse
            nunca si compartieran elemento. La entrada va fuera, la levitación dentro.

            La tarjeta lleva fondo OPACO (`bg-card`), no traslúcido: aquí van los campos
            del acceso y el contraste manda sobre el efecto. Lo que la hace flotar es la
            sombra en capas, no la transparencia. */}
        <div className="w-full max-w-[400px] fava-anim">
          <div className="bg-card rounded-2xl p-6 md:p-8 fava-lift">
          <h2 className="text-[22px] font-bold mb-1.5">{t.login_signin}</h2>
          <p className="text-[13.5px] text-muted-foreground mb-7">{t.login_sub}</p>

          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 min-h-11 bg-card text-foreground border border-input rounded-card text-[15px] font-medium cursor-pointer shadow-card hover:bg-muted hover:-translate-y-px transition-all duration-300"
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

          </div>
          <p className="text-center text-[11.5px] text-muted-foreground mt-7">{t.login_foot}</p>
        </div>
      </div>
    </div>
  );
}
