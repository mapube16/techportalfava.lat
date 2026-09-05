import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, Empty, StatusPill, money } from '../ui';
import { CONCEPT_COLOR } from '../i18n';
import { svg, ICON } from '../icons';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { listNotes, noteDays } from '../lib/api/weeklyNotes';
import { getExpenses } from '../lib/api/dailyEntries';
import { getCatalogs } from '../lib/api/catalogs';
import SignNoteModal from '../components/SignNoteModal';
import type { WeeklyNote } from '../lib/api/weeklyNotes';

/**
 * NOTA-11 — cerrar la semana (diseno 1c).
 *
 * «Mis notas» era una lista de tarjetas: para saber que llevaba dentro una nota habia
 * que abrir el PDF. Aqui la nota se REPASA antes de firmarla — los siete dias en una
 * linea de tiempo, los gastos sumados y la firma— y se cierra sin salir de la pantalla.
 *
 * Dos paneles y no uno: a la izquierda la cola de lo que falta por cerrar, a la derecha
 * la nota elegida. Es lo que permite corregir varias seguidas sin volver atras cada vez.
 *
 * LO QUE NO ESTA, y no por olvido: el guardado sin senal del artboard («se subiran
 * solos»). Eso es una cola en IndexedDB con reintento y resolucion de conflictos, no
 * una vista, y se decidio dejarlo fuera de este encargo. La barra de arriba cuenta lo
 * que de verdad esta pendiente de aprobacion, que es un estado REAL del servidor y no
 * una promesa de sincronia que hoy no se cumple.
 */

/** El dia del mes, sobre el string. Sin `Date`, como en el resto de la app. */
const diaDe = (iso: string) => Number(iso.slice(8, 10));

/** Suma «US$ 42» + «US$ 36». El valor es texto libre (asi lo guarda el servidor), asi
    que se extraen los digitos; lo que no tenga numero no suma. */
const aNumero = (v: string) => Number(v.replace(/[^\d.-]/g, '')) || 0;

