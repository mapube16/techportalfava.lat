import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, ConceptPill, StatusPill } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getWeek } from '../lib/api/dailyEntries';
import { listNotes, submitWeek } from '../lib/api/weeklyNotes';
import type { WeeklyNote } from '../lib/api/weeklyNotes';
import SignNoteModal from '../components/SignNoteModal';
import AvisoModal from '../components/AvisoModal';
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
  const { state, t, patch, showToast, refresh, errTexto } = useApp();
  /** Lunes de la semana visible. `null` = la de hoy, que se resuelve al renderizar. */
  const [lunes, setLunes] = useState<string | null>(null);
  const [errEnvio, setErrEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const hoy = hoyLocal();
  const semana = lunes ?? lunesDe(hoy);
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

  const registrados = dias.map((d) => porFecha.get(d)).filter(Boolean) as Entry[];
  /**
   * El estado de la semana SOLO si es uno.
   *
   * Antes, con estados mezclados, se forzaba `'draft'`: la cabecera anunciaba
   * «Borrador» sobre una semana con cuatro días aprobados y dos enviados, donde no
   * había ni un borrador. Mezclada no hay un estado que contar, así que no se cuenta
   * ninguno — cada nota lleva el suyo en su tarjeta, ahí abajo.
   */
  const estados = new Set(registrados.map((e) => e.status));
  const estado = estados.size === 1 ? [...estados][0] : null;

  /**
   * El avance de la semana (diseno 1a).
   *
   * Cuenta los dias CON CONCEPTO sobre los siete, y no «sobre 5 laborables»: aqui el
   * fin de semana se registra igual —DFD es festivo/dominical y DVSF/DVRC son viajes,
   * que caen en sabado a menudo—. Un denominador de 5 daria «7 de 5» en una semana
   * con viaje el domingo.
   */
  const conConcepto = registrados.filter((e) => e.conceptCode).length;
  const pctSemana = Math.round((conConcepto / dias.length) * 100);

  /**
   * El hueco que hay que tapar HOY (diseno 1a: «Falta el jueves»).
   *
   * Solo mira dias ya pasados o el de hoy: un viernes sin registrar cuando es martes
   * no es un olvido, es futuro. Sin ese filtro el aviso saldria siempre, y un aviso
   * que sale siempre deja de leerse.
   */
  const pendiente = dias.find((d) => d <= hoy && !porFecha.get(d)?.conceptCode) ?? null;
  const idxPendiente = pendiente ? dias.indexOf(pendiente) : -1;

  const progreso = t.week_progress
    .replace('{n}', String(conConcepto))
    .replace('{d}', String(dias.length));

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
    // Dos columnas en escritorio (diseno 1a): la semana a la izquierda y el panel de
    // la nota a la derecha. En movil el panel BAJA debajo de la tabla en vez de
    // encogerse, que a 390px seria ilegible.
    <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row gap-4 items-start">
      <Card className="flex-1 min-w-0 w-full">
        <div className="flex items-center justify-between gap-2 px-4.5 py-3.5 border-b border-border flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            {nav(-1, atrasBloqueado)}
            <div className="min-w-0">
              {/* LA SEMANA, y punto. Aquí se listaban todos los proyectos de los siete
                  días juntos con sus máquinas: con tres proyectos era un renglón de
                  nombres que no decía de qué día era cada uno. Ese dato ahora va en la
                  fila del día, que es donde se puede leer. */}
              <div className="text-sm font-bold truncate">
                {t.week_of} {rotulo}
              </div>
            </div>
            {nav(1, adelanteBloqueado)}
          </div>
          {estado ? <StatusPill st={estado} t={t} /> : null}
        </div>

        {/* La cabecera de la tabla (diseno 1a). Las tres columnas dejan de ser un
            acuerdo tacito entre filas y se nombran: DIA / CONCEPTO / PROYECTO Y
            TRABAJO. En movil se oculta —las filas se leen como tarjetas apiladas y un
            encabezado de tabla sobre una sola columna estorba. */}
        <div className="hidden md:grid grid-cols-[64px_150px_1fr] gap-0 px-4.5 py-2.5 bg-surface-2 border-b border-border text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-foreground">
          <div>{t.col_day}</div>
          <div>{t.col_concept}</div>
          <div>{t.col_work}</div>
        </div>

        <div>
          {dias.map((fecha, i) => {
            const e = porFecha.get(fecha);
            // El HUECO se tinta (diseno 1a): tiene que verse como un hueco y no como
            // una fila mas con la celda vacia. Solo los dias ya pasados: si no, una
            // semana futura salia entera naranja y el aviso perdia todo su sentido.
            // Es el mismo criterio que usa `pendiente` para el panel de la derecha.
            const vacio = !e?.conceptCode && fecha <= hoy;
            return (
              <div
                key={fecha}
                onClick={() => patch({ logOpen: true, logDate: fecha })}
                className={`grid grid-cols-[44px_1fr] md:grid-cols-[64px_150px_1fr] gap-x-3.5 gap-y-1 p-row items-start cursor-pointer transition-colors ${
                  vacio ? 'bg-warn-tint/40 hover:bg-warn-tint/70' : 'hover:bg-muted/50'
                } ${i ? 'border-t border-border' : ''}`}
              >
                <div>
                  <div className="text-[11px] text-muted-foreground font-semibold">{t.days[i]}</div>
                  <div className="text-base font-bold font-cond">{diaDe(fecha)}</div>
                </div>
                <div className="md:contents">
                  <div>
                    {e?.conceptCode ? (
                      <ConceptPill code={e.conceptCode} lang={state.lang} />
                    ) : (
                      // El hueco se dice en naranja, como el diseno: en gris se leia
                      // igual que una fila normal y habia que contar los que faltaban.
                      <span
                        className={`text-[12.5px] ${vacio ? 'text-warn font-semibold' : 'text-muted-foreground'}`}
                      >
                        {t.week_empty_day}
                      </span>
                    )}
                  </div>
                <div className="text-[13px] text-muted-foreground leading-relaxed min-w-0">
                  {/* Sin concepto no hay proyecto ni descripcion que ensenar: la
                      columna diria nada. El diseno la usa para repetir el aviso. */}
                  {!e?.conceptCode ? (
                    <span className={vacio ? 'text-warn font-semibold' : 'text-muted-foreground'}>
                      {t.week_empty_day}
                    </span>
                  ) : null}
                  {/* De qué proyecto fue ESTE día. Sin esto, una semana en tres obras
                      era una lista de descripciones sin dueño. */}
                  {e?.projectName ? (
                    <div className="text-[11.5px] font-semibold text-foreground truncate">
                      {e.projectName}
                      {e.machineCode ? (
                        <span className="ml-2 font-normal text-muted-foreground">{e.machineCode}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {e?.description ?? ''}
                  {/* La commessa distingue dos máquinas IGUALES del mismo proyecto: sin
                      ella la fila no dice a cuál de las dos fue el día. */}
                  {e?.commessaShort ? (
                    <span className="ml-2 font-mono text-[11.5px] text-primary">{e.commessaShort}</span>
                  ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* EL PANEL DE LA NOTA (diseno 1a). La semana se lee a la izquierda y se ACTUA
          aqui: cuanto llevas, que falta, y los dos botones. Antes el boton de enviar
          estaba al pie de la pagina, debajo de las notas, y el aviso de que faltaba un
          dia no existia: el fallo se descubria al pulsar. */}
      <div className="w-full md:w-[272px] md:flex-none flex flex-col gap-3.5">
        <Card>
          <div className="p-4">
            <div className="text-[13px] font-bold">{t.week_note_panel}</div>
            {/* De QUE proyecto es la nota. Con dos obras en la semana hay dos notas y
                el panel tiene que decir cuales, no hablar de «la nota» en abstracto. */}
            <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
              {deLaSemana.length
                ? deLaSemana.map((n) => n.projectName).join(' · ')
                : t.week_note_none}
            </div>

            <div
              className="h-1.5 rounded-full bg-muted overflow-hidden mt-3.5"
              role="progressbar"
              aria-valuenow={conConcepto}
              aria-valuemin={0}
              aria-valuemax={dias.length}
              aria-label={progreso}
            >
              {/* El ancho es un porcentaje calculado: no hay una clase de Tailwind por
                  cada valor posible, asi que va en `style` a proposito. */}
              <div
                className={`h-full rounded-full transition-all ${conConcepto === dias.length ? 'bg-ok' : 'bg-primary'}`}
                style={{ width: `${pctSemana}%` }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">{progreso}</div>

            <div className="flex flex-col gap-2 mt-3.5">
              <Button
                onClick={() => {
                  // NOTA-01: el servidor deriva UNA NOTA POR PROYECTO. El tecnico no
                  // elige ninguna, solo manda su semana.
                  setErrEnvio(null);
                  setEnviando(true);
                  submitWeek(semana)
                    .then((creadas) => {
                      showToast('submitted');
                      // Se ENCADENA con la firma y NO se cambia de pantalla: la firma
                      // es el consentimiento de ESTE envio. Van TODAS las notas
                      // creadas, no la primera: al firmar una se abre la siguiente
                      // sola. Con `creadas[0]`, una semana en dos proyectos dejaba la
                      // segunda sin firma y sin pedirla.
                      patch({ porFirmar: creadas.map((n) => n.id) });
                      refresh();
                    })
                    .catch((e: unknown) => setErrEnvio(codigo(e)))
                    .finally(() => setEnviando(false));
                }}
                disabled={enviando}
                className="w-full min-h-11"
              >
                {t.btn_submit}
              </Button>
              {/* «Ver PDF» solo cuando HAY una nota que ver. Sin notas el boton abriria
                  un visor vacio, que es peor que no ofrecerlo. */}
              {deLaSemana.length ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    patch({
                      pdfOpen: true,
                      pdfNoteId: deLaSemana[0].id,
                      pdfSigned: deLaSemana[0].signed,
                    })
                  }
                  className="w-full min-h-11"
                >
                  {t.btn_pdf}
                </Button>
              ) : null}
            </div>
            <div className="text-[10.5px] text-muted-foreground leading-relaxed mt-2.5">
              {t.gen_pdf_note}
            </div>
          </div>
        </Card>

        {/* EL AVISO DEL HUECO (diseno 1a). Solo si hay un dia pasado sin concepto:
            un aviso que sale siempre deja de leerse. */}
        {pendiente ? (
          <div className="bg-warn-tint border border-warn rounded-card p-3.5">
            <div className="text-[11.5px] font-bold text-warn">
              {t.week_gap_title.replace('{d}', t.days_full[idxPendiente])}
            </div>
            <div className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
              {t.week_gap_body}
            </div>
            <Button
              variant="outline"
              onClick={() => patch({ logOpen: true, logDate: pendiente })}
              className="w-full min-h-11 mt-2.5"
            >
              {t.week_gap_cta}
            </Button>
          </div>
        ) : null}

        {/* Las notas de ESTA semana, una por proyecto: cada una con su estado, su
            firma y su PDF. Viven aqui —y no en «Mis notas»— porque son el resultado de
            los dias que se estan viendo: firmar mirando la semana que la origino es la
            unica forma de saber que se esta firmando. */}
        {deLaSemana.map((n) => (
          <Card key={n.id}>
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold truncate">{n.projectName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{n.clientName}</div>
                </div>
                <StatusPill st={n.status} t={t} />
              </div>
              {/* Solo se firma lo ENVIADO y sin firma previa: el servidor rechaza lo
                  demas, y ofrecer el boton igual seria prometer algo que no pasa. */}
              {n.status === 'submitted' && !n.signed ? (
                <Button onClick={() => setFirmandoLocal(n)} className="w-full min-h-11 mt-2.5">
                  {t.btn_signnote}
                </Button>
              ) : null}
              {n.returnComment ? (
                <div className="mt-2.5 bg-warn-tint border border-warn rounded-lg px-3 py-2.5">
                  <div className="text-[11px] font-bold text-warn">{t.returned_note}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                    {n.returnComment}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {/* No poder enviar la semana no es un campo mal escrito: es un cambio de plan
          («ya está enviada», «ese proyecto está aprobado y lo tiene que reabrir un
          administrador»). Iba en una línea roja al pie del botón y con el código
          interno del servidor por todo texto. */}
      {errEnvio ? (
        <AvisoModal titulo={t.err_save} mensaje={errTexto(errEnvio)} onClose={() => setErrEnvio(null)} />
      ) : null}

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
