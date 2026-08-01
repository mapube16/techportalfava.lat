import { svg, ICON, hi } from '../icons';
import { ApiState, Card, Empty, StatusPill, gbtn } from '../ui';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { listNotes } from '../lib/api/weeklyNotes';

/**
 * Las notas del TECNICO. No las crea ni las elige (NOTA-01): salen solas al enviar la
 * semana, una por proyecto. Aqui solo las mira y, si se la devolvieron, lee el porque.
 *
 * No hace falta filtrar por tecnico: la politica `wn_read` de RLS ya lo hace en el
 * motor. Un filtro aqui seria una segunda verdad que puede desincronizarse.
 */
export default function Notes() {
  const { state, t, go, patch } = useApp();
  const { data, error } = useApiData(() => listNotes(), [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  if (!data.length) {
    return (
      <Empty
        icon={svg(ICON.doc, { w: 30 })}
        msg={t.empty_notes}
        btn={t.btn_logday}
        onClick={() => patch({ logOpen: true })}
      />
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((n) => (
        <Card key={n.id}>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{n.projectName}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'Roboto Mono' }}>
                  {n.weekStart}
                  {n.roleTypeName ? ` · ${n.roleTypeName}` : ''}
                </div>
              </div>
              <StatusPill st={n.status as never} t={t} />
              {/* «Reenviar» NO es un boton propio: se corrige el dia en la semana y se
                  vuelve a enviar desde alli. Un boton aqui sugeriria que la nota se
                  puede reenviar sin tocar lo que la hizo volver. */}
              <button onClick={() => go('week')} style={{ ...gbtn, minHeight: 'var(--tap)' }}>
                {t.btn_open}
              </button>
            </div>
            {n.returnComment ? (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ color: 'var(--warn)', flex: 'none' }}>{svg(ICON.triangle, { w: 17 })}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)' }}>{t.returned_note}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{n.returnComment}</div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
