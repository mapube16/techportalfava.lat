import { useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiState, ConceptPill, StatusPill, filterBy } from '../ui';
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
    <div className="px-4.5 py-2">
      {dias.map((fecha, i) => {
        const e = porFecha.get(fecha);
        return (
          <div key={fecha} className={`flex gap-3 py-2.5 items-start ${i ? 'border-t border-border' : ''}`}>
            <div className="w-9.5 text-[11px] text-muted-foreground font-semibold shrink-0">
              {t.days[i]} {Number(fecha.slice(8, 10))}
            </div>
            <div className="w-[140px] shrink-0">
              {e?.conceptCode ? <ConceptPill code={e.conceptCode} lang={lang} /> : null}
            </div>
            <div className="flex-1 text-[12.5px] text-muted-foreground leading-relaxed min-w-0">
              {e?.description ?? ''}
              {e?.commessaShort ? (
                <span className="ml-2 font-mono text-[11px] text-primary">{e.commessaShort}</span>
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
    <div className={`${movil ? 'w-full' : 'w-[340px]'} shrink-0 flex flex-col gap-2.5`}>
      {q.length ? (
        q.map((n) => {
          const sel = !movil && cur?.id === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setSelNote(n.id)}
              className={`text-left rounded-card shadow-card px-3.5 py-3 min-h-11 cursor-pointer flex gap-2.5 items-center border transition-colors ${
                sel ? 'bg-primary-tint border-primary' : 'bg-card border-border hover:bg-muted'
              }`}
            >
              <div className="size-8.5 rounded-full bg-primary-700 text-white grid place-items-center text-xs font-bold shrink-0">
                {iniciales(n.technicianName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold">{n.technicianName}</div>
                <div className="text-xs text-muted-foreground truncate">{n.projectName}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{n.weekStart}</div>
              </div>
              <span className="size-2 rounded-full bg-sent shrink-0" />
            </button>
          );
        })
      ) : (
        <div className="p-7.5 text-center text-muted-foreground text-[13px] border border-dashed border-input rounded-card">
          <span className="inline-flex gap-1.5 items-center justify-center">
            {hi('check', { w: 15 })}
            {t.inbox_empty}
          </span>
        </div>
      )}
    </div>
  );

  const detalle = cur ? (
    <Card className="p-0 gap-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4.5 py-4 border-b border-border flex-wrap">
        {movil ? (
          <Button variant="outline" size="icon" onClick={() => setSelNote(null)} className="size-11 md:size-9">
            ←
          </Button>
        ) : null}
        <div className="size-10 rounded-full bg-primary-700 text-white grid place-items-center font-bold shrink-0">
          {iniciales(cur.technicianName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold">{cur.technicianName}</div>
          <div className="text-[12.5px] text-muted-foreground">
            {cur.projectName} · {cur.weekStart}
            {cur.roleTypeName ? ` · ${cur.roleTypeName}` : ''}
          </div>
        </div>
        <StatusPill st={cur.status as never} t={t} />
      </div>

      <Dias nota={cur} lang={state.lang} dias={diasDeSemana(cur.weekStart)} />

      {err ? (
        <div className="px-4.5 py-2.5 text-[12.5px] text-warn">{t.err_save}: {err}</div>
      ) : null}

      <div className="flex gap-2.5 px-4.5 py-3.5 border-t border-border justify-end flex-wrap">
        <Button
          variant="destructive"
          onClick={() => patch({ returnOpen: true, returnId: cur.id, returnUpdatedAt: cur.updatedAt })}
          className="min-h-11 md:min-h-9"
        >
          {hi('ureturn', { w: 15 })}
          {t.btn_return}
        </Button>
        <Button onClick={() => aprobar(cur)} className="min-h-11 md:min-h-9 bg-ok text-white hover:bg-ok/90">
          {hi('check', { w: 16 })}
          {t.btn_approve}
        </Button>
      </div>
    </Card>
  ) : (
    <Card>
      <div className="p-10 text-center text-muted-foreground">{t.inbox_empty}</div>
    </Card>
  );

  // En móvil una cosa u otra, nunca las dos: lado a lado no cabe en 390px.
  if (movil) return cur ? detalle : lista;

  return (
    <div className="flex gap-4.5 items-start">
      {lista}
      <div className="flex-1 min-w-0">{detalle}</div>
    </div>
  );
}
