import { hi } from '../icons';
import { ApiState, Card, CardHead, filterBy, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { useApiData } from '../lib/api/useApiData';
import { listAudit } from '../lib/api/weeklyNotes';
import { describir } from '../lib/auditoria';
import type { AuditRow } from '../lib/api/weeklyNotes';
import type { Dict } from '../i18n';

/**
 * AUD-02 — el visor del Super Admin.
 *
 * Solo lee. No hay botón de exportar ni de borrar: el `audit_log` es append-only por
 * motor (sin política de UPDATE ni DELETE, y sin privilegio), así que una UI que
 * sugiriera lo contrario estaría mintiendo sobre lo que se puede hacer.
 *
 * CADA FILA ES UNA FRASE, y esto es el cambio: antes eran siete columnas contando la
 * fila de la base de datos —`approve`, `status: submitted`, `status: approved`— tres
 * veces el mismo hecho, en vocabulario de tabla, y con lo único que de verdad cambiaba
 * (los gastos) volcado entero a los dos lados para compararlo a ojo. La frase la arma
 * `lib/auditoria.ts`, que es donde se puede probar.
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

/** Fecha y hora LOCALES: el instante viene en ISO y aquí sí manda el reloj del lector. */
const cuando = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

/**
 * El registro entero, tal como está guardado.
 *
 * La frase de arriba es una VISTA; la prueba es esto. Por eso no se esconde, solo deja
 * de ir primero: `<details>` nativo, sin estado ni librería, cerrado por defecto.
 */
function Original({ fila, t }: { fila: AuditRow; t: Dict }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-[11px] text-ink-3 hover:text-ink-2">
        {t.aud_raw}
      </summary>
      <pre className="mt-1 max-w-[460px] whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-snug text-ink-2">
        {JSON.stringify(fila, null, 2)}
      </pre>
    </details>
  );
}

/** Qué pasó: el verbo, el motivo pegado a él y el registro debajo. */
function Que({ fila, t }: { fila: AuditRow; t: Dict }) {
  const [ic, col] = ACCION[fila.action] ?? ['check', 'text-ink-2'];
  return (
    <>
      <div className={`flex items-start gap-1.5 font-semibold ${col}`}>
        <span className="mt-[2px] inline-flex shrink-0">{hi(ic, { w: 14 })}</span>
        <span>{describir(fila, t)}</span>
      </div>
      {/* Una devolución sin su motivo no sirve de nada, y el motivo en columna propia
          dejaba las otras seis filas con un hueco. Va donde se lee. */}
      {fila.reason ? (
        <div className="mt-0.5 text-[12.5px] text-warn">
          {t.audit_reason}: «{fila.reason}»
        </div>
      ) : null}
      <Original fila={fila} t={t} />
    </>
  );
}

export default function Audit() {
  const { state, t } = useApp();
  const movil = useIsMobile();
  const { data, error } = useApiData(() => listAudit({ take: 200 }), [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  // Se busca por la frase además de por la acción cruda: quien lee «Aprobó» y la
  // escribe en el buscador tiene que encontrar la fila que está viendo.
  const list = filterBy(
    data,
    state.search,
    (a: AuditRow) =>
      `${a.actorName} ${a.entity} ${a.entityLabel ?? ''} ${a.action} ${describir(a, t)} ${a.reason ?? ''}`,
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
          {list.map((a) => (
            <div key={a.id} className="border border-line rounded-card p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold">{a.actorName}</div>
                  {a.entityLabel ? <div className="text-xs text-ink-3">{a.entityLabel}</div> : null}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{cuando(a.createdAt)}</span>
              </div>
              <div className="mt-2 text-[12.5px]">
                <Que fila={a} t={t} />
              </div>
            </div>
          ))}
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
              {[t.col_actor, t.col_action, t.col_entity, t.col_when].map((c, i) => (
                <th key={i} className={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className={`${td} font-semibold`}>
                  {a.actorName}
                  {/* CAT-06: quién aprobó en nombre de quién. Es justo el caso que
                      alguien viene a mirar aquí meses después. */}
                  {a.onBehalfOfId ? (
                    <div className="text-[11px] text-ink-3">{t.audit_on_behalf}</div>
                  ) : null}
                </td>
                <td className={td}>
                  <Que fila={a} t={t} />
                </td>
                {/* De QUÉ nota (o de qué técnico) se habla. El TIPO de fila ya no se
                    pinta aquí: la frase de al lado dice «la nota» o «el técnico». */}
                <td className={`${td} font-semibold`}>
                  {a.entityLabel ?? <span className="font-normal text-ink-3">—</span>}
                </td>
                <td className={`${td} whitespace-nowrap font-mono text-xs text-ink-2`}>
                  {cuando(a.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
