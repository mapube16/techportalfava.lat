import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONCEPT_COLOR } from '../i18n';
import { FieldError, inputStyle, inputError } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getCatalogs } from '../lib/api/catalogs';
import { listProjectsForLog } from '../lib/api/projects';
import { getWeek, putEntries } from '../lib/api/dailyEntries';
import type { ConceptCode } from '../lib/api/dailyEntries';
import { diasDeSemana, hoyLocal, lunesDe } from '../lib/fecha';
import DayExpenses from './DayExpenses';

/**
 * Los conceptos que la CHECK `de_proyecto_por_concepto` deja ir SIN proyecto. Es la
 * misma lista que el motor: si se desincronizan, el servidor rechaza con un 23514 que
 * al técnico no le dice nada. Aquí sirve para no pedirle un proyecto que no tiene.
 */
const SIN_PROYECTO: ConceptCode[] = ['LR', 'NR', 'IL', 'OTRO'];

/** Inicial del dia, indexada por `getUTCDay()` (0 = domingo). Las fechas son
    'YYYY-MM-DD' leidas en UTC, nunca en el huso del movil (ver lib/fecha.ts). */
const DIA_CORTO = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** «En fábrica» es un MODIFICADOR del día completo y del festivo: dice DÓNDE ocurrió. */
const ADMITE_FABRICA: ConceptCode[] = ['DC', 'DFD'];

/**
 * La INCAPACIDAD se marca con una casilla, no eligiendo un concepto de la rejilla.
 *
 * El código sigue siendo IL en la base y en los KPIs — es el que deja el día FUERA del
 * denominador de utilización, porque una baja no es tiempo disponible desaprovechado —
 * pero el técnico ya no lo busca entre otros ocho botones de tres letras: marca «Estuve
 * incapacitado» y el día queda registrado. La casilla dice lo que pasó; «IL» había que
 * traducirlo.
 */
const INCAPACIDAD: ConceptCode = 'IL';

