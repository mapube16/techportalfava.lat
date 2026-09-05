import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, initials } from '../ui';
import { CONCEPT_COLOR } from '../i18n';
import { hi } from '../icons';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getLiquidacion, liquidacionXlsx } from '../lib/api/liquidacion';
import { hoyLocal } from '../lib/fecha';
import type { EstadoFila, FilaLiquidacion, Modo } from '../lib/api/liquidacion';
import type { Dict } from '../i18n';

/**
 * Liquidación del mes — la vista del día 25 (diseño 5a/5b/5c).
 *
 * Una fila por técnico, una columna por concepto, solo días APROBADOS. La columna de
 * estado es la razón de ser: el problema del 25 no es sumar, es saber a quién le
 * falta algo para cerrar. Ni un importe: cantidades, Andrea multiplica.
 *
 * El corte (26 → 25) es el modo por defecto y se imprime explícito bajo el selector,
 * porque es lo que más confunde. El mes calendario queda como alternativa: la regla
 * del corte no está confirmada por FAVA (ver `liquidacion.service.ts`).
 *
 * En móvil no es una tabla: una tarjeta por técnico con su total y su estado, y los
 * conceptos plegados en un `<details>` nativo. Andrea consulta desde el teléfono, no
 * edita.
 */

/** El periodo del mes de hoy, 'YYYY-MM'. Sobre el string, sin `Date`. */
const mesDeHoy = () => hoyLocal().slice(0, 7);

