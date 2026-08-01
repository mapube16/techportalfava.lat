import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useApp } from '../state';
import { requestAccess } from '../lib/api/client';
import { FavaLogo, svg, ICON } from '../icons';
import { initials } from '../ui';

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
    <div className="min-h-screen grid place-items-center p-6 bg-background relative">
      <div className="absolute top-5.5 right-6 flex gap-2">
        <Button variant="outline" size="sm" onClick={toggleLang} className="min-h-11 md:min-h-9">
          {state.lang.toUpperCase()}
        </Button>
        <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="theme" className="size-11 md:size-9">
          {themeIcon}
        </Button>
      </div>

      <div className="w-full max-w-[430px] bg-card border border-border rounded-card shadow-pop overflow-hidden fava-anim">
        <div className="h-[108px] bg-gradient-to-br from-primary-700 to-primary grid place-items-center">
          <FavaLogo height={56} onDark />
        </div>

        <div className="p-6">
          {/* Identidad de la cuenta Microsoft con la que entró. */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted border border-border rounded-lg mb-4.5">
            <div className="size-9.5 rounded-full bg-primary-700 text-white grid place-items-center text-[13px] font-bold shrink-0">
              {initials(entra?.displayName || '?')}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{entra?.displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{entra?.email}</div>
            </div>
          </div>

          <h1 className="text-lg font-bold mb-2">{deactivated ? t.deactivated_title : t.no_access_title}</h1>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground mb-5">
            {deactivated ? t.deactivated_body : t.no_access_body}
          </p>

          {!deactivated && sent ? (
            <div className="text-[12.5px] leading-relaxed text-muted-foreground bg-ok-tint border border-ok rounded-lg px-3.5 py-3 mb-4.5">
              <div className="font-bold text-ok mb-0.5">{t.no_access_sent}</div>
              {t.no_access_sent_body}
            </div>
          ) : null}

          {failed ? (
            <div className="text-[12.5px] text-warn bg-warn-tint border border-warn rounded-lg px-3.5 py-2.5 mb-4.5">
              {t.no_access_error}
            </div>
          ) : null}

          <div className="flex gap-2.5">
            {!deactivated ? (
              <Button
                onClick={send}
                disabled={sent || busy}
                className="flex-1 justify-center min-h-11 md:min-h-9"
              >
                {sent ? t.no_access_sent : t.no_access_request}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={logout}
              className={`justify-center min-h-11 md:min-h-9 ${deactivated ? 'flex-1' : 'flex-none'}`}
            >
              {t.btn_signout}
            </Button>
          </div>

          <p className="text-center text-[11.5px] text-muted-foreground mt-5.5">{t.login_foot}</p>
        </div>
      </div>
    </div>
  );
}
