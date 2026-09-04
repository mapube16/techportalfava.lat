import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, ConceptPill, StatusPill } from '../ui';
import { CONCEPTS } from '../i18n';
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
   * El avance de la semana, del diseno 1a.
   *
   * Cuenta los dias CON CONCEPTO sobre los siete, y no «sobre 5 laborables»: aqui el
   * fin de semana se registra igual (DFD es festivo/dominical, DVSF/DVRC son viajes que
   * caen en sabado a menudo). Un denominador de 5 daria 7 de 5 en una semana con viaje
   * el domingo.
   *
   * Es la misma cuenta que ya decide `estado` unas lineas arriba — `registrados` filtra
   * las entradas que existen, y una entrada sin `conceptCode` es un dia abierto en el
   * cajon pero sin rellenar, que para el tecnico no esta registrado.
   */
  const conConcepto = registrados.filter((e) => e.conceptCode).length;
  const pctSemana = Math.round((conConcepto / dias.length) * 100);

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

        {/* El avance de la semana (diseno 1a). Estaba solo en el texto del boton de
            enviar: se leia el fallo al pulsar, no antes. Aqui se ve al entrar. */}
        <div className="px-4.5 pt-3 pb-3.5 border-b border-border">
          <div
            className="h-1.5 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={conConcepto}
            aria-valuemin={0}
            aria-valuemax={dias.length}
            aria-label={t.week_progress.replace('{n}', String(conConcepto)).replace('{d}', String(dias.length))}
          >
            {/* Porcentaje calculado: no hay una clase de Tailwind por cada valor. */}
            <div
              className={`h-full rounded-full transition-all ${conConcepto === dias.length ? 'bg-ok' : 'bg-primary'}`}
              style={{ width: `${pctSemana}%` }}
            />
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-1.5">
            {t.week_progress.replace('{n}', String(conConcepto)).replace('{d}', String(dias.length))}
          </div>
        </div>

        {/* La semana de un vistazo (diseno 1a). En movil la lista de siete filas no
            cabe sin scroll y no hay forma de ver los huecos sin recorrerla; esta tira
            los ensena de golpe. En escritorio la tabla ya lo dice, asi que se oculta. */}
        <div className="flex gap-1.5 px-4.5 py-3 border-b border-border md:hidden">
          {dias.map((fecha, i) => {
            const e = porFecha.get(fecha);
            const cc = e?.conceptCode ? CONCEPTS.find((x) => x.c === e.conceptCode) : null;
            const esHoy = fecha === hoy;
            return (
              <button
                key={fecha}
                onClick={() => patch({ logOpen: true, logDate: fecha })}
                aria-label={`${t.days[i]} ${diaDe(fecha)}`}
                aria-current={esHoy ? 'date' : undefined}
                className={`flex-1 rounded-lg py-1.5 cursor-pointer transition-colors ${
                  cc ? 'text-white border-0' : 'bg-muted text-muted-foreground border border-dashed border-line-2'
                } ${esHoy ? 'ring-2 ring-accent-brand ring-offset-1' : ''}`}
                /* El color del concepto es un dato del catalogo, no una clase: Tailwind
                   no puede generar una utilidad por cada color en tiempo de compilacion. */
                style={cc ? { background: cc.color } : undefined}
              >
                <div className="text-[9.5px] font-bold opacity-80">{t.days[i].slice(0, 1)}</div>
                <div className="text-[13px] font-bold font-cond">{diaDe(fecha)}</div>
              </button>
            );
          })}
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
