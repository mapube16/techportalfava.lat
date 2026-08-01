import { useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { ApiState, Card, CardHead, ConceptPill, StatusPill } from '../ui';
import { useApp } from '../state';
import SignatureBox from '../components/SignatureBox';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getWeek } from '../lib/api/dailyEntries';
import { submitWeek } from '../lib/api/weeklyNotes';
import type { Entry } from '../lib/api/dailyEntries';
import { diasDeSemana, hoyLocal, lunesDe, sumarDias } from '../lib/fecha';

/**
 * BIT-01 — la semana del técnico, contra el API real.
 *
 * La fecha va SIEMPRE como string 'YYYY-MM-DD'. El único `Date` que se crea aquí es el
 * de `hoyLocal()`, y sirve para saber en qué día está el DISPOSITIVO, no para escribir:
 * la regla del cliente es la contraria a la del servidor (ver `lib/fecha.ts`).
 */

/** El día del mes, para la columna izquierda. Sobre el string, sin `Date`. */
const diaDe = (iso: string) => Number(iso.slice(8, 10));

const MES_ES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_IT = ['', 'gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export default function Week() {
  const { state, t, go, patch, showToast } = useApp();
  const [hasSignature, setHasSignature] = useState(false);
  const [clearToken, setClearToken] = useState(0);
  /** Lunes de la semana visible. `null` = la de hoy, que se resuelve al renderizar. */
  const [lunes, setLunes] = useState<string | null>(null);
  const [errEnvio, setErrEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const clearSign = () => {
    setClearToken((v) => v + 1);
    setHasSignature(false);
  };

  const semana = lunes ?? lunesDe(hoyLocal());
  const dias = diasDeSemana(semana);

  const { data, error } = useApiData(() => getWeek(dias[0], dias[6]), [semana, state.dataVersion]);

  const mes = (iso: string) => (state.lang === 'it' ? MES_IT : MES_ES)[Number(iso.slice(5, 7))];
  const rotulo = `${diaDe(dias[0])} ${mes(dias[0])} – ${diaDe(dias[6])} ${mes(dias[6])} ${dias[6].slice(0, 4)}`;

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const porFecha = new Map(data.entries.map((e) => [e.date, e]));
  // Los límites los pone el SERVIDOR (con tolerancia de huso) y mandan sobre los del
  // cliente: navegar fuera traería una semana que después no se puede escribir.
  const atrasBloqueado = dias[0] <= data.minDate;
  const adelanteBloqueado = dias[6] >= data.maxDate;

  const mover = (n: number) => setLunes(sumarDias(semana, n * 7));

  /** El proyecto y la máquina salen de los DÍAS, no de una cabecera fija: en una misma
      semana puede haber dos proyectos, que es un caso real del Excel. */
  const registrados = dias.map((d) => porFecha.get(d)).filter(Boolean) as Entry[];
  const proyectos = [...new Set(registrados.map((e) => e.projectName).filter(Boolean))];
  const maquinas = [...new Set(registrados.map((e) => e.machineCode).filter(Boolean))];
  // Si toda la semana está en el mismo estado se muestra ése; si están mezclados es un
  // borrador en curso, y decir «aprobada» mentiría sobre los días que aún no lo están.
  const estados = new Set(registrados.map((e) => e.status));
  const estado = estados.size === 1 ? [...estados][0] : 'draft';

  const nav = (dir: -1 | 1, off: boolean) => (
    <Button
      variant="outline"
      size="icon"
      onClick={() => mover(dir)}
      disabled={off}
      aria-label={dir < 0 ? t.week_prev : t.week_next}
      className="size-11 md:size-9 shrink-0"
    >
      {dir < 0 ? '←' : '→'}
    </Button>
  );

  return (
    <div className="max-w-[820px] mx-auto flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between gap-2 px-4.5 py-3.5 border-b border-border flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            {nav(-1, atrasBloqueado)}
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">
                {proyectos.length ? proyectos.join(' · ') : t.week_no_project}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {t.week_of} {rotulo}
                {maquinas.length ? ` · ${maquinas.join(', ')}` : ''}
              </div>
            </div>
            {nav(1, adelanteBloqueado)}
          </div>
          <StatusPill st={estado as never} t={t} />
        </div>

        <div>
          {dias.map((fecha, i) => {
            const e = porFecha.get(fecha);
            return (
              <div
                key={fecha}
                onClick={() => patch({ logOpen: true, logDate: fecha })}
                className={`flex gap-3.5 p-row items-start cursor-pointer hover:bg-muted/50 transition-colors ${
                  i ? 'border-t border-border' : ''
                }`}
              >
                <div className="w-11 shrink-0">
                  <div className="text-[11px] text-muted-foreground font-semibold">{t.days[i]}</div>
                  <div className="text-base font-bold font-cond">{diaDe(fecha)}</div>
                </div>
                <div className="w-[150px] shrink-0">
                  {e?.conceptCode ? (
                    <ConceptPill code={e.conceptCode} lang={state.lang} />
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">{t.week_empty_day}</span>
                  )}
                </div>
                <div className="flex-1 text-[13px] text-muted-foreground leading-relaxed min-w-0">
                  {e?.description ?? ''}
                  {/* La commessa distingue dos máquinas IGUALES del mismo proyecto: sin
                      ella la fila no dice a cuál de las dos fue el día. */}
                  {e?.commessaShort ? (
                    <span className="ml-2 font-mono text-[11.5px] text-primary">{e.commessaShort}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHead
          title={t.expenses}
          right={
            <Button variant="secondary" size="sm" onClick={() => showToast('saved')} className="min-h-11 md:min-h-8">
              {hi('plus', { w: 14 })}
              {t.btn_addexp}
            </Button>
          }
        />
        <div>
          {state.expenses.map((e, i) => (
            <div key={i} className={`flex gap-3 p-row items-center ${i ? 'border-t border-border' : ''}`}>
              <div className="flex-1 text-[13.5px]">{e.desc}</div>
              <div className="text-[12.5px] text-muted-foreground w-[70px]">{e.date}</div>
              <div className="text-[13.5px] font-semibold font-mono">{e.val}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title={t.sign} />
        <div className="p-4.5">
          <p className="text-[12.5px] text-muted-foreground mb-3">{t.sign_hint}</p>
          <div className="relative border-2 border-dashed border-input rounded-lg bg-muted h-40 overflow-hidden">
            <SignatureBox onSigned={() => setHasSignature(true)} clearToken={clearToken} />
            {!hasSignature ? (
              <div className="absolute inset-0 flex gap-2 items-center justify-center pointer-events-none text-muted-foreground text-[13px]">
                {hi('pencil', { w: 17 })}
                {t.sign_here}
              </div>
            ) : null}
            <div className="absolute bottom-2.5 left-6 right-16 h-px bg-input pointer-events-none" />
          </div>
          <div className="flex justify-between items-center mt-2.5">
            <div className="text-[11.5px] text-muted-foreground">{hasSignature ? t.sign_captured : '—'}</div>
            <Button variant="outline" size="sm" onClick={clearSign} className="min-h-11 md:min-h-8">
              {t.btn_clear}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex gap-3 flex-wrap justify-end items-center">
        <div className="flex-1 text-xs text-muted-foreground min-w-[200px]">{t.gen_pdf_note}</div>
        <Button variant="outline" onClick={() => patch({ pdfOpen: true })} className="min-h-11 md:min-h-9">
          {hi('eye', { w: 15 })}
          {t.btn_pdf}
        </Button>
        {errEnvio ? (
          <div className="text-xs text-warn w-full text-right">
            {t.err_save}: {errEnvio}
          </div>
        ) : null}
        <Button
          onClick={() => {
            // NOTA-01: el servidor deriva UNA NOTA POR PROYECTO. El técnico no elige
            // ninguna, solo manda su semana.
            setErrEnvio(null);
            setEnviando(true);
            submitWeek(semana)
              .then(() => {
                showToast('submitted');
                go('notes');
              })
              .catch((e: unknown) => setErrEnvio(codigo(e)))
              .finally(() => setEnviando(false));
          }}
          disabled={enviando}
          className="min-h-11 md:min-h-9"
        >
          {t.btn_submit} →
        </Button>
      </div>
    </div>
  );
}
