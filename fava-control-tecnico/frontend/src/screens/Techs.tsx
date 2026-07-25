import { hi, Dots } from '../icons';
import { Card, CardHead, chip, filterBy, gbtn, pbtn, td, th } from '../ui';
import { useApp } from '../state';
import { TECHS, initials } from '../data';
import type { Tech } from '../types';

export default function Techs() {
  const { state, t, showToast } = useApp();
  const tl: Record<Tech['type'], string> = { mechanic: t.mechanic, mecatronic: t.mecatronic, electric: t.electric };
  const rows = filterBy(TECHS, state.search, (tc) => tc.n);
  const addBtn = (
    <button onClick={() => showToast('saved')} style={pbtn}>
      {hi('plus', { w: 15 })}
      {t.btn_newtech}
    </button>
  );
  const utilBar = (w: number, width?: number) => (
    <div style={{ width, height: 6, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden', flex: width ? 'none' : 1 }}>
      <div style={{ width: w + '%', height: '100%', background: w > 85 ? 'var(--warn)' : 'var(--primary)' }} />
    </div>
  );
  const activePill = (active: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: active ? 'var(--ok)' : 'var(--text-3)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--ok)' : 'var(--text-3)' }} />
      {active ? t.active : t.inactive}
    </span>
  );

  if (state.mobile) {
    return (
      <Card>
        <CardHead title={t.t_techs} right={addBtn} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((tc) => (
            <div key={tc.n} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13, opacity: tc.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initials(tc.n)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{tc.n}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{tl[tc.type]}</div>
                </div>
                <span style={chip(tc.ext ? 'var(--accent-tint)' : 'var(--surface-3)', tc.ext ? 'var(--accent)' : 'var(--text-2)')}>
                  {tc.ext ? t.external : t.internal}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
                {utilBar(tc.util)}
                <span style={{ fontFamily: 'Roboto Mono', fontSize: 12, fontWeight: 600 }}>{tc.util}%</span>
                {activePill(tc.active)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title={t.t_techs} right={addBtn} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t.col_tech, t.role_type, '', t.util, t.col_status, ''].map((c, i) => (
                <th key={i} style={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((tc) => (
              <tr key={tc.n} style={{ borderTop: '1px solid var(--border)', opacity: tc.active ? 1 : 0.55 }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{initials(tc.n)}</div>
                    <span style={{ fontWeight: 600 }}>{tc.n}</span>
                  </div>
                </td>
                <td style={td}>{tl[tc.type]}</td>
                <td style={td}>
                  <span style={chip(tc.ext ? 'var(--accent-tint)' : 'var(--surface-3)', tc.ext ? 'var(--accent)' : 'var(--text-2)')}>
                    {tc.ext ? t.external : t.internal}
                  </span>
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {utilBar(tc.util, 80)}
                    <span style={{ fontFamily: 'Roboto Mono', fontSize: 12, fontWeight: 600 }}>{tc.util}%</span>
                  </div>
                </td>
                <td style={td}>{activePill(tc.active)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button style={gbtn}><Dots w={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
