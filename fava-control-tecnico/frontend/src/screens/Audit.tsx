import { hi } from '../icons';
import { ApiState, Card, CardHead, filterBy, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { useApiData } from '../lib/api/useApiData';
import { listAudit } from '../lib/api/weeklyNotes';
import type { AuditRow } from '../lib/api/weeklyNotes';

/**
 * AUD-02 — el visor del Super Admin.
 *
 * Solo lee. No hay botón de exportar ni de borrar: el `audit_log` es append-only por
 * motor (sin política de UPDATE ni DELETE, y sin privilegio), así que una UI que
 * sugiriera lo contrario estaría mintiendo sobre lo que se puede hacer.
 */

/** Icono y color por acción. Decoración: una acción nueva cae en el default. */
const ACCION: Record<string, [string, string]> = {
  approve: ['check', 'var(--ok)'],
  return: ['ureturn', 'var(--warn)'],
  submit: ['up', 'var(--sent)'],
  reopen: ['ureturn', 'var(--sent)'],
  update: ['pencil', 'var(--text-2)'],
  deactivate: ['x', 'var(--warn)'],
};

/**
 * `{"status":"submitted"}` no se lee de un vistazo. Se aplana a `status: submitted`,
 * que es lo que alguien busca cuando abre esta pantalla porque algo no cuadra.
 */
const resumir = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'object') return String(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}: ${x === null ? '—' : String(x)}`)
    .join(', ');
};

/** Fecha y hora LOCALES: el instante viene en ISO y aquí sí manda el reloj del lector. */
const cuando = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

export default function Audit() {
  const { state, t } = useApp();
  const movil = useIsMobile();
  const { data, error } = useApiData(() => listAudit({ take: 200 }), [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const list = filterBy(
    data,
    state.search,
    (a: AuditRow) => `${a.actorName} ${a.entity} ${a.action} ${a.reason ?? ''}`,
  );

  if (!list.length) {
    return (
      <Card>
        <CardHead title={t.t_audit} />
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t.audit_empty}</div>
      </Card>
    );
  }

  if (movil) {
    return (
      <Card>
        <CardHead title={t.t_audit} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((a) => {
            const [ic, col] = ACCION[a.action] ?? ['check', 'var(--text-2)'];
            return (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, color: col, background: 'var(--surface-2)', flex: 'none' }}>
                    {hi(ic, { w: 14 })}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.actorName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.entity} · {a.action}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Roboto Mono', flex: 'none' }}>{cuando(a.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8 }}>
                  {resumir(a.before)} → <b style={{ color: 'var(--text)' }}>{resumir(a.after)}</b>
                </div>
                {a.reason ? <div style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 6 }}>{a.reason}</div> : null}
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title={t.t_audit} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t.col_actor, t.col_action, t.col_entity, t.col_before, t.col_after, t.audit_reason, t.col_when].map((c, i) => (
                <th key={i} style={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const [ic, col] = ACCION[a.action] ?? ['check', 'var(--text-2)'];
              return (
                <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {a.actorName}
                    {/* CAT-06: quién aprobó en nombre de quién. Es justo el caso que
                        alguien viene a mirar aquí meses después. */}
                    {a.onBehalfOfId ? (
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.audit_on_behalf}</div>
                    ) : null}
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: col, fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex' }}>{hi(ic, { w: 14 })}</span>
                      {a.action}
                    </span>
                  </td>
                  <td style={td}>{a.entity}</td>
                  <td style={{ ...td, color: 'var(--text-3)' }}>{resumir(a.before)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{resumir(a.after)}</td>
                  <td style={{ ...td, color: 'var(--warn)', maxWidth: 220 }}>{a.reason ?? ''}</td>
                  <td style={{ ...td, fontFamily: 'Roboto Mono', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {cuando(a.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
