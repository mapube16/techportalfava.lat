import { hi } from '../icons';
import { ApiState, Card, CardHead, chip, filterBy, money, nf, pbtn, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { useApiData } from '../lib/api/useApiData';
import { listProjects } from '../lib/api/projects';
import type { ProjectListItem } from '../lib/api/projects';

/** El valor de contrato puede no estar cargado todavía: un 0 sería un dato falso. */
const valor = (p: ProjectListItem) =>
  p.contractValue == null ? '—' : money(p.contractValue, p.currencyCode ?? '');

export default function Projects() {
  const { state, t, go, patch } = useApp();
  const movil = useIsMobile();
  const { data, error } = useApiData(listProjects, [state.dataVersion]);

  const addBtn = (
    <button onClick={() => patch({ projOpen: true })} className={pbtn}>
      {hi('plus', { w: 15 })}
      {t.btn_newproj}
    </button>
  );

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const rows = filterBy(data, state.search, (p) =>
    [p.name, p.clientName, p.contractNumber, p.machineCodes.join(' '), p.country].join(' '));

  const openProject = (id: string) => {
    patch({ selProject: id });
    go('project');
  };

  if (movil) {
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
              <div key={p.id} onClick={() => openProject(p.id)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13, cursor: 'pointer', opacity: p.isActive ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{p.clientName} · {p.country}</div>
                  </div>
                  <span style={{ color: 'var(--primary)', flex: 'none' }}>→</span>
                </div>
                <div style={{ display: 'flex', gap: 18, marginTop: 11, flexWrap: 'wrap' }}>
                  {meta(t.proj_contract_no, p.contractNumber)}
                  {meta(t.contract, valor(p))}
                  {meta(t.hours_short, nf(p.normalHours || 0) + ' h')}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 11 }}>
                  {p.machineCodes.map((m) => (
                    <span key={m} className={chip}>{m}</span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{data.length ? t.filter_no : t.proj_none}</div>
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
              {['#', t.col_project, t.client, t.proj_contract_no, t.proj_country, t.contract, t.hours_short, t.orders, ''].map((c, i) => (
                <th key={i} className={`${th} ${i === 6 ? 'text-right' : 'text-left'}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((p, i) => (
                <tr key={p.id} onClick={() => openProject(p.id)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)', opacity: p.isActive ? 1 : 0.55 }}>
                  <td className={td}><span style={{ color: 'var(--text-3)', fontFamily: 'Roboto Mono', fontSize: 12 }}>{i + 1}</span></td>
                  <td className={`${td} font-semibold`}>{p.name}</td>
                  <td className={td}>{p.clientName}</td>
                  <td className={`${td} font-mono text-xs text-ink-2`}>{p.contractNumber}</td>
                  <td className={td}>{p.country}</td>
                  <td className={`${td} font-mono font-semibold`}>{valor(p)}</td>
                  <td className={`${td} font-mono font-semibold text-right`}>{nf(p.normalHours || 0)} h</td>
                  <td className={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.machineCodes.map((m) => (
                        <span key={m} className={chip}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className={`${td} text-right text-primary`}>→</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} style={{ padding: 34, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{data.length ? t.filter_no : t.proj_none}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