export default function LogDayDrawer() {
  const { state, t, patch, showToast, refresh, errTexto } = useApp();
  const [fecha, setFecha] = useState(state.logDate ?? hoyLocal());
  const [projectId, setProjectId] = useState('');
  const [orderId, setOrderId] = useState('');
  /**
   * BIT-10 — las máquinas ADICIONALES del día. Camilo Cruz, en la capacitación del
   * 31-ago: «tenemos tres máquinas al tiempo, ¿cómo hago la descripción?». Antes había
   * que elegir una y contar las otras en el texto libre.
   */
  const [extraOrderIds, setExtraOrderIds] = useState<string[]>([]);
  const [concept, setConcept] = useState<ConceptCode>('DC');
  const [inFactory, setInFactory] = useState(false);
  /** Marcada = el día se guarda como incapacidad. No hay botón que elegir. */
  const incapacitado = concept === INCAPACIDAD;
  /** Lo que había puesto antes de marcarla: al desmarcar se vuelve ahí, no a un cajón
      sin concepto por haber probado la casilla. */
  const [conceptoPrevio, setConceptoPrevio] = useState<ConceptCode>('DC');
  /** BIT-08: la columna NOTA del papel — horario del dia o un aviso para Andrea. */
  const [notaDia, setNotaDia] = useState('');
  /**
   * Los dias que se van a escribir. Empieza con uno —el que se abrio— y el tecnico
   * puede marcar mas: un montaje son cinco dias con el MISMO proyecto, orden y
   * concepto, y lo unico que cambia es la descripcion. Rellenarlos de uno en uno,
   * reeligiendo los tres selectores cada vez, es la razon por la que 6.573 de las
   * 6.574 jornadas del historico del Excel vienen sin descripcion: salia caro.
   */
  const [dias, setDias] = useState<string[]>([state.logDate ?? hoyLocal()]);
  /** Una descripcion por dia. Es lo unico que NO se comparte. */
  const [descs, setDescs] = useState<Record<string, string>>({});
  const [descError, setDescError] = useState(false);
  const desc = descs[fecha] ?? '';
  const setDesc = (v: string) => setDescs((d) => ({ ...d, [fecha]: v }));
  const [errApi, setErrApi] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // La proyección de técnico: solo id, nombre y sus órdenes activas. Nada comercial.
  const { data: proyectos } = useApiData(listProjectsForLog, []);

  /**
   * Las ETIQUETAS de los conceptos vienen del API porque el Super Admin las edita
   * (CAT-01). Lo único que se queda en `i18n` es el COLOR, que es decoración y no
   * puede desincronizarse: los códigos son fijos por enum de Postgres.
   */
  const { data: catalogos } = useApiData(getCatalogs, []);
  const conceptos = catalogos?.concepts ?? [];

  /** Lo ya registrado ese día: el drawer edita, no crea siempre desde cero. */
  const { data: existente } = useApiData(
    async () => (await getWeek(fecha, fecha)).entries[0] ?? null,
    [fecha],
  );

  useEffect(() => {
    if (!existente) return;
    setProjectId(existente.projectId ?? '');
    setOrderId(existente.orderId ?? '');
    setExtraOrderIds(existente.extraOrders.map((o) => o.id));
    if (existente.conceptCode) setConcept(existente.conceptCode);
    setInFactory(existente.inFactory);
    setNotaDia(existente.dayNote ?? '');
    setDescs((d) => ({ ...d, [fecha]: existente.description ?? '' }));
  }, [existente, fecha]);

  // Cambiar la fecha del selector mueve el dia «principal» y lo mantiene marcado.
  const cambiarFecha = (f: string) => {
    setFecha(f);
    setDias((ds) => (ds.includes(f) ? ds : [...ds, f].sort()));
  };
  const semana = diasDeSemana(lunesDe(fecha));
  const alternar = (f: string) =>
    setDias((ds) => (ds.includes(f) ? ds.filter((x) => x !== f) : [...ds, f].sort()));

  const close = () => patch({ logOpen: false, logDate: null });

  const proyecto = (proyectos ?? []).find((p) => p.id === projectId);
  /**
   * El día está colgado de un proyecto que YA NO SE OFRECE (cerrado, o desactivado
   * después de registrarlo). La lista solo trae los activos, así que el desplegable no
   * encuentra su id y se queda en «Elige un proyecto…» — mientras `projectId` sigue
   * puesto. La pantalla decía entonces dos cosas contradictorias a la vez: ningún
   * proyecto elegido arriba, y «este proyecto no tiene máquinas» debajo.
   *
   * `proyectos` puede estar cargando todavía: sin ese `&&` se acusaría de huérfano a
   * cualquier día durante el primer render.
   */
  const proyectoHuerfano = Boolean(projectId) && proyectos !== null && !proyecto;
  // Sin `as unknown as`: `/projects/para-registrar` devuelve SIEMPRE esta forma, sea
  // quien sea quien pregunta. El casteo de antes tapaba justo el bug que lo hacía
  // necesario — a un admin le llegaba otra proyección y `orders` era undefined.
  const ordenes = proyecto?.orders ?? [];
  const exigeProyecto = !SIN_PROYECTO.includes(concept);

  const save = () => {
    const elegidos = dias.length ? dias : [fecha];
    // Sin descripcion en ALGUNO de los dias elegidos no se guarda: un dia en blanco
    // dentro de un guardado masivo es justo el agujero que esto viene a cerrar.
    if (elegidos.some((f) => !(descs[f] ?? '').trim())) {
      setDescError(true);
      return;
    }
    // Se comprueba aquí lo mismo que el motor, para dar un mensaje en vez de un 400.
    if (exigeProyecto && !projectId) {
      setErrApi('PROYECTO_REQUERIDO');
      return;
    }
    setErrApi(null);
    setGuardando(true);
    putEntries(
      elegidos.map((f) => ({ date: f, description: (descs[f] ?? '').trim() })),
      {
        projectId: projectId || null,
        // La orden es opcional aunque haya proyecto: puede no estar creada todavía, y
        // bloquear la captura por eso dejaría al técnico sin poder registrar su día.
        orderId: orderId || null,
        // BIT-10: las demás máquinas del día. Siempre se manda la lista (aunque esté
        // vacía) para que desmarcar una la quite de verdad.
        extraOrderIds,
        conceptCode: concept,
        phase: null,
        // Con la incapacidad dice si fue en planta o en casa; con DC/DFD, dónde se
        // trabajó. En cualquier otro concepto no significa nada y no se manda.
        inFactory: ADMITE_FABRICA.includes(concept) || incapacitado ? inFactory : false,
        // Solo en el modo de UN dia: en el relleno multiple la nota es de cada dia y
        // repetir la misma en siete filas del PDF seria ruido impreso.
        dayNote: dias.length <= 1 ? notaDia.trim() || null : null,
      },
    )
      .then(() => {
        close();
        refresh();
        showToast('saved');
      })
      .catch((e: unknown) => setErrApi(codigo(e)))
      .finally(() => setGuardando(false));
  };

  const field = (label: string, el: ReactNode, err?: boolean) => (
    <label className="block mb-3.5">
      {/* La etiqueta ENVUELVE al control: asociacion implicita, sin inventar ids.
          Como hermana no nombraba nada — un lector de pantalla anunciaba el campo
          sin nombre y pulsar el texto no enfocaba. */}
      <span className="block text-[12.5px] font-semibold text-muted-foreground mb-1.5">{label}</span>
      {el}
      {err ? <FieldError msg={t.field_req} /> : null}
    </label>
  );

  return (
    <div onClick={close} className="fixed inset-0 z-60 bg-black/50 flex items-end justify-center fava-anim">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-card rounded-t-[20px] shadow-pop max-h-[92vh] overflow-y-auto fava-anim"
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9.5 h-1 rounded-sm bg-input" />
        </div>
        <div className="px-5.5 pb-5.5 pt-1.5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-bold">{t.log_title}</div>
              {existente ? (
                <div className="text-xs text-muted-foreground font-semibold">{t.log_editing}</div>
              ) : null}
            </div>
            <Button variant="outline" size="icon" onClick={close} aria-label={t.pdf_close} className="size-11 md:size-9">
              <X className="size-4" />
            </Button>
          </div>

          {field(
            t.log_date,
            <input
              type="date"
              value={fecha}
              onChange={(e) => cambiarFecha(e.target.value)}
              className={inputStyle}
            />,
          )}

          {/* Los siete dias de esa semana. Marcar varios escribe la MISMA jornada en
              todos —mismo proyecto, orden y concepto— y deja una descripcion por dia,
              que es lo unico que cambia entre el lunes y el martes de un montaje. */}
          <div className="mb-3.5 flex gap-1.5 flex-wrap">
            {semana.map((f) => {
              const on = dias.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => alternar(f)}
                  aria-pressed={on}
                  className={`min-h-11 md:min-h-9 px-3 rounded-md text-[12.5px] font-semibold border cursor-pointer transition-colors ${
                    on
                      ? 'bg-primary text-white border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:bg-surface-3'
                  }`}
                >
                  {DIA_CORTO[new Date(`${f}T00:00:00Z`).getUTCDay()]} {f.slice(8)}
                </button>
              );
            })}
          </div>

          {/* Con un concepto sin proyecto (LR, NR, IL) el selector NO se muestra:
              esa informacion se relaciona directamente con «sin proyecto», y ofrecer
              un desplegable opcional invitaba a colgar una incapacidad de una obra.
              El estado se limpia al elegir el concepto, mas abajo. */}
          {exigeProyecto ? field(
            t.log_project,
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setOrderId('');
                // Las máquinas son DEL proyecto: al cambiarlo, las de antes ya no valen.
                setExtraOrderIds([]);
              }}
              className={inputStyle}
            >
              <option value="">{t.log_pick_project}</option>
              {(proyectos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>,
          ) : null}

          {/* El día quedó colgado de un proyecto que ya no se ofrece. Se DICE, en vez
              de dejar el desplegable en «Elige un proyecto…» como si nunca se hubiera
              elegido: lo registrado sigue ahí y se pierde al guardar sin volver a elegir. */}
          {proyectoHuerfano ? (
            <div className="mb-3.5 rounded-lg border border-input bg-muted px-3 py-2.5 text-[12.5px] text-muted-foreground">
              {t.log_project_closed}
            </div>
          ) : null}

          {/* La máquina se elige por ORDEN, no por modelo: dos `PL 6000` del mismo
              proyecto son el mismo modelo y solo se distinguen por su commessa. Es el
              dato cuya ausencia obliga hoy a repartir los días a mano. */}
          {projectId && !proyectoHuerfano ? (
            field(
              t.log_machine,
              ordenes.length ? (
                <div className="flex gap-2 flex-wrap">
                  {ordenes.map((o) => {
                    const on = orderId === o.id || extraOrderIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        onClick={() => {
                          // La PRIMERA que se marca es la principal (`orderId`); las
                          // siguientes se acumulan. Volver a pulsarla la quita. Así
                          // marcar una sola máquina se comporta igual que siempre y
                          // marcar tres no obliga a aprender otra interacción.
                          if (o.id === orderId) {
                            // Al soltar la principal, una de las extra ocupa su sitio:
                            // una jornada con máquinas pero sin principal dejaría el PDF
                            // y la matriz sin a qué colgarse.
                            const [siguiente, ...resto] = extraOrderIds;
                            setOrderId(siguiente ?? '');
                            setExtraOrderIds(resto);
                          } else if (extraOrderIds.includes(o.id)) {
                            setExtraOrderIds(extraOrderIds.filter((x) => x !== o.id));
                          } else if (!orderId) {
                            setOrderId(o.id);
                          } else {
                            setExtraOrderIds([...extraOrderIds, o.id]);
                          }
                        }}
                        type="button"
                        aria-pressed={on}
                        // La elegida va SOLIDA, no con un tinte: con `bg-primary-tint`
                        // las tres maquinas de JAV se veian encendidas a la vez y no
                        // habia forma de saber cual estaba marcada. Mismo lenguaje que
                        // los botones de dia y de concepto de este mismo cajon.
                        className={`flex-1 basis-[120px] min-h-11 p-2.5 rounded-lg font-mono font-semibold text-[13.5px] cursor-pointer border transition-colors ${
                          on
                            ? 'border-primary bg-primary text-white'
                            : 'border-input bg-muted text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {o.label}
                        {o.commessaShort ? (
                          <span className="block text-[11px] opacity-75">{o.commessaShort}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[12.5px] text-muted-foreground">{t.log_no_machines}</div>
              ),
            )
          ) : null}

          {field(
            t.log_concept,
            <div className="grid grid-cols-4 gap-1.5">
              {conceptos
                .filter(
                  // Regla de Andrea (2026-08-30): al EXTERNO no se le pagan los libres
                  // remunerados, asi que ni se le ofrece el boton. La regla dura vive
                  // en el servidor; esto solo evita ensenar una opcion que va a fallar.
                  (c) =>
                    c.code !== 'LR' ||
                    (state.me?.status === 'ok' ? state.me.user.employmentType !== 'EXTERNO' : true),
                )
                .map((c) => {
                const on = concept === c.code;
                const color = CONCEPT_COLOR[c.code] ?? 'var(--primary)';
                return (
                  <button
                    key={c.code}
                    onClick={() => {
                      const codigoNuevo = c.code as ConceptCode;
                      setConcept(codigoNuevo);
                      // Un dia sin proyecto no puede quedarse apuntando al de antes.
                      if (SIN_PROYECTO.includes(codigoNuevo)) {
                        setProjectId('');
                        setOrderId('');
                        setExtraOrderIds([]);
                      }
                    }}
                    title={state.lang === 'it' ? c.labelIt : c.labelEs}
                    // El color viene del catálogo (una fila por concepto), no de una
                    // paleta finita: no hay clase de Tailwind posible para eso, va en
                    // `style` a propósito.
                    style={{
                      borderColor: on ? color : undefined,
                      background: on ? color : undefined,
                      color: on ? '#fff' : undefined,
                    }}
                    className={`min-h-11 px-1 py-2.5 rounded-md font-mono font-bold text-[13px] cursor-pointer border transition-colors ${
                      on ? '' : 'border-input bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>,
          )}
          <div className="text-[11.5px] text-muted-foreground -mt-1.5 mb-3.5">
            {(() => {
              const c = conceptos.find((x) => x.code === concept);
              return c ? (state.lang === 'it' ? c.labelIt : c.labelEs) : '';
            })()}
          </div>

          {/* Las dos casillas del día, en el orden en que se leen: primero SI hubo
              incapacidad, y solo entonces DÓNDE («En fábrica»). Al revés se leía la
              explicación de algo aún no marcado. En un día normal «En fábrica» dice
              dónde se trabajó; con incapacidad, si el técnico estaba en planta o en
              casa — lo que Andrea pidió distinguir («a veces hemos tenido en fábrica
              con incapacidad», 31-ago). Misma casilla, misma etiqueta: el contexto lo
              da la de arriba. */}
          <div className="flex gap-5 flex-wrap mb-3.5">
            <label className="flex items-center gap-2.5 min-h-11 cursor-pointer">
              <input
                type="checkbox"
                checked={incapacitado}
                onChange={(e) => {
                  if (e.target.checked) {
                    setConceptoPrevio(concept);
                    setConcept(INCAPACIDAD);
                    // Una incapacidad no es de ningún proyecto: lo exige el CHECK
                    // de_proyecto_por_concepto del motor, no solo esta pantalla.
                    setProjectId('');
                    setOrderId('');
                    setExtraOrderIds([]);
                  } else {
                    setConcept(conceptoPrevio === INCAPACIDAD ? 'DC' : conceptoPrevio);
                  }
                }}
                className="size-4.5 accent-primary"
              />
              <span className="text-[13.5px]">{t.log_sick}</span>
            </label>

            {ADMITE_FABRICA.includes(concept) || incapacitado ? (
              <label className="flex items-center gap-2.5 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inFactory}
                  onChange={(e) => setInFactory(e.target.checked)}
                  className="size-4.5 accent-primary"
                />
                <span className="text-[13.5px]">{t.log_in_factory}</span>
              </label>
            ) : null}
          </div>

          {dias.length <= 1
            ? field(
                t.log_desc,
                <textarea
                  value={desc}
                  onChange={(e) => {
                    setDesc(e.target.value);
                    if (descError && e.target.value.trim()) setDescError(false);
                  }}
                  placeholder={t.log_desc_ph}
                  className={`${descError ? inputError : inputStyle} min-h-24 resize-y`}
                />,
                descError,
              )
            : dias.map((f) =>
                field(
                  `${t.log_desc} · ${DIA_CORTO[new Date(`${f}T00:00:00Z`).getUTCDay()]} ${f.slice(8)}`,
                  <textarea
                    value={descs[f] ?? ''}
                    onChange={(e) => {
                      setDescs((d) => ({ ...d, [f]: e.target.value }));
                      if (descError && e.target.value.trim()) setDescError(false);
                    }}
                    placeholder={t.log_desc_ph}
                    className={`${descError && !(descs[f] ?? '').trim() ? inputError : inputStyle} min-h-16 resize-y`}
                  />,
                  descError && !(descs[f] ?? '').trim(),
                ),
              )}

          {/* BIT-08: la columna NOTA del papel. Solo en el modo de un dia — en el
              relleno multiple repetir la misma nota siete veces seria ruido impreso. */}
          {dias.length <= 1
            ? field(
                t.log_note,
                <input
                  value={notaDia}
                  maxLength={120}
                  onChange={(e) => setNotaDia(e.target.value)}
                  placeholder={t.log_note_ph}
                  className={inputStyle}
                />,
              )
            : null}

          {/* GASTO-01: los gastos de ESE día, con su comprobante.
              SIEMPRE visible en el modo de un día, aunque el día esté en blanco: el
              bloque estaba condicionado a que la jornada ya existiera y eso lo hacía
              invisible justo cuando el técnico lo busca —abre el día, quiere apuntar el
              taxi y todavía no ha escrito nada—. Ahora el servidor crea la jornada
              vacía al recibir el primer gasto (ver `GastosService.crear`).
              Solo con un día porque un gasto es de una fecha concreta, no de las cinco
              de un montaje. Se guarda al instante, con su propio endpoint. */}
          {dias.length <= 1 ? (
            <DayExpenses
              fecha={fecha}
              bloqueado={Boolean(existente) && existente!.status !== 'draft' && existente!.status !== 'returned'}
            />
          ) : null}

          {errApi ? <FieldError msg={errTexto(errApi)} /> : null}

          <Button
            onClick={save}
            disabled={guardando}
            className="w-full py-6 text-[15px] justify-center min-h-11 mt-1"
          >
            {guardando ? t.loading : t.btn_saveday}
          </Button>
        </div>
      </div>
    </div>
  );
}
