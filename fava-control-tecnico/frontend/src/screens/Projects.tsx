import { hi } from '../icons';
import { Card, CardHead, chip, filterBy, pbtn, td, th } from '../ui';
import { useApp } from '../state';
import { money, nf } from '../data';

export default function Projects() {
  const { state, t, go, patch } = useApp();
  const rows = filterBy(state.projects, state.search, (p) => [p.name, p.client, p.oa, p.country].join(' '));
  const addBtn = (
    <button onClick={() => patch({ projOpen: true })} style={pbtn}>
      {hi('plus', { w: 15 })}
      {t.btn_newproj}
    </button>
  );
  const openProject = (id: string) => {
    patch({ selProject: id });
    go('project');
  };

  if (state.mobile) {
    const meta = (a: string, b: string) => (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{a}</div>
        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Roboto Mono', marginTop: 1 }}>{b}</div>
      </div>
    );
    return (
      <Card>
        <CardHead title={t.t_projects} right={addBtn} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.length ? (
            rows.map((p) => (
              <div key={p.id} onClick={() => openProject(p.id)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{p.client} · {p.country}</div>
                  </div>
                  <span style={{ color: 'var(--primary)', flex: 'none' }}>→</span>
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 11, flexWrap: 'wrap' }}>
                  {meta('OA', p.oa)}
                  {meta(t.contract, money(p.value, p.cur))}
                  {meta(t.hours_short, nf(p.nh || 0) + ' h')}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 11 }}>
                  {p.machines.map((m) => (
                    <span key={m} style={chip()}>{m}</span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t.filter_no}</div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title={t.t_projects} right={addBtn} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['#', t.col_project, t.client, 'OA', t.proj_country, t.contract, t.hours_short, t.machines, ''].map((c, i) => (
                <th key={i} style={{ ...th, textAlign: i === 6 ? 'right' : 'left' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((p, i) => (
                <tr key={p.id} onClick={() => openProject(p.id)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                  <td style={td}><span style={{ color: 'var(--text-3)', fontFamily: 'Roboto Mono', fontSize: 12 }}>{i + 1}</span></td>
                  <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                  <td style={td}>{p.client}</td>
                  <td style={{ ...td, fontFamily: 'Roboto Mono', fontSize: 12, color: 'var(--text-2)' }}>{p.oa}</td>
                  <td style={td}>{p.country}</td>
                  <td style={{ ...td, fontFamily: 'Roboto Mono', fontWeight: 600 }}>{money(p.value, p.cur)}</td>
                  <td style={{ ...td, fontFamily: 'Roboto Mono', fontWeight: 600, textAlign: 'right' }}>{nf(p.nh || 0)} h</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.machines.map((m) => (
                        <span key={m} style={chip()}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--primary)' }}>→</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} style={{ padding: 34, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t.filter_no}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
