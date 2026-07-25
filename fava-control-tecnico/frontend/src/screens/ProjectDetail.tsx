import { Card, CardHead, gbtn, pbtn, td, th } from '../ui';
import { useApp } from '../state';
import { money, nf } from '../data';
import type { Phase, RoleType } from '../types';

const ROLES: RoleType[] = ['Mecánico', 'Meccatronico', 'Eléctrico'];

export default function ProjectDetail() {
  const { state, t, go, showToast } = useApp();
  const p = state.projects.find((x) => x.id === state.selProject) || state.projects[0];
  const rl: Record<RoleType, string> = { Mecánico: t.mechanic, Meccatronico: t.mecatronic, Eléctrico: t.electric };

  const matrix = (phase: Phase) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
      <thead>
        <tr>
          {[t.role_type, t.kpi_sold, t.kpi_done, t.kpi_delta].map((c, i) => (
            <th key={i} style={{ ...th, textAlign: i ? 'center' : 'left' }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROLES.map((rr) => {
          const s = p.sold[phase][rr];
          const dn = p.done[phase][rr];
          const dl = dn - s;
          return (
            <tr key={rr} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...td, fontWeight: 600 }}>{rl[rr]}</td>
              <td style={{ ...td, textAlign: 'center' }}>
                <input
                  defaultValue={s}
                  style={{ width: 44, textAlign: 'center', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 4px', background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'Roboto Mono', fontSize: 13, fontWeight: 600 }}
                />
              </td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 600 }}>{dn}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 700, color: dl < 0 ? 'var(--warn)' : 'var(--ok)' }}>{(dl > 0 ? '+' : '') + dl}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const metas: [string, string][] = [
    ['OA / Commessa', p.oa],
    [t.contract, money(p.value, p.cur)],
    [t.proj_hours, nf(p.nh || 0) + ' h'],
    [t.machines, p.machines.join(' · ')],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000 }}>
      <button onClick={() => go('projects')} style={{ ...gbtn, alignSelf: 'flex-start' }}>← {t.t_projects}</button>
      <Card>
        <div style={{ padding: '18px 20px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{p.client} · {p.country}</div>
          </div>
          {metas.map(([a, b], i) => (
            <div key={a}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{a}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, fontFamily: i ? 'Roboto Mono' : 'inherit' }}>{b}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHead title={t.matrix} right={<span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.matrix_hint}</span>} />
        <div style={{ display: 'grid', gridTemplateColumns: state.mobile ? '1fr' : '1fr 1fr', gap: 0 }}>
          <div style={{ padding: '12px 18px', borderRight: state.mobile ? 'none' : '1px solid var(--border)', borderBottom: state.mobile ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.montaje}</div>
            {matrix('Montaje')}
          </div>
          <div style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.colaudo}</div>
            {matrix('Collaudo')}
          </div>
        </div>
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={() => showToast('saved')} style={pbtn}>{t.btn_save}</button>
      </div>
    </div>
  );
}
