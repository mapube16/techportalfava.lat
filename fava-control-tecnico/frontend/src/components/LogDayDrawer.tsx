import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONCEPT_COLOR } from '../i18n';
import { FieldError, inputStyle, inputError } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getCatalogs } from '../lib/api/catalogs';
import { listProjects } from '../lib/api/projects';
import { getWeek, putEntries } from '../lib/api/dailyEntries';
import type { ConceptCode } from '../lib/api/dailyEntries';
import { diasDeSemana, hoyLocal, lunesDe } from '../lib/fecha';

/**
 * Los conceptos que la CHECK `de_proyecto_por_concepto` deja ir SIN proyecto. Es la
 * misma lista que el motor: si se desincronizan, el servidor rechaza con un 23514 que
 * al técnico no le dice nada. Aquí sirve para no pedirle un proyecto que no tiene.
 */
const SIN_PROYECTO: ConceptCode[] = ['LR', 'NR', 'IL'];

/** Inicial del dia, indexada por `getUTCDay()` (0 = domingo). Las fechas son
    'YYYY-MM-DD' leidas en UTC, nunca en el huso del movil (ver lib/fecha.ts). */
const DIA_CORTO = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** «En Fabrica» solo tiene sentido en día completo y festivo: es su modificador. */
const ADMITE_FABRICA: ConceptCode[] = ['DC', 'DFD'];

export default function LogDayDrawer() {
  const { state, t, patch, showToast, refresh } = useApp();
  const [fecha, setFecha] = useState(state.logDate ?? hoyLocal());
  const [projectId, setProjectId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [concept, setConcept] = useState<ConceptCode>('DC');
  const [inFactory, setInFactory] = useState(false);
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
  const { data: proyectos } = useApiData(listProjects, []);

  /**
   * Las ETIQUETAS de los conceptos vienen del API porque el Super Admin las edita
   * (CAT-01). Lo único que se queda en `i18n` es el COLOR, que es decoración y no
   * puede desincronizarse: los 8 códigos son fijos por enum de Postgres.
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
    if (existente.conceptCode) setConcept(existente.conceptCode);
    setInFactory(existente.inFactory);
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
  // `orders` solo viaja en la proyección del técnico; para un admin el listado trae
  // otra forma, así que se lee con cuidado en vez de asumir.
  const ordenes = ((proyecto as unknown as { orders?: { id: string; label: string; commessaShort: string | null }[] })?.orders) ?? [];
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
        conceptCode: concept,
        phase: null,
        inFactory: ADMITE_FABRICA.includes(concept) ? inFactory : false,
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

          {field(
            t.log_project,
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setOrderId('');
              }}
              className={inputStyle}
            >
              <option value="">{exigeProyecto ? t.log_pick_project : t.log_no_project}</option>
              {(proyectos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>,
          )}

          {/* La máquina se elige por ORDEN, no por modelo: dos `PL 6000` del mismo
              proyecto son el mismo modelo y solo se distinguen por su commessa. Es el
              dato cuya ausencia obliga hoy a repartir los días a mano. */}
          {projectId ? (
            field(
              t.log_machine,
              ordenes.length ? (
                <div className="flex gap-2 flex-wrap">
                  {ordenes.map((o) => {
                    const on = orderId === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setOrderId(on ? '' : o.id)}
                        className={`flex-1 basis-[120px] min-h-11 p-2.5 rounded-lg font-mono font-semibold text-[13.5px] cursor-pointer border transition-colors ${
                          on
                            ? 'border-primary bg-primary-tint text-primary'
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
              {conceptos.map((c) => {
                const on = concept === c.code;
                const color = CONCEPT_COLOR[c.code] ?? 'var(--primary)';
                return (
                  <button
                    key={c.code}
                    onClick={() => setConcept(c.code as ConceptCode)}
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

          {/* Modificador, no concepto: el catálogo cerrado son 8 y «En Fabrica» duplicaría
              DC y DFD si fuese uno más. */}
          {ADMITE_FABRICA.includes(concept) ? (
            <label className="flex items-center gap-2.5 mb-3.5 min-h-11 cursor-pointer">
              <input
                type="checkbox"
                checked={inFactory}
                onChange={(e) => setInFactory(e.target.checked)}
                className="size-4.5 accent-primary"
              />
              <span className="text-[13.5px]">{t.log_in_factory}</span>
            </label>
          ) : null}

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

          {errApi ? <FieldError msg={`${t.err_save}: ${errApi}`} /> : null}

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
