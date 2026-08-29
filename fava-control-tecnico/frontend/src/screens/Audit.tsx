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
const ACCION: Record<string, [icono: string, color: string]> = {
  approve: ['check', 'text-ok'],
  return: ['ureturn', 'text-warn'],
  submit: ['up', 'text-sent'],
  reopen: ['ureturn', 'text-sent'],
  update: ['pencil', 'text-ink-2'],
  deactivate: ['x', 'text-warn'],
};

/**
 * `{"status":"submitted"}` no se lee de un vistazo. Se aplana a `status: submitted`,
 * que es lo que alguien busca cuando abre esta pantalla porque algo no cuadra.
 */
/** Un UUID entero no dice nada; sus 8 primeros bastan para cotejar dos filas. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un sha256 son 64 caracteres que ocupan media fila y no se comparan a ojo. */
const HEX_LARGO = /^[0-9a-f]{32,}$/i;

/**
 * Un valor del log, legible.
 *
 * ANTES ERA `String(x)` A SECAS, y eso destruia justo lo que hay que ver: el motor
 * guarda `gastosTecnico: [{valor: "50000", descripcion: "asd"}]` —el cambio se lee
 * perfectamente— y la pantalla escribia `[object Object]`. El dato estaba bien; el
 * que lo pintaba lo tiraba a la basura.
 *
 * Recursiva porque los gastos son un array DE objetos: aplanar un solo nivel deja el
 * mismo agujero un escalon mas abajo.
 */
const valor = (x: unknown): string => {
  if (x === null || x === undefined || x === '') return '—';
  if (Array.isArray(x)) return x.length ? x.map(valor).join(' · ') : '—';
  if (typeof x === 'object') {
    return Object.entries(x as Record<string, unknown>)
      .map(([k, y]) => `${k} ${valor(y)}`)
      .join(' ');
  }
  const t = String(x);
  // Se acortan al pintar, no al guardar: el log conserva el hash entero, que es lo que
  // le da valor como prueba.
  if (UUID.test(t)) return t.slice(0, 8) + '…';
  if (HEX_LARGO.test(t)) return t.slice(0, 12) + '…';
  return t;
};

const resumir = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'object') return String(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}: ${valor(x)}`)
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
    (a: AuditRow) => `${a.actorName} ${a.entity} ${a.entityLabel ?? ''} ${a.action} ${a.reason ?? ''}`,
  );

  if (!list.length) {
    return (
      <Card>
        <CardHead title={t.t_audit} />
        <div className="p-8 text-center text-[13px] text-ink-3">{t.audit_empty}</div>
      </Card>
    );
  }

  if (movil) {
    return (
      <Card>
        <CardHead title={t.t_audit} />
        <div className="p-3 flex flex-col gap-2.5">
          {list.map((a) => {
            const [ic, col] = ACCION[a.action] ?? ['check', 'text-ink-2'];
            return (
              <div key={a.id} className="border border-line rounded-card p-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-grid place-items-center size-[26px] rounded-md bg-surface-2 shrink-0 ${col}`}>
                    {hi(ic, { w: 14 })}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold">{a.actorName}</div>
                    <div className="text-xs text-ink-3">{a.entityLabel ?? a.entity} · {a.action}</div>
                  </div>
                  <span className="text-[11px] text-ink-3 font-mono shrink-0">{cuando(a.createdAt)}</span>
                </div>
                <div className="text-[12.5px] text-ink-2 mt-2">
                  {resumir(a.before)} → <b className="text-ink">{resumir(a.after)}</b>
                </div>
                {a.reason ? <div className="text-[12.5px] text-warn mt-1.5">{a.reason}</div> : null}
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[t.col_actor, t.col_action, t.col_entity, t.col_before, t.col_after, t.audit_reason, t.col_when].map((c, i) => (
                <th key={i} className={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const [ic, col] = ACCION[a.action] ?? ['check', 'text-ink-2'];
              return (
                <tr key={a.id} className="border-t border-line">
                  <td className={`${td} font-semibold`}>
                    {a.actorName}
                    {/* CAT-06: quién aprobó en nombre de quién. Es justo el caso que
                        alguien viene a mirar aquí meses después. */}
                    {a.onBehalfOfId ? (
                      <div className="text-[11px] text-ink-3">{t.audit_on_behalf}</div>
                    ) : null}
                  </td>
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${col}`}>
                      <span className="inline-flex">{hi(ic, { w: 14 })}</span>
                      {a.action}
                    </span>
                  </td>
                  <td className={td}>
                    {/* De QUE nota se habla. La tabla decia solo «weekly_note», que es
                        el tipo de fila, no cual: nadie podia saber si era la de Cibao
                        de agosto o la de Lucchetti de marzo. */}
                    {a.entityLabel ? (
                      <>
                        <div className="font-semibold">{a.entityLabel}</div>
                        <div className="text-[11px] text-ink-3">{a.entity}</div>
                      </>
                    ) : (
                      a.entity
                    )}
                  </td>
                  <td className={`${td} text-ink-3`}>{resumir(a.before)}</td>
                  <td className={`${td} font-semibold`}>{resumir(a.after)}</td>
                  <td className={`${td} text-warn max-w-[220px]`}>{a.reason ?? ''}</td>
                  <td className={`${td} font-mono text-xs text-ink-2 whitespace-nowrap`}>
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