export default function CloseDay() {
  const { state, t, patch } = useApp();
  const miTecnico = state.me?.status === 'ok' ? state.me.user.technicianId : null;

  /** El filtro de la cola. «Pendientes» es lo que hay que hacer, y es el que abre.
      Si se llega con una nota concreta, «Todas»: la pedida podria no ser pendiente. */
  const [filtro, setFiltro] = useState<'pend' | 'sent' | 'all'>(state.noteFocus ? 'all' : 'pend');
  const [abiertaId, setAbiertaId] = useState<string | null>(state.noteFocus);
  // Consumida al montar, como `weekStart` en la semana.
  useEffect(() => {
    if (state.noteFocus) patch({ noteFocus: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [firmando, setFirmando] = useState<WeeklyNote | null>(null);

  const { data: notas, error } = useApiData(
    () => (miTecnico ? listNotes(undefined, miTecnico) : Promise.resolve([])),
    [miTecnico, state.dataVersion],
  );

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!notas) return <ApiState error={null} label={t.loading} />;

  if (!notas.length) {
    return <Empty icon={svg(ICON.doc, { w: 30 })} msg={t.empty_notes} />;
  }

  /**
   * «Pendiente» = todavia pide algo del tecnico: firmarla, o corregirla porque se la
   * devolvieron. Una aprobada no esta pendiente aunque no la haya firmado nadie mas.
   */
  const pendiente = (n: WeeklyNote) =>
    n.status === 'returned' || (n.status === 'submitted' && !n.signed);

  const lista = notas.filter((n) =>
    filtro === 'pend' ? pendiente(n) : filtro === 'sent' ? n.status !== 'draft' : true,
  );
  const nPend = notas.filter(pendiente).length;

  // La nota abierta: la elegida, o la primera de la lista visible. Sin esto la pantalla
  // arranca con el panel derecho vacio y parece rota.
  const abierta = lista.find((n) => n.id === abiertaId) ?? lista[0] ?? null;

  const filtros: [typeof filtro, string, number][] = [
    ['pend', t.cd_pending, nPend],
    ['sent', t.st_sent, notas.filter((n) => n.status !== 'draft').length],
    ['all', t.st_all, notas.length],
  ];

  return (
    <div className="max-w-[1180px] mx-auto flex flex-col gap-3.5">
      {/* La cabecera cuenta lo que de VERDAD falta por cerrar. El artboard pinta aqui
          «2 registros en cola, se subiran solos»: eso seria una cola offline, que no
          existe todavia. Prometerlo en la interfaz seria mentir sobre lo que pasa. */}
      {nPend ? (
        <div className="flex items-center gap-2.5 bg-sent-tint border border-sent rounded-card px-4 py-2.5">
          <span className="size-1.5 rounded-full bg-sent shrink-0" />
          <div className="text-[11.5px] text-primary leading-relaxed">
            <strong className="font-bold">{t.cd_banner.replace('{n}', String(nPend))}</strong>{' '}
            {t.cd_banner_sub}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row gap-3.5 items-start">
        {/* LA COLA */}
        <Card className="w-full md:w-[318px] md:flex-none overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="text-[18px] font-bold font-cond">{t.cd_my_days}</div>
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {filtros.map(([k, label, n]) => (
                <Button
                  key={k}
                  variant={filtro === k ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltro(k)}
                  className="min-h-11 md:min-h-8"
                >
                  {label}
                  <span className="tabular-nums opacity-70">{n}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {lista.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setAbiertaId(n.id)}
                aria-current={abierta?.id === n.id ? 'true' : undefined}
                className={`w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                  abierta?.id === n.id ? 'bg-primary-tint/50' : 'hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill st={n.status} t={t} />
                  {n.signed ? (
                    <span className="text-[10.5px] text-ok font-semibold">{t.cd_signed}</span>
                  ) : null}
                </div>
                <div className="text-[12.5px] font-semibold mt-1.5 truncate">{n.projectName}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{n.weekStart}</div>
              </button>
            ))}
            {!lista.length ? (
              <div className="px-4 py-6 text-[12.5px] text-muted-foreground text-center">
                {t.cd_none_here}
              </div>
            ) : null}
          </div>
        </Card>

        {/* EL DETALLE */}
        {abierta ? (
          <Detalle
            key={abierta.id}
            nota={abierta}
            onFirmar={() => setFirmando(abierta)}
            onPdf={() => patch({ pdfOpen: true, pdfNoteId: abierta.id, pdfSigned: abierta.signed })}
          />
        ) : null}
      </div>

      {firmando ? <SignNoteModal nota={firmando} onClose={() => setFirmando(null)} /> : null}
    </div>
  );
}

/**
 * La nota abierta: los siete dias, los gastos y la firma.
 *
 * Componente aparte y con `key={id}`: pide los dias y los gastos de LA nota abierta, y
 * al cambiar de nota tiene que remontar para no ensenar un instante los datos de la
 * anterior bajo el titulo de la nueva.
 */
function Detalle({
  nota,
  onFirmar,
  onPdf,
}: {
  nota: WeeklyNote;
  onFirmar: () => void;
  onPdf: () => void;
}) {
  const { state, t } = useApp();
  const { data: dias } = useApiData(() => noteDays(nota.id), [nota.id, state.dataVersion]);
  const { data: catalogos } = useApiData(getCatalogs, []);

  /**
   * Los gastos de los 7 dias, en paralelo. Van por DIA porque asi los guarda el
   * tecnico (GASTO-01) y el endpoint de la nota solo trae los cuatro renglones de
   * texto del PDF, no los que se anotaron sobre la marcha.
   */
  /**
   * La dependencia es la CADENA de fechas, no el array `dias`.
   *
   * `useApiData` compara sus deps por identidad, y `dias` es un array nuevo en cada
   * render: pasarlo tal cual relanzaba la peticion sin parar, que a siete llamadas por
   * vuelta es un bucle infinito contra el servidor.
   */
  const clave = (dias ?? []).map((d) => d.date).join();
  const { data: gastos } = useApiData(
    async () => {
      if (!clave) return [];
      const porDia = await Promise.all(clave.split(',').map((f) => getExpenses(f)));
      return porDia.flat();
    },
    [nota.id, clave, state.dataVersion],
  );

  const etiqueta = (code: string | null) => {
    if (!code) return '';
    const c = (catalogos?.concepts ?? []).find((x) => x.code === code);
    return c ? (state.lang === 'it' ? c.labelIt : c.labelEs) : code;
  };

  // Los gastos del dia mas los cuatro renglones de la nota: el PDF suma los dos
  // origenes (ver `datosParaPdf`), asi que la pantalla tiene que decir lo mismo.
  const lineas = [
    ...(gastos ?? []).map((g) => ({ descripcion: g.descripcion, valor: g.valor })),
    ...nota.gastosTecnico,
  ];
  const total = lineas.reduce((s, g) => s + aNumero(g.valor), 0);

  return (
    <div className="flex-1 min-w-0 w-full flex flex-col gap-3.5">
      <Card>
        <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[.1em] text-accent-brand">
              {t.cd_week_of} {nota.weekStart}
            </div>
            <div className="text-[22px] font-bold font-cond leading-tight mt-1">
              {nota.projectName}
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {nota.clientName}
              {nota.roleTypeName ? ` · ${nota.roleTypeName}` : ''} · {nota.technicianName}
            </div>
          </div>
          <StatusPill st={nota.status} t={t} />
        </div>

        {nota.returnComment ? (
          <div className="mx-4 mb-4 bg-warn-tint border border-warn rounded-lg px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-warn">{t.returned_note}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
              {nota.returnComment}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col lg:flex-row gap-3.5 items-start">
        {/* LOS 7 DIAS */}
        <Card className="flex-1 min-w-0 w-full">
          <div className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-[.05em] text-muted-foreground">
              {t.cd_seven_days}
            </div>
            <div className="mt-3 flex flex-col">
              {(dias ?? []).map((d, i, arr) => (
                <div key={d.date} className="flex gap-3 items-start">
                  {/* La linea de tiempo: punto relleno si el dia tiene concepto, hueco
                      si es un dia sin registrar. El hilo no se pinta bajo el ultimo. */}
                  <div className="flex flex-col items-center w-2 shrink-0 pt-1">
                    <span
                      className="size-2 rounded-full border-2 shrink-0"
                      style={{
                        background: d.conceptCode
                          ? (CONCEPT_COLOR[d.conceptCode] ?? 'var(--primary)')
                          : 'var(--surface)',
                        borderColor: d.conceptCode
                          ? (CONCEPT_COLOR[d.conceptCode] ?? 'var(--primary)')
                          : 'var(--border-2)',
                      }}
                    />
                    {i < arr.length - 1 ? <span className="w-0.5 flex-1 min-h-4 bg-surface-3" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex gap-2 items-baseline flex-wrap">
                      <span className="text-[11.5px] font-bold">
                        {t.days[i]} {diaDe(d.date)}
                      </span>
                      {d.conceptCode ? (
                        <span
                          className="text-[10px] font-mono font-semibold"
                          style={{ color: CONCEPT_COLOR[d.conceptCode] ?? 'var(--primary)' }}
                        >
                          {d.conceptCode} · {etiqueta(d.conceptCode)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{t.week_empty_day}</span>
                      )}
                      {d.commessaShort ? (
                        <span className="text-[10px] font-mono text-primary">{d.commessaShort}</span>
                      ) : null}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground leading-relaxed">
                      {d.description ?? ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* GASTOS Y FIRMA */}
        <div className="w-full lg:w-[250px] lg:flex-none flex flex-col gap-3.5">
          <Card>
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-[.05em] text-muted-foreground">
                {t.expenses}
              </div>
              {lineas.length ? (
                <>
                  {lineas.map((g, i) => (
                    <div
                      key={`${g.descripcion}-${i}`}
                      className="flex justify-between gap-2 text-[11.5px] text-muted-foreground mt-2"
                    >
                      <span className="min-w-0 truncate">{g.descripcion}</span>
                      <span className="font-mono text-foreground shrink-0">{g.valor}</span>
                    </div>
                  ))}
                  <div className="h-px bg-border my-2.5" />
                  <div className="flex justify-between text-[12px] font-bold">
                    <span>{t.cd_total}</span>
                    {/* El total es orientativo: `valor` es texto libre en el servidor y
                        una linea sin cifra («por definir») no suma. La verdad
                        contable es el PDF, no esta resta. */}
                    <span className="font-mono">{money(total, 'USD')}</span>
                  </div>
                </>
              ) : (
                <div className="text-[11.5px] text-muted-foreground mt-2">{t.cd_no_expenses}</div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-[.05em] text-muted-foreground">
                {t.cd_signature}
              </div>
              {nota.signed ? (
                <div className="mt-2.5 text-[11.5px] text-ok font-semibold flex items-center gap-1.5">
                  {svg(ICON.shield, { w: 15 })}
                  {t.cd_signed_ok}
                </div>
              ) : (
                <div className="mt-2.5 border border-dashed border-line-2 rounded-lg h-[74px] grid place-items-center bg-surface-2 text-[11.5px] text-muted-foreground">
                  {t.cd_unsigned}
                </div>
              )}
              {/* La firma del CLIENTE no se pide aqui: la casilla del PDF es «TIMBRE Y
                  FIRMA DEL CLIENTE» y se firma en papel. Es una decision de negocio,
                  aunque el servidor aceptaria la segunda firma sin cambios. */}
              <div className="text-[10.5px] text-muted-foreground leading-relaxed mt-2">
                {t.cd_client_paper}
              </div>
            </div>
          </Card>

          {/* Solo se firma lo ENVIADO y sin firma previa: el servidor rechaza lo demas,
              y ofrecer el boton igual seria prometer algo que no pasa. */}
          {nota.status === 'submitted' && !nota.signed ? (
            <Button onClick={onFirmar} className="w-full min-h-11">
              {t.btn_signnote}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onPdf} className="w-full min-h-11">
            {t.btn_pdf}
          </Button>
        </div>
      </div>
    </div>
  );
}
