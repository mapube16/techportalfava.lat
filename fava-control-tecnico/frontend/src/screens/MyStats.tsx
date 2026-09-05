import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, Empty, mesCorto, nf } from '../ui';
import { CONCEPT_COLOR } from '../i18n';
import { svg, ICON, hi } from '../icons';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { getMisKpis } from '../lib/api/misKpis';
import type { Dict } from '../i18n';
import type { Lang } from '../types';
import type { MiUtilizacion, MisKpis } from '../lib/api/misKpis';

/**
 * «Mi resumen» — lo que el técnico produjo, devuelto a él. Una pantalla, sin scroll
 * (diseño 6a/6b).
 *
 * Fue siete tarjetas apiladas en 820 px: dos pantallas de scroll para 19 días de
 * datos. Ahora: las tres cifras en una fila, el año en doce columnas, y el desglose
 * en un bloque con control segmentado Proyecto / Máquina. Lo mismo, en un tercio del
 * alto.
 *
 * LO QUE NO ESTÁ, y no por olvido: nada comercial (valor de contrato, vendido contra
 * ejecutado) y nada de otros técnicos. El servidor tampoco lo manda — ver
 * `mis-kpis.service.ts`. Es regla firme del producto.
 *
 * La utilización es solo la propia, con la regla del admin (KPI-02): lo que la hacía
 * un juicio era compararse con otros, y aquí no hay nadie más.
 *
 * Decisiones del rediseño que se leen en el código:
 *   · Doce columnas de mes y no una línea: dos puntos no son una tendencia, y las
 *     columnas funcionan desde el primer mes.
 *   · Un punto por día en lugar de barras proporcionales: con max=9, cinco de siete
 *     proyectos quedaban en un 11 % de barra. Los puntos se cuentan de un vistazo.
 *   · El cliente se imprime solo si no repite el nombre del proyecto.
 *   · La commessa identifica la máquina; el nombre largo (tres fases concatenadas del
 *     Excel) respira en dos líneas en vez de cortarse.
 *   · Lo devuelto es lo único sobre lo que hay que actuar: lleva acción, no subtítulo.
 */

const punto = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};