/** El mes largo del selector, en el idioma de la interfaz. */
const mesLargo = (period: string, lang: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString(
    lang === 'it' ? 'it-IT' : lang === 'pt' ? 'pt-BR' : 'es-CL',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );

/** «26 jul – 25 ago 2026»: el rango del corte, en palabras. */
const rango = (from: string, to: string, lang: string) => {
  const loc = lang === 'it' ? 'it-IT' : lang === 'pt' ? 'pt-BR' : 'es-CL';
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f(from)} – ${f(to)} ${to.slice(0, 4)}`;
};

/** Texto y colores del estado. Tailwind no compone clases en runtime: van enteras. */
function estado(s: EstadoFila, t: Dict): { texto: string; cls: string } {
  switch (s.kind) {
    case 'ready':
      return { texto: t.pr_ready, cls: 'bg-ok-tint text-ok' };
    case 'unapproved':
      return { texto: t.pr_unapproved.replace('{n}', String(s.n)), cls: 'bg-[#fdf3d9] text-[#8a5406]' };
    case 'unsent':
      return { texto: t.pr_unsent.replace('{n}', String(s.n)), cls: 'bg-warn-tint text-warn' };
    default:
      return { texto: t.pr_none, cls: 'bg-draft-tint text-draft' };
  }
}

export default function Payroll() {
  const { state, t, go, patch, showToast } = useApp();
  const [period, setPeriod] = useState(mesDeHoy());
  const [mode, setMode] = useState<Modo>('cut');
  const [bajando, setBajando] = useState(false);

  const { data, error } = useApiData(() => getLiquidacion(period, mode), [period, mode, state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const tipo = (e: string) => (e === 'EXTERNO' ? t.pr_external : t.pr_internal);
  /** Lo que entraria al aprobar, sumado: se ensena bajo el total ademas de por celda. */
  const pendientes = (r: FilaLiquidacion) => Object.values(r.cells).reduce((s, c) => s + c.pending, 0);
  const etiqueta = (c: { labelEs: string; labelIt: string }) => (state.lang === 'it' ? c.labelIt : c.labelEs);

  /** Descarga con nombre: `window.open` de un blob no lo tiene, y el archivo se reenvía. */
  const exportar = () => {
    setBajando(true);
    liquidacionXlsx(period, mode)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `liquidacion-${period}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .catch((e: unknown) => {
        showToast('error');
        console.error(codigo(e));
      })
      .finally(() => setBajando(false));
  };

  /** Clic en un estado: lleva a donde se resuelve. */
  const irA = (r: FilaLiquidacion) => {
    if (r.state.kind === 'unapproved') {
      patch({ search: r.name });
      go('inbox');
    } else if (r.state.kind === 'unsent') {
      patch({ search: r.name });
      go('techs');
    }
  };

  const tiles: [string, number, string][] = [
    [t.pr_tile_techs, data.summary.tecnicos, ''],
    [t.pr_tile_ready, data.summary.listos, 'text-ok'],
    [t.pr_tile_pending, data.summary.pendientes, 'text-[#8a5406]'],
    [t.pr_tile_days, data.summary.dias, 'text-primary'],
  ];

  const cols = `196px repeat(${data.concepts.length},38px) 52px 152px`;

  return (
    <div className="flex flex-col gap-3.5">
      {/* CABECERA: el periodo, con el corte explícito, y la exportación. */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-semibold text-muted-foreground mb-1">{t.pr_period}</div>
            {/* `<input type="month">`: el selector nativo sabe de meses y no hay que
                dibujar un desplegable. En Safari cae a texto 'YYYY-MM', que también vale. */}
            <input
              type="month"
              value={period}
              max={mesDeHoy()}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-card text-sm font-medium capitalize"
              aria-label={mesLargo(period, state.lang)}
            />
          </div>
          <div className="flex gap-1.5">
            {(['cut', 'calendar'] as Modo[]).map((m) => (
              <Button key={m} variant={mode === m ? 'default' : 'outline'} size="sm" onClick={() => setMode(m)}>
                {m === 'cut' ? t.pr_mode_cut : t.pr_mode_cal}
              </Button>
            ))}
          </div>
          <div className="font-mono text-[11px] text-accent-brand pb-2">
            {mode === 'cut' ? t.pr_cut_label : t.pr_cal_label} {rango(data.from, data.to, state.lang)}
          </div>
        </div>
        <Button variant="outline" onClick={exportar} disabled={bajando || !data.rows.length}>
          {hi('download', { w: 15 })}
          {t.pr_export}
        </Button>
      </div>

      {/* LAS CUATRO CIFRAS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {tiles.map(([label, n, cls]) => (
          <Card key={label}>
            <div className="px-3.5 py-3">
              <div className="text-[10.5px] font-medium text-muted-foreground">{label}</div>
              <div className={`text-[24px] font-bold font-cond leading-tight mt-1 ${cls}`}>{n}</div>
            </div>
          </Card>
        ))}
      </div>

      {!data.rows.length ? (
        <Card>
          <div className="p-6 text-center">
            <div className="text-[14px] font-bold">{t.pr_empty_title}</div>
            <div className="text-[12.5px] text-muted-foreground mt-1">{t.pr_empty_body}</div>
          </div>
        </Card>
      ) : (
        <>
          {/* ESCRITORIO: la tabla del artboard 5a. Rejilla y no <table> para poder
              fijar anchos por columna y apilar el «+N» bajo la cifra sin celdas extra. */}
          <Card className="hidden md:block overflow-x-auto">
            <div
              className="grid items-end px-3.5 py-2.5 bg-surface-2 border-b border-border text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground"
              style={{ gridTemplateColumns: cols }}
            >
              <div>{t.col_tech}</div>
              {data.concepts.map((c) => (
                <div key={c.code} className="flex flex-col items-center gap-1" title={etiqueta(c)}>
                  <span className="w-4 h-[3px] rounded-sm" style={{ background: CONCEPT_COLOR[c.code] ?? 'var(--steel)' }} />
                  <span className="font-mono font-medium normal-case tracking-normal" style={{ color: CONCEPT_COLOR[c.code] }}>
                    {c.code}
                  </span>
                </div>
              ))}
              <div className="text-right">{t.pr_total}</div>
              <div className="pl-3.5">{t.col_status}</div>
            </div>

            {data.rows.map((r) => {
              const e = estado(r.state, t);
              const clicable = r.state.kind === 'unapproved' || r.state.kind === 'unsent';
              return (
                <div
                  key={r.technicianId}
                  className={`grid items-center h-10 px-3.5 border-b border-surface-2 ${
                    r.state.kind === 'none' ? 'opacity-60' : ''
                  }`}
                  style={{ gridTemplateColumns: cols }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-6 shrink-0 rounded-full bg-primary-tint text-primary grid place-items-center text-[9.5px] font-bold">
                      {initials(r.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium truncate">{r.name}</span>
                      <span className="block text-[9.5px] text-muted-foreground">{tipo(r.employmentType)}</span>
                    </span>
                  </div>
                  {data.concepts.map((c) => {
                    const cell = r.cells[c.code];
                    return (
                      <div key={c.code} className="text-center">
                        <span
                          className={`font-mono text-[12px] ${
                            cell.approved === null
                              ? 'text-line-2'
                              : cell.approved
                                ? 'font-semibold'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {cell.approved === null ? '—' : cell.approved}
                        </span>
                        {/* Lo que entraría al aprobar, atenuado y aparte: no ensucia la
                            cifra pagable. */}
                        {cell.pending ? (
                          <span className="block font-mono text-[9px] text-[#8a5406] -mt-0.5">+{cell.pending}</span>
                        ) : null}
                      </div>
                    );
                  })}
                  {/* El total tambien lleva su «+N»: un 0 a secas con seis dias esperando
                      aprobacion se leia como «esta persona no tiene nada». */}
                  <div className="text-right">
                    <span className="font-mono font-bold text-[13px]">{r.total}</span>
                    {pendientes(r) ? (
                      <span className="block font-mono text-[9px] text-[#8a5406] -mt-0.5">+{pendientes(r)}</span>
                    ) : null}
                  </div>
                  <div className="pl-3.5">
                    <button
                      type="button"
                      onClick={() => irA(r)}
                      disabled={!clicable}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${e.cls} ${
                        clicable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                      }`}
                    >
                      {e.texto}
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* MÓVIL: una tarjeta por técnico (artboard 5c). */}
          <div className="md:hidden flex flex-col gap-2.5">
            {data.rows.map((r) => {
              const e = estado(r.state, t);
              return (
                <Card key={r.technicianId}>
                  <details className="group">
                    <summary className="list-none cursor-pointer p-3.5 flex items-center gap-3 min-h-11">
                      <span className="size-8 shrink-0 rounded-full bg-primary-tint text-primary grid place-items-center text-[11px] font-bold">
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold truncate">{r.name}</span>
                        <span className="block text-[10.5px] text-muted-foreground">{tipo(r.employmentType)}</span>
                        <span className={`inline-flex mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${e.cls}`}>{e.texto}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono font-bold text-[20px] font-cond leading-none">{r.total}</span>
                        {pendientes(r) ? (
                          <span className="block font-mono text-[10px] text-[#8a5406]">+{pendientes(r)}</span>
                        ) : null}
                      </span>
                    </summary>
                    <div className="px-3.5 pb-3.5 flex flex-wrap gap-1.5 border-t border-border pt-3">
                      {data.concepts
                        .filter((c) => r.cells[c.code].approved !== null)
                        .map((c) => (
                          <span
                            key={c.code}
                            className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px]"
                          >
                            <span className="font-mono font-semibold" style={{ color: CONCEPT_COLOR[c.code] }}>
                              {c.code}
                            </span>
                            <span className="font-mono">{r.cells[c.code].approved}</span>
                            {r.cells[c.code].pending ? (
                              <span className="font-mono text-[9.5px] text-[#8a5406]">+{r.cells[c.code].pending}</span>
                            ) : null}
                          </span>
                        ))}
                    </div>
                  </details>
                </Card>
              );
            })}
          </div>

          {/* LEYENDA y la regla de las celdas «—», dicha en pantalla. */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-0.5">
            {data.concepts.map((c) => (
              <span key={c.code} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-2 h-2 rounded-sm" style={{ background: CONCEPT_COLOR[c.code] ?? 'var(--steel)' }} />
                <span className="font-mono text-foreground">{c.code}</span>
                {etiqueta(c)}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed px-0.5">{t.pr_dash_note}</div>
        </>
      )}
    </div>
  );
}
