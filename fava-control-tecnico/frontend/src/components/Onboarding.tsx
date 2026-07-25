import { pbtn } from '../ui';
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.6)', zIndex: 70, display: 'grid', placeItems: 'center', padding: 20, animation: 'favaIn .25s ease' }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: 18, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'favaIn .3s ease both' }}>
        <div style={{ height: 150, background: 'linear-gradient(140deg,var(--primary-700),var(--primary))', display: 'grid', placeItems: 'center' }}>
          <FavaLogo height={76} onDark />
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{title}</div>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 20px' }}>{body}</p>
          <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .3s', width: pct }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={closeOnboard} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t.ob_skip}</button>
            <button onClick={next} style={pbtn}>{isLast ? t.ob_done : t.ob_next}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
