import { hi } from '../icons';
import { useApp } from '../state';

/**
 * El aviso flotante. El color depende del tipo de accion, y por eso el mapa lleva las
 * clases ENTERAS: Tailwind no puede componer `text-${x}` en tiempo de compilacion —no
 * veria la clase al escanear y la purgaria—.
 */
const ESTILO: Record<string, { barra: string; icono: string; nombre: string }> = {
  approved: { barra: 'border-l-ok', icono: 'bg-ok-tint text-ok', nombre: 'check' },
  returned: { barra: 'border-l-warn', icono: 'bg-warn-tint text-warn', nombre: 'ureturn' },
  saved: { barra: 'border-l-accent-brand', icono: 'bg-accent-tint text-accent-brand', nombre: 'check' },
  submitted: { barra: 'border-l-sent', icono: 'bg-sent-tint text-sent', nombre: 'up' },
  invite: { barra: 'border-l-sent', icono: 'bg-sent-tint text-sent', nombre: 'up' },
  proj: { barra: 'border-l-primary', icono: 'bg-primary-tint text-primary', nombre: 'plus' },
};

const POR_DEFECTO = { barra: 'border-l-primary', icono: 'bg-primary-tint text-primary', nombre: 'check' };

export default function Toast() {
  const { state } = useApp();
  const toast = state.toast;
  if (!toast) return null;
  const e = ESTILO[toast.kind] ?? POR_DEFECTO;

  return (
    <div
      className={`fixed bottom-5 right-5 z-80 flex items-center gap-3 bg-card border border-border border-l-4 ${e.barra} rounded-xl shadow-pop px-4 py-3 min-w-[280px] max-w-[380px]`}
      style={{ animation: 'favaToast .3s ease both' }}
      role="status"
    >
      <div className={`size-[26px] rounded-md grid place-items-center shrink-0 ${e.icono}`}>
        {hi(e.nombre, { w: 15 })}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold">{toast.title}</div>
        <div className="text-xs text-muted-foreground">{toast.body}</div>
      </div>
    </div>
  );
}
