import type { ReactNode } from 'react';
import { svg, ICON } from '../icons';
import { Card, CardHead, StatusPill } from '../ui';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { listNotes } from '../lib/api/weeklyNotes';

export default function Home() {
  const { state, t, go, patch } = useApp();

  // Las suyas y solo las suyas: lo garantiza la política `wn_read` de RLS en el motor,
  // no un filtro por nombre —que además se rompía en cuanto dos técnicos se llamaban
  // parecido, como Leomar y Leomir Klein—.
  const { data: mine } = useApiData(() => listNotes(), [state.dataVersion]);

  // Días registrados esta semana: los que YA tienen concepto en las notas propias
  // (borrador o enviado, da igual el proyecto). Sustituye al `reg = 4` fijo del mock.
  const registrados = (mine ?? []).filter((n) => n.status !== 'draft').length;
  const pendientes = (mine ?? []).filter((n) => n.status === 'returned').length;

  const nombre = state.me?.status === 'ok' ? state.me.user.displayName.split(' ')[0] : '';

  const quick = (icon: ReactNode, label: string, sub: string, on: () => void, accent: boolean) => (
    <button
      onClick={on}
      className="flex-1 min-w-[180px] flex items-center gap-3.5 p-4.5 min-h-11 bg-card border border-border rounded-card shadow-card cursor-pointer text-left hover:bg-muted/50 transition-colors"
    >
      <div
        className={`size-11 rounded-xl grid place-items-center shrink-0 ${
          accent ? 'bg-accent-tint text-accent-brand' : 'bg-primary-tint text-primary'
        }`}
      >
        {icon}
      </div>
      <div>
        <div className="text-[15px] font-bold">{label}</div>
        <div className="text-[12.5px] text-muted-foreground">{sub}</div>
      </div>
    </button>
  );

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-4.5">
      <div className="bg-gradient-to-br from-primary-700 to-primary text-white rounded-card p-5.5 shadow-card">
        <div className="text-[13px] opacity-80">
          {nombre ? `${t.greeting}, ${nombre}` : t.greeting} · {t.this_week}
        </div>
        <div className="flex gap-6 mt-3.5 flex-wrap">
          <div>
            <div className="text-[34px] font-bold font-cond leading-none">{registrados} / 7</div>
            <div className="text-xs opacity-80 mt-1">{t.day_registered}</div>
          </div>
          <div>
            <div className="text-[34px] font-bold font-cond leading-none text-[#ffd7b0]">
              {pendientes}
            </div>
            <div className="text-xs opacity-80 mt-1">{t.pending}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3.5 flex-wrap">
        {quick(svg(ICON.cal, { w: 22 }), t.btn_logday, t.log_sub, () => patch({ logOpen: true }), true)}
        {quick(svg(ICON.doc, { w: 22 }), t.btn_myweek, t.this_week, () => go('week'), false)}
      </div>

      <Card>
        <CardHead
          title={t.recent_notes}
          right={
            <button
              onClick={() => go('notes')}
              className="bg-transparent border-0 text-primary text-[12.5px] font-semibold cursor-pointer hover:underline"
            >
              {t.btn_open} →
            </button>
          }
        />
        <div>
          {(mine ?? []).length ? (
            (mine ?? []).map((n, i) => (
              <div
                key={n.id}
                className={`flex items-center gap-3 p-row ${i ? 'border-t border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{n.projectName}</div>
                  <div className="text-xs text-muted-foreground font-mono">{n.weekStart}</div>
                </div>
                {n.returnComment ? (
                  <span className="text-[11.5px] text-warn max-w-[280px] truncate">
                    “{n.returnComment}”
                  </span>
                ) : null}
                <StatusPill st={n.status as never} t={t} />
              </div>
            ))
          ) : (
            <div className="p-row text-[13px] text-muted-foreground text-center">{t.empty_notes}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
