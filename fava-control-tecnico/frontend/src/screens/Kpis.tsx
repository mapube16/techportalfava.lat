import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ApiState, Ayuda, FiltroVigencia, nf, porVigencia, td, th } from '../ui';
import type { Vigencia } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { useApiData } from '../lib/api/useApiData';
import { getSoldVsExecuted, getUtilization } from '../lib/api/kpis';
import type { SoldProject } from '../lib/api/kpis';
import DayGrid from '../components/DayGrid';
import UtilizationCard from '../components/UtilizationCard';
import type { KpiSeg } from '../state';

/**
 * Los tableros, contra datos REALES. Hasta el 2026-08-28 media pantalla eran cifras
 * inventadas con nombres de proyectos que no existen («Barilla USA — Ames»), y eso es
 * peor que no tener grafica: un usuario no distingue una barra falsa de una verdadera.
 *
 * Dos origenes, los dos ya existentes:
 *   · `GET /api/kpis/sold-vs-executed`  vendido contra ejecutado por proyecto (KPI-01/08)
 *   · `GET /api/kpis/utilization`       el segmento por tecnico (KPI-02)
 *
 * LA ASIMETRIA DE LA FASE, que hay que conocer para leer el grafico: el VENDIDO tiene
 * fase porque el Excel la trae en los bloques del contrato; el EJECUTADO casi nunca,
 * porque la hoja diaria no la registra. Esas jornadas salen como «sin fase» en vez de
 * repartirse a ojo. El total por proyecto si es fiable, que es lo que se negocia.
 */
type Fase = 'MONTAJE' | 'COLLAUDO';
const FASES: Fase[] = ['MONTAJE', 'COLLAUDO'];
/** Horas de una jornada estandar, para el grafico de horas. */
const STD = 8;

type Medida = 'sold' | 'executed';
const porFase = (p: SoldProject, k: Medida, ph: Fase) =>
  p.rows.filter((r) => r.phase === ph).reduce((a, r) => a + r[k], 0);

function palette() {
  const el = document.querySelector('.fava');
  const cs = el ? getComputedStyle(el) : null;
  const g = (n: string) => (cs ? cs.getPropertyValue(n).trim() : '');
  return {
    primary: g('--primary'), accent: g('--accent'), ok: g('--ok'), warn: g('--warn'), info: g('--info'),
    text: g('--text'), text2: g('--text-2'), text3: g('--text-3'), border: g('--border'),
    surface: g('--surface'), s3: g('--surface-3'),
  };
}

