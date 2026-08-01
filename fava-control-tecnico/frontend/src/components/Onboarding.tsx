import { Button } from '@/components/ui/button';
import { useApp } from '../state';
import { FavaLogo } from '../icons';

export default function Onboarding() {
  const { state, t, patch, closeOnboard } = useApp();
  const steps: [string, string][] = [
    [t.ob1_t, t.ob1_b],
    [t.ob2_t, t.ob2_b],
    [t.ob3_t, t.ob3_b],
  ];
  const st = state.onboardStep;
  const [title, body] = steps[st];
  const isLast = st >= steps.length - 1;
  const pct = ((st + 1) / steps.length) * 100 + '%';

  const next = () => {
    if (isLast) closeOnboard();
    else patch({ onboardStep: st + 1 });
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/60 grid place-items-center p-5 fava-anim">
      <div className="w-full max-w-[440px] bg-card rounded-2xl shadow-pop overflow-hidden fava-anim">
        <div className="h-[150px] bg-gradient-to-br from-primary-700 to-primary grid place-items-center">
          <FavaLogo height={76} onDark />
        </div>
        <div className="p-6">
          <div className="text-lg font-bold mb-2">{title}</div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">{body}</p>
          {/* La barra de progreso: el ancho es un dato calculado, no un valor de diseño,
              así que va en `style` — Tailwind no genera una clase por cada porcentaje. */}
          <div className="h-1 bg-muted rounded-sm overflow-hidden mb-4.5">
            <div className="h-full bg-accent-brand rounded-sm transition-[width] duration-300" style={{ width: pct }} />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={closeOnboard} className="text-muted-foreground min-h-11 md:min-h-9">
              {t.ob_skip}
            </Button>
            <Button onClick={next} className="min-h-11 md:min-h-9">
              {isLast ? t.ob_done : t.ob_next}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