const arco = (cx: number, cy: number, r: number, desde: number, hasta: number) => {
  const [x1, y1] = punto(cx, cy, r, desde);
  const [x2, y2] = punto(cx, cy, r, hasta);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${hasta - desde > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/** El gauge de 270°, en una casilla y no en una tarjeta entera. */
function Gauge({ u, size = 96 }: { u: MiUtilizacion; size?: number }) {
  const INI = -135;
  const fin = u.pct === null ? INI : INI + (270 * u.pct) / 100;
  return (
    <svg viewBox="0 0 168 168" width={size} height={size} className="shrink-0" role="img" aria-label={`${u.pct ?? '—'}%`}>
      <path d={arco(84, 84, 66, INI, 135)} fill="none" stroke="var(--surface-3)" strokeWidth={17} strokeLinecap="round" />
      {u.pct !== null && u.pct > 0 ? (
        <path d={arco(84, 84, 66, INI, fin)} fill="none" stroke="var(--accent)" strokeWidth={17} strokeLinecap="round" />
      ) : null}
      <text x={84} y={98} textAnchor="middle" className="font-cond" style={{ fontSize: 40, fontWeight: 700, fill: 'var(--text)' }}>
        {u.pct === null ? '—' : `${Math.round(u.pct)}%`}
      </text>
    </svg>
  );
}

/** Un punto por día, hasta 24: más allá, el número ya lo dice y los puntos son ruido. */
function Puntos({ n }: { n: number }) {
  return (
    <span className="flex gap-[3px] shrink-0 mt-1">
      {Array.from({ length: Math.min(n, 24) }, (_, i) => (
        <span key={i} className="w-[7px] h-3.5 rounded-sm bg-primary" />
      ))}
    </span>
  );
}

/** Las doce columnas del año. `meses` viene con huecos; aquí se rellenan los doce. */
function Anio({ data, lang, t }: { data: MisKpis; lang: Lang; t: Dict }) {
  const cubos = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, days: 0 }));
  for (const m of data.months) cubos[Number(m.month.slice(5, 7)) - 1].days += m.days;
  const max = Math.max(...cubos.map((c) => c.days), 0);
  const top = cubos.find((c) => c.days === max && max > 0);
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="text-[12px] font-bold">{t.mine_year_title}</div>
          <div className="text-[10.5px] text-muted-foreground">
            {top ? t.mine_year_max.replace('{n}', nf(max)).replace('{m}', mesCorto(top.n, lang)) : ''}
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-24 mt-3.5">
          {cubos.map((c) => (
            <div key={c.n} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
              <span
                className={`font-mono text-[11px] ${c.days === max && max > 0 ? 'font-bold' : c.days ? '' : 'text-line-2'}`}
              >
                {c.days}
              </span>
              {/* Altura proporcional: es un dato, va en style. Los meses en cero dejan
                  una base de 3px para que la columna exista y se cuente. */}
              <span
                className="w-full rounded-t-[3px]"
                style={{
                  height: max ? `${Math.max((c.days / max) * 100, 4)}%` : '4%',
                  background: c.days === max && max > 0 ? 'var(--primary)' : c.days ? 'var(--primary-tint)' : 'var(--surface-3)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1.5 pt-1.5 border-t border-surface-2">
          {cubos.map((c) => (
            <span
              key={c.n}
              className={`flex-1 text-center text-[10.5px] ${c.days === max && max > 0 ? 'font-bold' : 'text-muted-foreground'}`}
            >
              {mesCorto(c.n, lang)}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function MyStats() {
  const { state, t, patch, go } = useApp();
  /** `null` = todo su histórico. Arranca en el año en curso, que es lo que se mira. */
  const [anio, setAnio] = useState<number | null>(new Date().getFullYear());
  const [tab, setTab] = useState<'project' | 'machine'>('project');

  const { data, error } = useApiData(() => getMisKpis(anio), [anio, state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const anios = (
    <div className="flex gap-1.5 flex-wrap">
      {data.years.map((a) => (
        <Button key={a} variant={anio === a ? 'default' : 'outline'} size="sm" onClick={() => setAnio(a)} className="min-h-11 md:min-h-8">
          {a}
        </Button>
      ))}
      <Button variant={anio === null ? 'default' : 'outline'} size="sm" onClick={() => setAnio(null)} className="min-h-11 md:min-h-8">
        {t.grid_all_years}
      </Button>
    </div>
  );

  /**
   * Sin jornadas en el año elegido puede ser que el técnico sea nuevo, o que esté
   * mirando un año en el que no trabajó. Si tiene otros años se le dice, en vez de
   * dejarle un vacío que parece la aplicación rota.
   */
  if (!data.totalDays) {
    return (
      <div className="max-w-[820px] mx-auto flex flex-col gap-4">
        {data.years.length ? anios : null}
        <Empty
          icon={svg(ICON.chart, { w: 30 })}
          msg={data.years.length ? t.mine_empty_year : t.mine_empty}
          btn={t.btn_logday}
          onClick={() => patch({ logOpen: true })}
        />
      </div>
    );
  }

  const u = data.utilization;
  const restantes = data.totalDays - u.productive;
  const sinMaquina = Math.max(u.productive - data.daysWithMachine, 0);
  const etiqueta = (c: { labelEs: string; labelIt: string }) => (state.lang === 'it' ? c.labelIt : c.labelEs);
  const mismo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const devueltas = data.notes.returned ? (
    <button
      type="button"
      onClick={() => go('notes')}
      className="w-full flex items-center gap-2.5 rounded-lg bg-accent-tint px-3 py-2 text-left cursor-pointer hover:opacity-90 min-h-11 md:min-h-0"
    >
      <span className="text-[#8a4400] shrink-0">{hi('pencil', { w: 15 })}</span>
      <span className="flex-1 min-w-0 text-[11px] font-semibold text-[#8a4400]">
        {t.mine_returned_fix.replace('{n}', nf(data.notes.returned))}
      </span>
      <span className="text-[#8a4400]">→</span>
    </button>
  ) : null;

  const segmentado = (
    <div className="flex bg-surface-2 rounded-[7px] p-0.5">
      {(['project', 'machine'] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => setTab(k)}
          aria-pressed={tab === k}
          className={`px-3 py-1.5 rounded-[5px] text-[11px] cursor-pointer min-h-8 ${
            tab === k ? 'bg-surface font-semibold shadow-card' : 'text-muted-foreground font-medium'
          }`}
        >
          {k === 'project' ? t.mine_tab_project : t.mine_tab_machine}
        </button>
      ))}
    </div>
  );

  const filasProyecto = data.projects.map((p) => (
    <div key={p.projectId} className="flex items-start gap-3 px-4 py-2.5 border-b border-surface-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold truncate">{p.name}</div>
        <div className="text-[10.5px] text-muted-foreground font-mono mt-0.5">
          {/* El cliente solo si no repite el nombre: en 5 de 7 filas era el mismo texto dos veces. */}
          {mismo(p.clientName, p.name) ? '' : `${p.clientName} · `}
          {p.firstDate} → {p.lastDate}
        </div>
      </div>
      <Puntos n={p.days} />
      <div className="w-11 text-right font-mono font-bold text-[13px] shrink-0">
        {nf(p.days)}
        <span className="font-normal text-[10px] text-muted-foreground"> d</span>
      </div>
    </div>
  ));

  const filasMaquina = data.machines.length ? (
    <>
      {data.machines.map((m) => (
        <div key={m.orderId} className="flex items-start gap-3 px-4 py-2.5 border-b border-surface-2 last:border-b-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {/* La commessa es como se nombra la máquina en obra: es lo que la identifica. */}
              {m.commessaShort ? (
                <span className="font-mono text-[11px] font-medium text-white bg-primary rounded px-1.5 py-0.5 shrink-0">
                  {m.commessaShort}
                </span>
              ) : null}
              <span className="text-[12.5px] font-semibold leading-snug [text-wrap:pretty]">{m.label}</span>
            </div>
            <div className="text-[10.5px] text-muted-foreground mt-0.5">{m.projectName}</div>
          </div>
          <Puntos n={m.days} />
          <div className="w-11 text-right font-mono font-bold text-[13px] shrink-0">
            {nf(m.days)}
            <span className="font-normal text-[10px] text-muted-foreground"> d</span>
          </div>
        </div>
      ))}
      {sinMaquina > 0 ? (
        <div className="px-4 py-2.5 text-[10.5px] text-muted-foreground leading-relaxed">
          {t.mine_with_machine
            .replace('{a}', nf(data.daysWithMachine))
            .replace('{b}', nf(u.productive))
            .replace('{c}', nf(sinMaquina))}
        </div>
      ) : null}
    </>
  ) : (
    <div className="px-4 py-3 text-[11.5px] text-muted-foreground">{t.mine_no_machines}</div>
  );

  const conceptos = (
    <Card className="md:w-[266px] md:flex-none">
      <div className="p-4">
        <div className="text-[12px] font-bold">{t.mine_by_concept}</div>
        <div className="flex h-3.5 rounded overflow-hidden mt-3" role="presentation">
          {data.concepts.map((c) => (
            <div
              key={c.code}
              title={`${c.code} · ${nf(c.days)}`}
              style={{ width: `${(c.days / data.totalDays) * 100}%`, background: CONCEPT_COLOR[c.code] ?? 'var(--steel)' }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 mt-3">
          {data.concepts.map((c) => (
            <div key={c.code} className="flex items-center gap-2 text-[11.5px]">
              <span
                className="font-mono text-[10px] font-medium text-white rounded px-1.5 py-0.5 min-w-[38px] text-center"
                style={{ background: CONCEPT_COLOR[c.code] ?? 'var(--steel)' }}
              >
                {c.code}
              </span>
              <span className="flex-1 min-w-0 text-muted-foreground truncate">{etiqueta(c)}</span>
              <span className="font-mono text-muted-foreground tabular-nums">{nf(c.days)}</span>
              <span className="font-mono font-bold tabular-nums w-8 text-right">{Math.round((c.days / data.totalDays) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-muted-foreground">{anio ? t.mine_sub : t.mine_sub_all}</div>
        {anios}
      </div>

      {/* ESCRITORIO: las tres cifras en una fila (6a). */}
      <div className="hidden md:flex gap-3">
        <Card className="flex-[1.35]">
          <div className="p-4 flex items-center gap-3.5">
            <Gauge u={u} />
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold">{t.mine_util_title}</div>
              <div className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
                {u.pct === null
                  ? t.mine_util_none
                  : t.mine_util_body.replace('{p}', nf(u.productive)).replace('{d}', nf(u.denominator))}
              </div>
              {restantes > 0 ? (
                <div className="text-[10.5px] text-muted-foreground mt-1.5">{t.mine_rest.replace('{n}', nf(restantes))}</div>
              ) : null}
            </div>
          </div>
        </Card>
        <Card className="flex-1">
          <div className="p-4 h-full flex flex-col justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              {svg(ICON.cal, { w: 15 })}
              <span className="text-[10.5px] font-semibold">{t.mine_days}</span>
            </div>
            <div className="text-[34px] font-bold font-cond leading-none mt-2">{nf(data.totalDays)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{t.mine_in_projects.replace('{n}', nf(data.projectCount))}</div>
          </div>
        </Card>
        <Card className="flex-[1.15]">
          <div className="p-4 h-full flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground">
              {hi('check', { w: 15 })}
              <span className="text-[10.5px] font-semibold">{t.mine_notes_ok}</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-[34px] font-bold font-cond leading-none text-ok">{nf(data.notes.approved)}</span>
              <span className="text-[11px] text-muted-foreground">{t.st_approved.toLowerCase()}</span>
            </div>
            <div className="mt-auto pt-2">
              {devueltas ?? (
                <div className="text-[10.5px] text-muted-foreground">{t.mine_sent_n.replace('{n}', nf(data.notes.submitted))}</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* MÓVIL: la cabecera navy del teléfono (6b). */}
      <div className="md:hidden rounded-card bg-nav text-nav-ink p-4 -mx-0.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10.5px] uppercase tracking-[.08em] text-[#ffab5c]">{t.t_mine}</div>
            <div className="text-[20px] font-bold font-cond mt-0.5">{anio ?? t.grid_all_years}</div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold font-cond text-[#ffab5c]">{u.pct === null ? '—' : `${Math.round(u.pct)}%`}</span>
            <span className="text-[10px] text-nav-ink-2">{t.mine_util.split(' ').pop()}</span>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {(
            [
              [t.mine_days, nf(data.totalDays), ''],
              [t.mine_projects, nf(data.projectCount), ''],
              [t.st_approved, nf(data.notes.approved), 'text-[#7fd7a4]'],
            ] as [string, string, string][]
          ).map(([l, v, cls]) => (
            <span key={l} className="flex-1 bg-nav-2 rounded-lg px-2.5 py-2">
              <span className="block text-[9.5px] text-nav-ink-2">{l}</span>
              <span className={`block text-[17px] font-bold font-cond ${cls}`}>{v}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="md:hidden">{devueltas}</div>

      <Anio data={data} lang={state.lang} t={t} />

      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        {conceptos}
        <Card className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <div className="text-[12px] font-bold">{t.mine_where}</div>
            {segmentado}
          </div>
          <div className="max-h-[420px] overflow-y-auto">{tab === 'project' ? filasProyecto : filasMaquina}</div>
        </Card>
      </div>
    </div>
  );
}