export default function Kpis() {
  const { state, t, patch } = useApp();
  const movil = useIsMobile();
  const mainRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const rolesRef = useRef<HTMLDivElement>(null);
  const charts = useRef<Record<string, echarts.ECharts>>({});

  // El anio lo elige la cuadricula (KPI-07) mas abajo; aqui se mira todo el historico.
  const { data: vendido, error: errV } = useApiData(() => getSoldVsExecuted(null), [state.dataVersion]);
  const { data: util, error: errU } = useApiData(() => getUtilization(null), [state.dataVersion]);

  /**
   * Por defecto SOLO los proyectos vigentes, igual que en Proyectos y Técnicos.
   *
   * De 23 proyectos hay 5 activos: sin filtrar, las barras las dominaba obra terminada
   * hace meses y el tablero respondía a una pregunta que nadie hace. El contador de las
   * pastillas dice cuántos quedan fuera, que es lo que evita que parezca que faltan datos.
   *
   * Afecta a las cuatro tarjetas y a las gráficas de vendido/ejecutado. NO toca la
   * cuadrícula ni la utilización: esas se agregan por técnico, no por proyecto, y las
   * filtra su propio año.
   */
  const [vigencia, setVigencia] = useState<Vigencia>('activos');
  const projects = porVigencia(vendido ?? [], vigencia);
  const per = projects.map((p) => ({ sold: p.sold, done: p.executed, nh: p.normalHours ?? 0 }));
  const tot = per.reduce(
    (a: { sold: number; done: number; nh: number; exec: number }, p) =>
      ({ sold: a.sold + p.sold, done: a.done + p.done, nh: a.nh + p.nh, exec: a.exec + p.done * STD }),
    { sold: 0, done: 0, nh: 0, exec: 0 },
  );
  /**
   * Sin horas de contrato NO hay sobretiempo que calcular. Con `tot.nh` a 0 esta resta
   * daba que todas las horas ejecutadas eran extra, y la tarjeta anunciaba «+43.264
   * horas extra» con toda la seriedad del mundo. Un cero no es un contrato de cero horas.
   */
  const overtime = tot.nh ? Math.max(0, tot.exec - tot.nh) : 0;
  // `act` sigue alimentando las gráficas mock de abajo; el promedio de utilización que
  // salía de aquí murió con la tarjeta que lo mostraba: ahora lo calcula el servidor.
  // El segmento por tecnico sale de la utilizacion, que ya calcula el servidor: dias
  // productivos y porcentaje. Antes eran cinco nombres inventados.
  const act = (util?.technicians ?? []).map((x) => ({
    n: x.technicianName,
    util: x.utilizationPct ?? 0,
    dias: x.productive,
  }));
  const avgProg = tot.sold ? Math.round((tot.done / tot.sold) * 100) : 0;

  useEffect(() => {
    const getC = (key: string, node: HTMLDivElement | null) => {
      if (!node) return null;
      let c = charts.current[key];
      if (c && !c.isDisposed() && c.getDom() === node) return c;
      if (c && !c.isDisposed()) c.dispose();
      c = echarts.init(node);
      charts.current[key] = c;
      return c;
    };

    const P = palette();
    const grid = { left: 46, right: 18, top: 34, bottom: 52 };
    const axisText = { color: P.text3, fontSize: 11, fontFamily: 'Roboto' };
    const splitLine = { lineStyle: { color: P.border, type: 'dashed' } };
    const base = (): Record<string, unknown> => ({
      textStyle: { fontFamily: 'Roboto' },
      tooltip: { trigger: 'axis', backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, textStyle: { color: P.text, fontSize: 12 }, axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: P.text2, fontSize: 12 }, top: 2, icon: 'roundRect', itemWidth: 12, itemHeight: 12 },
    });
    const catAxis = (data: string[]): Record<string, unknown> => ({
      type: 'category', data, axisTick: { show: false },
      axisLabel: { ...axisText, interval: 0, rotate: data.length > 3 ? 20 : 0, hideOverlap: true },
      axisLine: { lineStyle: { color: P.border } },
    });
    const valAxis = (name: string): Record<string, unknown> => ({
      type: 'value', name, nameTextStyle: { color: P.text3, fontSize: 10 }, axisLabel: axisText, splitLine,
    });
    const bar = (name: string, data: number[], color: string): Record<string, unknown> => ({
      name, type: 'bar', data, itemStyle: { color, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 26, emphasis: { focus: 'series' },
    });

    const main = getC('main', mainRef.current);
    if (main) {
      let opt: Record<string, unknown>;
      const seg = state.kpiSeg;
      if (seg === 'project') {
        const names = projects.map((p) => p.name.split(' —')[0]);
        opt = {
          ...base(), grid, xAxis: catAxis(names), yAxis: valAxis(t.days_unit),
          series: [bar(t.kpi_sold, projects.map((p) => p.sold), P.primary), bar(t.kpi_done, projects.map((p) => p.executed), P.accent)],
        };
      } else if (seg === 'tech') {
        const names = act.map((x) => x.n.split(' ')[0] + ' ' + (x.n.split(' ')[1] || '').charAt(0));
        const days = act.map((x) => x.dias);
        opt = {
          ...base(), grid: { ...grid, right: 46 }, xAxis: catAxis(names),
          yAxis: [valAxis(t.reg_days), { type: 'value', name: '%', min: 0, max: 100, axisLabel: { ...axisText, formatter: '{value}%' }, splitLine: { show: false } }],
          series: [
            { ...bar(t.reg_days, days, P.primary), barMaxWidth: 30 },
            { name: t.k_util_avg, type: 'line', yAxisIndex: 1, data: act.map((x) => x.util), smooth: true, symbol: 'circle', symbolSize: 8, itemStyle: { color: P.accent }, lineStyle: { color: P.accent, width: 2.6 } },
          ],
        };
      } else {
        const lbl = [t.montaje, t.colaudo];
        const sp = (k: Medida, ph: Fase) => projects.reduce((a, p) => a + porFase(p, k, ph), 0);
        opt = {
          ...base(), grid, xAxis: catAxis(lbl), yAxis: valAxis(t.days_unit),
          series: [
            { ...bar(t.kpi_sold, FASES.map((ph) => sp('sold', ph)), P.primary), barMaxWidth: 64 },
            { ...bar(t.kpi_done, FASES.map((ph) => sp('executed', ph)), P.accent), barMaxWidth: 64 },
          ],
        };
      }
      main.setOption(opt, true);
      main.resize();
    }

    const hrs = getC('hours', hoursRef.current);
    if (hrs) {
      /**
       * AVANCE POR PROYECTO, no las horas de contrato.
       *
       * Aquí había «horas normales vs. ejecutadas» y la serie azul era 0 en todas las
       * barras: de 23 proyectos hay UNO con `normal_hours`, y es el de demostración.
       * La naranja tampoco decía nada nuevo — días ejecutados × 8, la misma forma que
       * la gráfica de arriba con otra escala. Una comparación contra nada.
       *
       * El porcentaje sí se puede calcular con lo que hay, y es lo que no se veía en
       * ningún sitio: la tabla de fases da el delta en días absolutos, y con proyectos
       * de 168 y de 1.193 días vendidos esos números no se comparan entre sí. Barras
       * horizontales porque los nombres son largos y en vertical se rotan hasta ser
       * ilegibles, que es lo que pasaba en la captura.
       */
      const avance = projects
        // Sin vendido no hay denominador. Pintar 0% diría «no se ha avanzado» cuando lo
        // que falta es cargar la venta: es justo la clase de mentira que se quitó.
        .filter((p) => p.sold > 0)
        .map((p) => ({
          n: p.name.split(' —')[0],
          pct: Math.round((p.executed / p.sold) * 100),
          done: p.executed,
          sold: p.sold,
        }))
        .sort((a, b) => a.pct - b.pct);
      hrs.setOption(
        {
          ...base(),
          legend: { show: false },
          tooltip: {
            trigger: 'item',
            backgroundColor: P.surface, borderColor: P.border, borderWidth: 1,
            textStyle: { color: P.text, fontSize: 12 },
            formatter: (p: { dataIndex: number }) => {
              const r = avance[p.dataIndex];
              return `${r.n}<br/>${r.pct}% · ${r.done}/${r.sold} ${t.days_unit}`;
            },
          },
          // Sitio a la izquierda para el nombre del proyecto, que ahora va horizontal.
          grid: { left: 150, right: 40, top: 18, bottom: 34 },
          xAxis: { ...valAxis('%'), axisLabel: { ...axisText, formatter: '{value}%' } },
          yAxis: {
            type: 'category',
            data: avance.map((r) => r.n),
            axisTick: { show: false },
            axisLine: { lineStyle: { color: P.border } },
            axisLabel: { ...axisText, width: 138, overflow: 'truncate' },
          },
          series: [
            {
              type: 'bar', barMaxWidth: 22,
              data: avance.map((r) => ({
                value: r.pct,
                // Pasarse de lo vendido es la única lectura que exige mirar: color propio.
                itemStyle: { color: r.pct > 100 ? P.warn : P.primary, borderRadius: [0, 3, 3, 0] },
              })),
              label: { show: true, position: 'right', color: P.text2, fontSize: 11, formatter: '{c}%' },
              markLine: {
                silent: true, symbol: 'none',
                lineStyle: { color: P.text3, type: 'dashed', width: 1 },
                label: { show: false },
                data: [{ xAxis: 100 }],
              },
            },
          ],
        },
        true,
      );
      hrs.resize();
    }

    const rls = getC('roles', rolesRef.current);
    if (rls) {
      // Los roles salen de los DATOS, no de una lista fija de tres: el catalogo real
      // tiene dieciocho y cual aparece depende de quien trabajo.
      const porRol = new Map<string, number>();
      for (const p of projects)
        for (const r of p.rows) porRol.set(r.role, (porRol.get(r.role) ?? 0) + r.executed);
      const paleta = [P.primary, P.accent, P.info, P.ok, P.warn];
      const data = [...porRol.entries()]
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value], i) => ({ name, value, itemStyle: { color: paleta[i % paleta.length] } }));
      rls.setOption(
        {
          textStyle: { fontFamily: 'Roboto' },
          tooltip: { trigger: 'item', backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, textStyle: { color: P.text }, formatter: '{b}: {c} ' + t.days_unit + ' ({d}%)' },
          legend: { bottom: 4, textStyle: { color: P.text2, fontSize: 12 }, icon: 'circle' },
          series: [{ type: 'pie', radius: ['46%', '72%'], center: ['50%', '44%'], avoidLabelOverlap: true, itemStyle: { borderColor: P.surface, borderWidth: 3 }, label: { show: true, color: P.text2, fontSize: 11, formatter: '{d}%' }, data }],
        },
        true,
      );
      rls.resize();
    }
  }, [state.kpiSeg, state.lang, state.theme, projects, act, movil, state.density]);

  useEffect(() => {
    const onResize = () => Object.values(charts.current).forEach((c) => { if (c && !c.isDisposed()) c.resize(); });
    window.addEventListener('resize', onResize);
    const registry = charts.current;
    return () => {
      window.removeEventListener('resize', onResize);
      Object.values(registry).forEach((c) => { if (c && !c.isDisposed()) c.dispose(); });
    };
  }, []);

  // El color es un dato (positivo/negativo/neutro), no una paleta finita: se queda en
  // `style` porque Tailwind no puede generar una clase por valor en tiempo de ejecución.
  /**
   * `ayuda` es la definicion del indicador. El modelo es UtilizationCard, que imprime
   * su regla en pantalla: un numero sin su definicion es un numero suelto — «Avance
   * global» no significa nada hasta saber que un proyecto grande pesa mas que uno
   * pequeño. Va en una burbuja propia (`Ayuda`), no en un `title`: aquel tarda un
   * segundo, sale minusculo y en el movil no existe.
   */
  const kcard = (label: string, val: string, sub: string, color?: string, ayuda?: string) => (
    <Card>
      <CardContent>
        <div className="text-[11.5px] text-muted-foreground font-semibold uppercase tracking-wide flex items-center gap-1.5">
          {label}
          {ayuda ? <Ayuda texto={ayuda} /> : null}
        </div>
        <div className="text-[27px] font-bold font-cond mt-1 leading-tight" style={{ color: color || 'var(--text)' }}>
          {val}
        </div>
        <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );

  /** La celda de un delta: verde si queda por ejecutar, aviso si se paso de lo vendido. */
  const celdaDelta = (v: number) => (
    <td className={`${td} text-center font-mono font-bold ${v < 0 ? 'text-warn' : 'text-ok'}`}>
      {(v > 0 ? '+' : '') + v}
    </td>
  );

  const chartTitle = { project: t.chart_main_project, tech: t.chart_main_tech, phase: t.chart_main_phase }[state.kpiSeg];
  const segBtn = (k: KpiSeg, l: string) => {
    const on = state.kpiSeg === k;
    return (
      <button
        key={k}
        onClick={() => patch({ kpiSeg: k })}
        className={`px-3 py-1.5 rounded-md text-[12.5px] font-semibold cursor-pointer transition-colors ${
          on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {l}
      </button>
    );
  };

  const phaseRows = projects.map((p) => {
    const mS = porFase(p, 'sold', 'MONTAJE'), mD = porFase(p, 'executed', 'MONTAJE');
    const cS = porFase(p, 'sold', 'COLLAUDO'), cD = porFase(p, 'executed', 'COLLAUDO');
    /**
     * UN DELTA POR FASE, no uno agregado.
     *
     * Habia uno solo —vendido total menos ejecutado total— y escondia justo lo que esta
     * tabla existe para enseñar: Lucchetti salia «+110» en verde, y por dentro son −2 de
     * montaje (se paso de lo vendido) y +112 de collaudo (sin empezar). Dos historias
     * opuestas fundidas en una cifra tranquilizadora, en una tabla que se titula «por
     * fase». Convencion: vendido − ejecutado, o sea lo que queda por ejecutar.
     */
    return { name: p.name, mS, mD, cS, cD, dM: mS - mD, dC: cS - cD };
  });

  const byPhase = movil ? (
    <Card className="p-0 gap-0 overflow-hidden">
      <CardHeader className="border-b p-4">
        <CardTitle>{t.by_phase}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex flex-col gap-2.5">
        {phaseRows.map((r) => {
          // El azul de MONTAJE y el naranja de MARCA de COLLAUDO son datos del dominio
          // (dos fases fijas), no una paleta que Tailwind pueda generar como clase.
          const pair = (lbl: string, sold: number, done: number, delta: number, color: string) => (
            <div className="flex-1 bg-muted border border-border rounded-lg px-2.5 py-2">
              <div className="text-[10.5px] font-bold tracking-wide uppercase" style={{ color }}>{lbl}</div>
              <div className="flex items-baseline gap-1.5 mt-1 font-mono">
                <span className="text-lg font-bold">{done}</span>
                <span className="text-xs text-muted-foreground">/ {sold}</span>
              </div>
              <div className={`font-mono text-[11.5px] font-bold ${delta < 0 ? 'text-warn' : 'text-ok'}`}>
                {(delta > 0 ? '+' : '') + delta}
              </div>
            </div>
          );
          return (
            <div key={r.name} className="border border-border rounded-card p-3">
              {/* Sin cifra agregada en la cabecera: era la que fundia las dos fases. */}
              <div className="text-[13.5px] font-bold mb-2.5">{r.name}</div>
              <div className="flex gap-2">
                {pair(t.montaje, r.mS, r.mD, r.dM, 'var(--primary)')}
                {pair(t.colaudo, r.cS, r.cD, r.dC, 'var(--accent)')}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  ) : (
    <Card className="p-0 gap-0 overflow-hidden">
      <CardHeader className="border-b p-4">
        <CardTitle>{t.by_phase}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {/* Agrupadas POR FASE (vendido, ejecutado, delta) y no todos los vendidos
                  seguidos: asi cada bloque de tres se lee como una frase. */}
              {[t.col_project,
                t.montaje + ' ' + t.kpi_sold, t.montaje + ' ' + t.kpi_done, 'Δ ' + t.montaje,
                t.colaudo + ' ' + t.kpi_sold, t.colaudo + ' ' + t.kpi_done, 'Δ ' + t.colaudo].map((c, i) => (
                <th key={i} className={`${th} ${i ? 'text-center' : 'text-left'}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phaseRows.map((r) => (
              <tr key={r.name} className="border-t border-border">
                <td className={`${td} font-semibold`}>{r.name}</td>
                <td className={`${td} text-center font-mono`}>{r.mS}</td>
                <td className={`${td} text-center font-mono`}>{r.mD}</td>
                {celdaDelta(r.dM)}
                <td className={`${td} text-center font-mono`}>{r.cS}</td>
                <td className={`${td} text-center font-mono`}>{r.cD}</td>
                {celdaDelta(r.dC)}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  // Va DESPUES de los hooks a proposito: adelantarlo saltaria los useEffect y React
  // se queja. Un fallo del API tiene que decirse; pintar ceros seria dar por bueno
  // un tablero vacio, que es justo lo que esta pantalla llevaba haciendo con el mock.
  if (errV || errU) return <ApiState error={errV ?? errU} label={t.err_load} />;
  if (!vendido || !util) return <ApiState error={null} label={t.loading} />;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI-07 y KPI-02 van PRIMERO y contra el API real. Lo de abajo sigue siendo el
          mock del prototipo (datos inventados): son KPI-01 y KPI-08, que necesitan la
          matriz de días VENDIDOS, y esa no se puede cargar hasta decidir el mapeo del
          vocabulario comercial del Excel (ver `prisma/migrate-ordenes.ts`). */}
      <DayGrid />

      {/* Sin año: todo el histórico, igual que la cuadrícula al abrir. */}
      <UtilizationCard year={null} />

      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-sm font-bold">{t.kpi_sold + ' / ' + t.kpi_done}</div>
        <FiltroVigencia valor={vigencia} onChange={setVigencia} items={vendido} t={t} />
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))' }}>
        {kcard(t.k_hours_norm, tot.nh ? nf(tot.nh) + ' h' : '—', t.of_contract, 'var(--info)', t.h_hours_norm)}
        {kcard(t.k_hours_exec, nf(tot.exec) + ' h', overtime > 0 ? '+' + nf(overtime) + ' ' + t.k_overtime.toLowerCase() : '—', 'var(--accent)', t.h_hours_exec)}
        {kcard(t.kpi_sold + ' / ' + t.kpi_done, tot.sold + ' / ' + tot.done, t.days_unit, 'var(--primary)', t.h_sold_done)}
        {kcard(t.k_progress, avgProg + '%', tot.done + ' / ' + tot.sold + ' ' + t.days_unit, avgProg >= 100 ? 'var(--ok)' : 'var(--text)', t.h_progress)}
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between px-4.5 py-3.5 border-b border-border flex-wrap gap-2.5">
          <div className="text-sm font-bold">{chartTitle}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t.seg_by}</span>
            <div className="flex bg-muted border border-border rounded-lg p-0.5">
              {segBtn('project', t.seg_project)}
              {segBtn('tech', t.seg_tech)}
              {segBtn('phase', t.seg_phase)}
            </div>
          </div>
        </div>
        <div ref={mainRef} className="h-[352px] w-full" />
      </Card>

      <div className={`grid gap-4 ${movil ? 'grid-cols-1' : 'grid-cols-[1.35fr_1fr]'}`}>
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.chart_hours}</CardTitle>
          </CardHeader>
          <div ref={hoursRef} className="h-[300px] w-full" />
        </Card>
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.chart_roles}</CardTitle>
          </CardHeader>
          <div ref={rolesRef} className="h-[300px] w-full" />
        </Card>
      </div>

      {byPhase}
    </div>
  );
}
