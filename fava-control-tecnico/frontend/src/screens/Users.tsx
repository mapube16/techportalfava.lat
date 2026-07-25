import { svg, ICON, hi } from '../icons';
import { Card, CardHead, filterBy, pbtn } from '../ui';
import { useApp } from '../state';
import { initials } from '../data';
import type { Role } from '../types';

export default function Users() {
  const { state, t, patch } = useApp();
  const rmap: Record<Role, [string, string, string]> = {
    T: [t.role_t, 'var(--sent)', 'var(--sent-tint)'],
    A: [t.role_a, 'var(--accent)', 'var(--accent-tint)'],
    S: [t.role_s, 'var(--primary)', 'var(--primary-tint)'],
  };
  const isSuper = state.role === 'S';
  const rows = filterBy(state.users, state.search, (u) => u.n + ' ' + u.mail);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: isSuper ? 'var(--primary-tint)' : 'var(--warn-tint)', border: '1px solid ' + (isSuper ? 'var(--primary)' : 'var(--warn)'), borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--text-2)' }}>
        {svg(ICON.shieldPlain, { w: 16 })}
        {t.only_super}
      </div>
      <Card>
        <CardHead
          title={t.t_users}
          right={
            <button onClick={() => patch({ inviteOpen: true })} style={pbtn}>
              {hi('plus', { w: 15 })}
              {t.btn_invite}
            </button>
          }
        />
        <div>
          {rows.map((u, i) => (
            <div key={u.mail} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initials(u.n)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.n}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.mail}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['T', 'A', 'S'] as Role[]).map((rc) => {
                  const on = u.roles.includes(rc);
                  const [lbl, c, bg] = rmap[rc];
                  const locked = rc !== 'T' && !isSuper;
                  return (
                    <button
                      key={rc}
                      disabled={locked}
                      title={locked ? t.only_super : ''}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: locked ? 'not-allowed' : 'pointer', border: '1px solid ' + (on ? c : 'var(--border-2)'), background: on ? bg : 'transparent', color: on ? c : 'var(--text-3)', opacity: locked ? 0.5 : 1 }}
                    >
                      {on ? hi('check', { w: 13 }) : hi('plus', { w: 13 })}
                      <span style={{ marginLeft: 4 }}>{lbl}</span>
                      {rc === 'A' && locked ? hi('lock', { w: 12 }) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
