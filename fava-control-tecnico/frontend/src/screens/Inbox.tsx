import { useState } from 'react';
import { hi } from '../icons';
import { ApiState, Card, ConceptPill, StatusPill, filterBy, gbtn, pbtn, wbtn } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import { approveNote, listNotes } from '../lib/api/weeklyNotes';
import type { WeeklyNote } from '../lib/api/weeklyNotes';
import { getWeek } from '../lib/api/dailyEntries';
import { diasDeSemana } from '../lib/fecha';

/**
 * La bandeja del admin: las notas enviadas, con los 7 días de cada una para poder
 * decidir sin salir de aquí.
 *
 * En móvil es UNA columna con navegación: la lista, y al elegir, el detalle con botón
 * de volver. El maestro/detalle lado a lado se desbordaba a 390px — era el pendiente
 * que quedó abierto de la auditoría de UX.
 */

/** Iniciales del nombre, para el avatar. Dos como mucho. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Los 7 días de la nota. Se piden aparte: es lo que el admin lee para decidir. */
function Dias({ nota, lang, dias }: { nota: WeeklyNote; lang: 'es' | 'it'; dias: string[] }) {
  const { t } = useApp();
  const { data } = useApiData(() => getWeek(dias[0], dias[6]), [nota.id]);
  const porFecha = new Map((data?.entries ?? []).map((e) => [e.date, e]));

  return (
    <div style={{ padding: '8px 18px' }}>
      {dias.map((fecha, i) => {
        const e = porFecha.get(fecha);
        return (
          <div key={fecha} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
            <div style={{ width: 38, fontSize: 11, color: 'var(--text-3)', fontWeight: 600, flex: 'none' }}>
              {t.days[i]} {Number(fecha.slice(8, 10))}
            </div>
            <div style={{ width: 140, flex: 'none' }}>
              {e?.conceptCode ? <ConceptPill code={e.conceptCode} lang={lang} /> : null}
            </div>
            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45, minWidth: 0 }}>
              {e?.description ?? ''}
              {e?.commessaShort ? (
                <span style={{ marginLeft: 8, fontFamily: 'Roboto Mono', fontSize: 11, color: 'var(--primary)' }}>
                  {e.commessaShort}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Inbox() {
  const { state, t, patch, showToast, refresh } = useApp();
  const movil = useIsMobile();
  const [selNote, setSelNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, error } = useApiData(() => listNotes('submitted'), [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const q = filterBy(data, state.search, (n) => `${n.technicianName} ${n.projectName}`);
  // En escritorio se preselecciona la primera; en móvil no, porque la lista ES la vista.
  const cur = q.find((n) => n.id === selNote) ?? (movil ? null : q[0]);

  const aprobar = (n: WeeklyNote) => {
    setErr(null);
    // `updatedAt` es lo que compara el servidor: si otro admin ya la movió, 409 en vez
    // de pisar su decisión en silencio.
    approveNote(n.id, n.updatedAt)
      .then(() => {
        setSelNote(null);
        refresh();
        showToast('saved');
      })
      .catch((e: unknown) => setErr(codigo(e)));
  };

  const lista = (
    <div style={{ width: movil ? '100%' : 340, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {q.length ? (
        q.map((n) => {
          const sel = !movil && cur?.id === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setSelNote(n.id)}
              style={{ textAlign: 'left', background: sel ? 'var(--primary-tint)' : 'var(--surface)', border: '1px solid ' + (sel ? 'var(--primary)' : 'var(--border)'), borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '13px 15px', minHeight: 'var(--tap)', cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'center' }}
            >
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--primary-700)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>
                {iniciales(n.technicianName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.technicianName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.projectName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'Roboto Mono' }}>{n.weekStart}</div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sent)', flex: 'none' }} />
            </button>
          );
        })
      ) : (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px dashed var(--border-2)', borderRadius: 10 }}>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            {hi('check', { w: 15 })}
            {t.inbox_empty}
          </span>
        </div>
      )}
    </div>
  );

  const detalle = cur ? (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {movil ? (
          <button onClick={() => setSelNote(null)} className={`${gbtn} px-3`}>←</button>
        ) : null}
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-700)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, flex: 'none' }}>
          {iniciales(cur.technicianName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{cur.technicianName}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {cur.projectName} · {cur.weekStart}
            {cur.roleTypeName ? ` · ${cur.roleTypeName}` : ''}
          </div>
        </div>
        <StatusPill st={cur.status as never} t={t} />
      </div>
      <Dias nota={cur} lang={state.lang} dias={diasDeSemana(cur.weekStart)} />
      {err ? (
        <div style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--warn)' }}>{t.err_save}: {err}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={() => patch({ returnOpen: true, returnId: cur.id, returnUpdatedAt: cur.updatedAt })}
          className={`${wbtn} min-h-11`}
        >
          {hi('ureturn', { w: 15 })}
          {t.btn_return}
        </button>
        <button onClick={() => aprobar(cur)} className={`${pbtn} min-h-11 bg-ok hover:bg-ok`}>
          {hi('check', { w: 16 })}
          {t.btn_approve}
        </button>
      </div>
    </Card>
  ) : (
    <Card>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{t.inbox_empty}</div>
    </Card>
  );

  // En móvil una cosa u otra, nunca las dos: lado a lado no cabe en 390px.
  if (movil) return cur ? detalle : lista;

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      {lista}
      <div style={{ flex: 1, minWidth: 0 }}>{detalle}</div>
    </div>
  );
}
