import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, ConceptPill, StatusPill } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getWeek } from '../lib/api/dailyEntries';
import { listNotes, submitWeek } from '../lib/api/weeklyNotes';
import type { WeeklyNote } from '../lib/api/weeklyNotes';
import SignNoteModal from '../components/SignNoteModal';
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
  const { state, t, patch, showToast, refresh } = useApp();
  /** Lunes de la semana visible. `null` = la de hoy, que se resuelve al renderizar. */
  const [lunes, setLunes] = useState<string | null>(null);
  const [errEnvio, setErrEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const semana = lunes ?? lunesDe(hoyLocal());
  const dias = diasDeSemana(semana);

  const { data, error } = useApiData(() => getWeek(dias[0], dias[6]), [semana, state.dataVersion]);

  /**
   * Las notas que salieron de ESTA semana. Viven aqui y no solo en «Mis notas» porque
   * son el resultado de los dias que se estan viendo: firmar mirando la semana que la
   * origino es la unica forma de saber que se esta firmando.
   *
   * Y resuelve la objecion por la que estaban separadas: «una semana con dos proyectos
   * produce dos notas con dos clientes y aqui no hay forma de decir cual firmas». Si la
   * hay — cada tarjeta lleva el nombre de su proyecto.
   */
  const miTecnico = state.me?.status === 'ok' ? state.me.user.technicianId : null;
  const { data: notas } = useApiData(
    () => (miTecnico ? listNotes(undefined, miTecnico) : Promise.resolve([])),
    [miTecnico, state.dataVersion],
  );
  const deLaSemana = (notas ?? []).filter((n) => n.weekStart.slice(0, 10) === semana);
  /** La que se abre al pulsar «Firmar»; la cola es la del envio recien hecho. */
  const [firmandoLocal, setFirmandoLocal] = useState<WeeklyNote | null>(null);
  const aFirmar = firmandoLocal ?? deLaSemana.find((n) => n.id === state.porFirmar[0]) ?? null;

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
          <StatusPill st={estado} t={t} />
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

      {/* Las notas que produjo ESTA semana. Una por proyecto, cada una con su cliente,
          su estado y su firma. Estuvieron en «Mis notas» con el argumento de que aquí
          «no hay forma de decir cuál de los dos clientes estás firmando» — la hay:
          cada tarjeta lleva el nombre de su proyecto, y encima se ven los días que la
          originaron, que una lista aparte no puede enseñar. */}
      {deLaSemana.length ? (
        <div className="flex flex-col gap-2.5">
          {deLaSemana.map((n) => (
            <Card key={n.id}>
              <div className="flex items-center gap-3 flex-wrap p-4">
                <div className="flex-1 min-w-[180px]">
                  <div className="text-[14px] font-bold">{n.projectName}</div>
                  <div className="text-[12.5px] text-muted-foreground">{n.clientName}</div>
                </div>
                <StatusPill st={n.status} t={t} />
                {/* Solo se firma lo ENVIADO y sin firma previa: el servidor rechaza lo
                    demás, y ofrecer el botón igual sería prometer algo que no pasa. */}
                {n.status === 'submitted' && !n.signed ? (
                  <Button onClick={() => setFirmandoLocal(n)} className="min-h-11 md:min-h-9">
                    {t.btn_signnote}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => patch({ pdfOpen: true, pdfNoteId: n.id, pdfSigned: n.signed })}
                  className="min-h-11 md:min-h-9"
                >
                  {t.btn_pdf}
                </Button>
              </div>
              {n.returnComment ? (
                <div className="mx-4 mb-4 flex gap-2.5 bg-warn-tint border border-warn rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-xs font-bold text-warn">{t.returned_note}</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">{n.returnComment}</div>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      <div className="flex gap-3 flex-wrap justify-end items-center">
        <div className="flex-1 text-xs text-muted-foreground min-w-[200px]">{t.gen_pdf_note}</div>
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
              .then((creadas) => {
                showToast('submitted');
                // Se ENCADENA con la firma y NO se cambia de pantalla: la firma es el
                // consentimiento de ESTE envio. Van TODAS las notas creadas, no la
                // primera: al firmar una se abre la siguiente sola. Con `creadas[0]`, una
                // semana en dos proyectos dejaba la segunda sin firma y sin pedirla.
                patch({ porFirmar: creadas.map((n) => n.id) });
                refresh();
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

      {aFirmar ? (
        <SignNoteModal
          nota={aFirmar}
          onSigned={() => {
            // Firmada: pasa a la siguiente de la cola. Si venia del boton de una
            // tarjeta suelta no hay cola que avanzar.
            if (firmandoLocal) setFirmandoLocal(null);
            else patch({ porFirmar: state.porFirmar.slice(1) });
          }}
          onClose={() => {
            // Cerrar es renunciar a firmar AHORA, no solo a esta: se vacia la cola y
            // cada nota queda con su boton «Firmar» en su tarjeta.
            setFirmandoLocal(null);
            if (state.porFirmar.length) patch({ porFirmar: [] });
          }}
        />
      ) : null}
    </div>
  );
}
