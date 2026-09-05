import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiState, ConceptCode as ConceptChip, Empty, mesCorto, nf } from '../ui';
import { CONCEPT_COLOR } from '../i18n';
import { svg, ICON, hi } from '../icons';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { getMisKpis } from '../lib/api/misKpis';
import type { Dict } from '../i18n';
import type { Lang } from '../types';
import type { MiMaquina, MiMes, MiProyecto, MiUtilizacion, MisKpis } from '../lib/api/misKpis';

/**
 * «Mi resumen» — lo que el técnico produjo, devuelto a él (diseño 2a, móvil).
 *
 * Hasta aquí el técnico registraba días y toda la inteligencia que generaba se la
 * quedaba el administrador. Esta pantalla cierra ese desequilibrio con la pregunta que
 * él sí se hace: cuánto llevo, en qué obras he estado, cómo se reparte mi año.
 *
 * LO QUE NO ESTÁ, y no por olvido: nada comercial (valor de contrato, vendido contra
 * ejecutado) y nada de otros técnicos. El servidor tampoco lo manda — ver
 * `mis-kpis.service.ts`. Es regla firme del producto.
 *
 * LA UTILIZACIÓN SÍ, pero solo la propia. Estuvo fuera por leerse como un juicio; lo
 * que la hacía juicio era compararse con otros, y aquí no hay nadie más. Es el mismo
 * número que ve el admin de esta persona (KPI-02), calculado con la misma regla.
 *
 * Los gráficos son SVG a mano y no la librería del tablero del admin: son tres trazos
 * (un arco, una línea, una barra) y el artboard también los dibuja así. Los colores
 * salen de los tokens del tema, así que siguen al modo oscuro sin más.
 */

/** Del ángulo (0° arriba, horario) al punto sobre el círculo. */
const punto = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};

/** Arco de `desde` a `hasta` grados. Para el gauge de 270° del artboard. */
const arco = (cx: number, cy: number, r: number, desde: number, hasta: number) => {
  const [x1, y1] = punto(cx, cy, r, desde);
  const [x2, y2] = punto(cx, cy, r, hasta);
  const grande = hasta - desde > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2}`;
};

/** El gauge de 270°: arranca a las 7 y media y termina a las 4 y media. */
function Gauge({ u, t }: { u: MiUtilizacion; t: Dict }) {
  const INI = -135;
  const fin = u.pct === null ? INI : INI + (270 * u.pct) / 100;
  return (
    <svg viewBox="0 0 168 168" width={116} height={116} className="shrink-0" role="img" aria-label={`${u.pct ?? '—'}%`}>
      <path d={arco(84, 84, 66, INI, 135)} fill="none" stroke="var(--surface-3)" strokeWidth={18} strokeLinecap="round" />
      {u.pct !== null && u.pct > 0 ? (
        <path d={arco(84, 84, 66, INI, fin)} fill="none" stroke="var(--accent)" strokeWidth={18} strokeLinecap="round" />
      ) : null}
      <text x={84} y={86} textAnchor="middle" className="font-cond" style={{ fontSize: 36, fontWeight: 700, fill: 'var(--text)' }}>
        {u.pct === null ? '—' : `${Math.round(u.pct)}%`}
      </text>
      <text x={84} y={108} textAnchor="middle" style={{ fontSize: 12, fill: 'var(--text-3)' }}>
        {t.mine_util}
      </text>
    </svg>
  );
}

/** La línea de días por mes, con su área. Ancho fluido: el viewBox manda. */
function Linea({ meses, lang }: { meses: MiMes[]; lang: Lang }) {
  const W = 520;
  const H = 150;
  const PAD = 12;
  const max = Math.max(...meses.map((m) => m.days), 1);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(meses.length - 1, 1);
  const y = (d: number) => H - 28 - (d / max) * (H - 48);
  const pts = meses.map((m, i) => [x(i), y(m.days)] as const);
  const linea = pts.map(([px, py], i) => `${i ? 'L' : 'M'} ${px} ${py}`).join(' ');
  const area = `${linea} L ${pts[pts.length - 1][0]} ${H - 28} L ${pts[0][0]} ${H - 28} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={110} className="overflow-visible mt-2">
      <defs>
        <linearGradient id="miFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#miFade)" />
      <path d={linea} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={3.5} fill="var(--surface)" stroke="var(--primary)" strokeWidth={2} />
      ))}
      {meses.map((m, i) => (
        <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 12, fill: 'var(--text-3)' }}>
          {mesCorto(Number(m.month.slice(5, 7)), lang)}
        </text>
      ))}
    </svg>
  );
}

