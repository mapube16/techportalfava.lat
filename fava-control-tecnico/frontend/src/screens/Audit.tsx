import { hi } from '../icons';
import { Card, CardHead, filterBy, gbtn, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import type { AuditRow } from '../types';

const AM: Record<AuditRow['act'], [string, string]> = {
  approve: ['check', 'var(--ok)'],
  return: ['ureturn', 'var(--warn)'],
  submit: ['up', 'var(--sent)'],
  edit: ['pencil', 'var(--text-2)'],
  grant: ['key', 'var(--primary)'],
  create: ['plus', 'var(--text-2)'],
};

export default function Audit() {
  const { state, t, showToast } = useApp();
  const movil = useIsMobile();
  const list = filterBy(state.audit, state.search, (a) => a.actor + ' ' + a.ent + ' ' + a.act);
  const exportBtn = (
    <button onClick={() => showToast('saved')} style={gbtn}>
      {hi('download', { w: 14 })}
      {t.export}
    </button>
  );

  if (movil) {
    return (
      <Card>
        <CardHead title={t.t_audit} right={exportBtn} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((a, i) => {
            const [ic, col] = AM[a.act] || ['check', 'var(--text-2)'];
            return (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, color: col, background: 'var(--surface-2)', flex: 'none' }}>{hi(ic, { w: 14 })}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.actor}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.ent}</div>
                  </div>
                  <span style={{ fontFamily: 'Roboto Mono', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{a.when}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-3)' }}>{a.before}</span>
                  <span style={{ color: col }}>→</span>
                  <span style={{ fontWeight: 600 }}>{a.after}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead
        title={t.t_audit}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={gbtn}>
              {hi('funnel', { w: 14 })}
              {t.filter}
            </button>
            {exportBtn}
          </div>
        }
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t.col_actor, t.col_action, t.col_entity, t.col_before, t.col_after, t.col_when].map((c, i) => (
                <th key={i} style={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((a, i) => {
              const [ic, col] = AM[a.act] || ['check', 'var(--text-2)'];
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{a.actor}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: col, fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex' }}>{hi(ic, { w: 14 })}</span>
                      {a.act}
                    </span>
                  </td>
                  <td style={td}>{a.ent}</td>
                  <td style={{ ...td, color: 'var(--text-3)' }}>{a.before}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{a.after}</td>
                  <td style={{ ...td, fontFamily: 'Roboto Mono', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{a.when}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
