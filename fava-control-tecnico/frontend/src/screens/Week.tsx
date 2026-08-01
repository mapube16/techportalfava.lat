import { useState } from 'react';
import { hi } from '../icons';
import { ApiState, Card, CardHead, ConceptPill, StatusPill, gbtn, pbtn, sbtn } from '../ui';
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
    <button
      onClick={() => mover(dir)}
      disabled={off}
      aria-label={dir < 0 ? t.week_prev : t.week_next}
      className={`${gbtn} px-3 ${off ? 'opacity-40 cursor-default' : ''}`}
    >
      {dir < 0 ? '←' : '→'}
    </button>
  );

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {nav(-1, atrasBloqueado)}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {proyectos.length ? proyectos.join(' · ') : t.week_no_project}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
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
                style={{ display: 'flex', gap: 14, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start', cursor: 'pointer' }}
              >
                <div style={{ width: 44, flex: 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{t.days[i]}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Roboto Condensed' }}>{diaDe(fecha)}</div>
                </div>
                <div style={{ flex: 'none', width: 150 }}>
                  {e?.conceptCode ? (
                    <ConceptPill code={e.conceptCode} lang={state.lang} />
                  ) : (
                    <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t.week_empty_day}</span>
                  )}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {e?.description ?? ''}
                  {/* La commessa distingue dos máquinas IGUALES del mismo proyecto: sin
                      ella la fila no dice a cuál de las dos fue el día. */}
                  {e?.commessaShort ? (
                    <span style={{ marginLeft: 8, fontFamily: 'Roboto Mono', fontSize: 11.5, color: 'var(--primary)' }}>
                      {e.commessaShort}
                    </span>
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
            <button onClick={() => showToast('saved')} className={sbtn}>
              {hi('plus', { w: 14 })}
              {t.btn_addexp}
            </button>
          }
        />
        <div>
          {state.expenses.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 13.5 }}>{e.desc}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', width: 70 }}>{e.date}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'Roboto Mono' }}>{e.val}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title={t.sign} />
        <div style={{ padding: 18 }}>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-2)' }}>{t.sign_hint}</p>
          <div style={{ position: 'relative', border: '2px dashed var(--border-2)', borderRadius: 10, background: 'var(--surface-2)', height: 160, overflow: 'hidden' }}>
            <SignatureBox onSigned={() => setHasSignature(true)} clearToken={clearToken} />
            {!hasSignature ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'var(--text-3)', fontSize: 13 }}>
                {hi('pencil', { w: 17 })}
                {t.sign_here}
              </div>
            ) : null}
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 40, height: 1, background: 'var(--border-2)', margin: '0 24px', pointerEvents: 'none' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{hasSignature ? t.sign_captured : '—'}</div>
            <button onClick={clearSign} className={gbtn}>{t.btn_clear}</button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-3)', minWidth: 200 }}>{t.gen_pdf_note}</div>
        <button onClick={() => patch({ pdfOpen: true })} className={gbtn}>
          {hi('eye', { w: 15 })}
          {t.btn_pdf}
        </button>
        {errEnvio ? (
          <div style={{ fontSize: 12, color: 'var(--warn)', width: '100%', textAlign: 'right' }}>
            {t.err_save}: {errEnvio}
          </div>
        ) : null}
        <button
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
          className={`${pbtn} min-h-11 ${enviando ? 'opacity-60' : ''}`}
        >
          {t.btn_submit} →
        </button>
      </div>
    </div>
  );
}