export default function MyStats() {
  const { state, t, patch } = useApp();
  /** `null` = todo su histórico. Arranca en el año en curso, que es lo que se mira. */
  const [anio, setAnio] = useState<number | null>(new Date().getFullYear());

  const { data, error } = useApiData(() => getMisKpis(anio), [anio, state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  /**
   * Sin jornadas en el año elegido puede ser que el técnico sea nuevo, o que esté
   * mirando un año en el que no trabajó. Si tiene otros años se le dice, en vez de
   * dejarle un vacío que parece la aplicación rota.
   */
  if (!data.totalDays) {
    return (
      <div className="max-w-[820px] mx-auto flex flex-col gap-4">
        {data.years.length ? <Anios data={data} anio={anio} setAnio={setAnio} t={t} /> : null}
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
  const maxMaq = data.machines[0]?.days ?? 0;
  const maxProy = data.projects[0]?.days ?? 0;
  const etiqueta = (c: { labelEs: string; labelIt: string }) => (state.lang === 'it' ? c.labelIt : c.labelEs);

  const filaMaquina = (m: MiMaquina) => (
    <div key={m.orderId} className="px-4 py-3 border-t border-border first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">
            {m.label}
            {/* La commessa es como se nombra la máquina en obra: es lo que distingue
                dos PL 6000 del mismo proyecto. */}
            {m.commessaShort ? (
              <span className="ml-2 font-mono text-[11.5px] text-primary">{m.commessaShort}</span>
            ) : null}
          </div>
          <div className="text-[11.5px] text-muted-foreground truncate">{m.projectName}</div>
        </div>
        <div className="shrink-0 font-mono font-bold text-[15px] tabular-nums">
          {nf(m.days)} <span className="text-[11.5px] font-normal text-muted-foreground">{t.days_unit}</span>
        </div>
      </div>
      <Barra days={m.days} max={maxMaq} />
    </div>
  );

  const filaProyecto = (p: MiProyecto) => (
    <div key={p.projectId} className="px-4 py-3 border-t border-border first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">{p.name}</div>
          <div className="text-[11.5px] text-muted-foreground truncate">{p.clientName}</div>
        </div>
        <div className="shrink-0 font-mono font-bold text-[15px] tabular-nums">
          {nf(p.days)} <span className="text-[11.5px] font-normal text-muted-foreground">{t.days_unit}</span>
        </div>
      </div>
      {/* El periodo responde «¿cuánto llevo en esta obra?», que es media pregunta que
          hoy no se puede contestar sin abrir el Excel. */}
      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
        {p.firstDate} → {p.lastDate}
      </div>
      <Barra days={p.days} max={maxProy} />
    </div>
  );

  return (
    <div className="max-w-[820px] mx-auto flex flex-col gap-3.5">
      <Anios data={data} anio={anio} setAnio={setAnio} t={t} />

      {/* LA CABECERA: el gauge y su lectura en palabras. El número solo no dice
          nada; «54 de 64 días disponibles» sí. */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Gauge u={u} t={t} />
          <div className="min-w-0">
            <div className="text-[13px] font-bold">
              {t.mine_util_title} · {anio ?? t.mine_util_all}
            </div>
            <div className="text-[12px] text-muted-foreground leading-relaxed mt-1">
              {u.pct === null
                ? t.mine_util_none
                : t.mine_util_body.replace('{p}', nf(u.productive)).replace('{d}', nf(u.denominator))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LAS DOS CIFRAS del artboard: cuánto llevo, y cómo van mis notas. */}
      <div className="grid grid-cols-2 gap-3.5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              {svg(ICON.cal, { w: 15 })}
              <span className="text-[10.5px] font-semibold">{t.mine_days}</span>
            </div>
            <div className="text-[26px] font-bold font-cond leading-tight mt-1.5">{nf(data.totalDays)}</div>
            <div className="text-[10.5px] text-muted-foreground">
              {t.mine_in_projects.replace('{n}', nf(data.projectCount))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              {hi('check', { w: 15 })}
              <span className="text-[10.5px] font-semibold">{t.mine_notes_ok}</span>
            </div>
            <div className="text-[26px] font-bold font-cond leading-tight mt-1.5 text-ok">
              {nf(data.notes.approved)}
            </div>
            {/* Las devueltas son lo único sobre lo que hay que hacer algo: si las hay,
                van aquí y en naranja; si no, cuántas esperan aprobación. */}
            <div className={`text-[10.5px] ${data.notes.returned ? 'text-warn font-semibold' : 'text-muted-foreground'}`}>
              {data.notes.returned
                ? t.mine_returned_n.replace('{n}', nf(data.notes.returned))
                : t.mine_sent_n.replace('{n}', nf(data.notes.submitted))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-[12px] font-bold">{t.mine_by_month}</div>
          {data.months.length >= 2 ? (
            <Linea meses={data.months} lang={state.lang} />
          ) : (
            <div className="text-[11.5px] text-muted-foreground mt-2">{t.mine_by_month_few}</div>
          )}
        </CardContent>
      </Card>

      {/* LA MEZCLA: la barra da la proporción de un vistazo, la lista el dato exacto. */}
      <Card>
        <CardContent className="p-4">
          <div className="text-[12px] font-bold">{t.mine_by_concept}</div>
          <div className="flex h-3.5 rounded overflow-hidden mt-3" role="presentation">
            {data.concepts.map((c) => (
              // Ancho y color son datos (porcentaje calculado, color del catálogo):
              // ninguno de los dos puede ser una clase de Tailwind.
              <div
                key={c.code}
                title={`${c.code} · ${nf(c.days)}`}
                style={{
                  width: `${(c.days / data.totalDays) * 100}%`,
                  background: CONCEPT_COLOR[c.code] ?? 'var(--steel)',
                }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1.5 mt-3">
            {data.concepts.map((c) => (
              <div key={c.code} className="flex items-center gap-2.5 text-[12px]">
                <ConceptChip code={c.code} />
                <span className="flex-1 min-w-0 text-muted-foreground truncate">{etiqueta(c)}</span>
                <span className="font-mono text-muted-foreground tabular-nums">{nf(c.days)}</span>
                <span className="font-mono font-semibold tabular-nums w-11 text-right">
                  {Math.round((c.days / data.totalDays) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.machines.length ? (
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.mine_by_machine}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">{data.machines.map(filaMaquina)}</CardContent>
        </Card>
      ) : null}

      {data.projects.length ? (
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.mine_by_project}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">{data.projects.map(filaProyecto)}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** La barra de proporción de una fila. El ancho es un dato, así que va en `style`. */
function Barra({ days, max }: { days: number; max: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
      <div className="h-full rounded-full bg-primary" style={{ width: `${max ? (days / max) * 100 : 0}%` }} />
    </div>
  );
}

/**
 * El selector de año. Pastillas y no un desplegable: son pocos años y el activo se ve
 * de un vistazo — el mismo lenguaje que `FiltroVigencia` y los filtros de la bandeja.
 *
 * Es el ÚNICO filtro de la pantalla a propósito. El administrador necesita filtros
 * porque mira 443 notas de 16 personas; el técnico mira las suyas, y cada control de
 * más es una razón para no abrir la aplicación.
 */
function Anios({
  data, anio, setAnio, t,
}: {
  data: { years: number[] };
  anio: number | null;
  setAnio: (v: number | null) => void;
  t: Dict;
}) {
  if (!data.years.length) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {data.years.map((a) => (
        <Button
          key={a}
          variant={anio === a ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAnio(a)}
          className="min-h-11 md:min-h-8"
        >
          {a}
        </Button>
      ))}
      <Button
        variant={anio === null ? 'default' : 'outline'}
        size="sm"
        onClick={() => setAnio(null)}
        className="min-h-11 md:min-h-8"
      >
        {t.grid_all_years}
      </Button>
    </div>
  );
}

export type { MisKpis };
