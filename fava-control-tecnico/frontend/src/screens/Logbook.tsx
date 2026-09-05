import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card, inputStyle } from '../ui';
// Solo el mapa codigo->color: las ETIQUETAS vienen del API (CAT-01), que es lo
// que exige `check-no-free-text`. Los codigos son fijos por enum de Postgres, asi
// que el color no puede desincronizarse.
import { CONCEPT_COLOR } from '../i18n';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getWeek, putEntries } from '../lib/api/dailyEntries';
import { listProjectsForLog } from '../lib/api/projects';
import { getCatalogs } from '../lib/api/catalogs';
import { ADMITE_FABRICA, exigeProyecto } from '../lib/conceptos';
import { hoyLocal, rejillaDelMes, sumarMeses } from '../lib/fecha';
import AvisoModal from '../components/AvisoModal';
import type { ConceptCode } from '../lib/api/dailyEntries';

/**
 * BIT-11 — la bitacora del mes (diseno 1b).
 *
 * Invierte el modelo de «Mi semana»: alli se abre UN dia y se rellena; aqui se
 * seleccionan varios de la rejilla y se les aplica un concepto de un golpe. Una
 * comision de tres semanas en Cibao son tres arrastres, no veintiun formularios.
 *
 * La rejilla son SIEMPRE 42 celdas (ver `rejillaDelMes`), que es exactamente el tope
 * del GET y del PUT del servidor: el mes entero se lee en una peticion y se escribe en
 * una transaccion. Todo o nada — un fallo a mitad no deja el mes a medio pintar.
 *
 * Las reglas del concepto (que exige proyecto, cual admite «en fabrica») se importan de
 * `lib/conceptos`: son las mismas que aplica el cajon de la jornada, y dos copias serian
 * dos verdades.
 */

/** El dia del mes, sobre el string. Sin `Date`, como en el resto de la app. */
const diaDe = (iso: string) => Number(iso.slice(8, 10));

export default function Logbook() {
  const { state, t, patch, showToast, refresh, errTexto } = useApp();

  const hoy = hoyLocal();
  /** El mes visible, anclado al dia 1. `null` = el de hoy. */
  const [mes, setMes] = useState<string | null>(null);
  const mesActual = mes ?? `${hoy.slice(0, 7)}-01`;
  const celdas = rejillaDelMes(mesActual);
  const mesNum = mesActual.slice(0, 7);

  /** Los dias marcados, como set de ISO. El orden lo pone la rejilla, no el clic. */
  const [sel, setSel] = useState<string[]>([]);
  const [concept, setConcept] = useState<ConceptCode | null>(null);
  const [projectId, setProjectId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [desc, setDesc] = useState('');
  const [inFactory, setInFactory] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Arrastre: el boton esta pulsado y se van marcando los dias por los que pasa. */
  const [pintando, setPintando] = useState(false);

  const { data, error } = useApiData(
    () => getWeek(celdas[0], celdas[41]),
    [mesActual, state.dataVersion],
  );
  const { data: proyectos } = useApiData(listProjectsForLog, []);
  // Los conceptos y sus etiquetas son del catalogo del SERVIDOR (CAT-01): un
  // administrador puede renombrarlos desde Configuracion y esta pantalla tiene que
  // decir lo mismo que aquella.
  const { data: catalogos } = useApiData(getCatalogs, []);
  const conceptos = catalogos?.concepts ?? [];

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const porFecha = new Map(data.entries.map((e) => [e.date, e]));

  /**
   * Editable = dentro de la ventana del SERVIDOR. Los limites llegan en la respuesta
   * (`minDate`/`maxDate`, con tolerancia de huso) y mandan sobre cualquier cuenta que
   * haga el cliente: marcar un dia que despues no se puede escribir seria prometer
   * algo que el PUT va a rechazar.
   */
  // Y ademas el ESTADO del dia: enviado o aprobado es solo lectura (BIT-05). El
  // servidor lo rechaza igual, pero dejar marcar un dia aprobado y fallar al aplicar
  // era decirle al tecnico «puedes» y luego «no».
  const cerrado = (f: string) => {
    const st = porFecha.get(f)?.status;
    return st === 'submitted' || st === 'approved';
  };
  const editable = (f: string) => f >= data.minDate && f <= data.maxDate && !cerrado(f);

  const alternar = (f: string) => {
    if (!editable(f)) return;
    setSel((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));
  };
  /** Durante el arrastre solo se AÑADE: pasar por encima no debe desmarcar lo ya puesto. */
  const pintar = (f: string) => {
    if (!pintando || !editable(f)) return;
    setSel((s) => (s.includes(f) ? s : [...s, f]));
  };

  const proyecto = (proyectos ?? []).find((p) => p.id === projectId);
  const ordenes = proyecto?.orders ?? [];
  const pideProyecto = concept ? exigeProyecto(concept) : false;

  const delMes = celdas.filter((f) => f.slice(0, 7) === mesNum);
  const registrados = delMes.filter((f) => porFecha.get(f)?.conceptCode).length;
  /** Los huecos que YA pasaron: un dia futuro sin registrar no es un olvido. */
  const huecos = delMes.filter((f) => f <= hoy && !porFecha.get(f)?.conceptCode).length;

  const aplicar = () => {
    if (!concept || !sel.length) return;
    // Se comprueba aqui lo mismo que el motor, para dar un mensaje en vez de un 400.
    if (pideProyecto && !projectId) {
      setErr('PROYECTO_REQUERIDO');
      return;
    }
    setErr(null);
    setGuardando(true);
    putEntries(
      // La descripcion es la MISMA para toda la seleccion: es lo que distingue esta
      // pantalla del cajon, donde cada dia lleva la suya. Pintar tres semanas de
      // montaje es un solo trabajo dicho una vez.
      [...sel].sort().map((date) => ({ date, description: desc.trim() || null })),
      {
        projectId: projectId || null,
        orderId: orderId || null,
        extraOrderIds: [],
        conceptCode: concept,
        phase: null,
        inFactory: ADMITE_FABRICA.includes(concept) ? inFactory : false,
        // La nota del dia es de UN dia: repetirla en veintiuna filas del PDF seria
        // ruido impreso. Se pone desde el cajon, dia por dia.
        dayNote: null,
      },
    )
      .then(() => {
        showToast('saved');
        setSel([]);
        refresh();
      })
      .catch((e: unknown) => setErr(codigo(e)))
      .finally(() => setGuardando(false));
  };

  const mesLargo = new Date(`${mesActual}T00:00:00Z`).toLocaleDateString(
    state.lang === 'it' ? 'it-IT' : state.lang === 'pt' ? 'pt-BR' : 'es-CL',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row gap-4 items-start">
      {/* LA REJILLA */}
      <Card className="flex-1 min-w-0 w-full">
        <div className="flex items-end justify-between gap-3 flex-wrap p-4.5 border-b border-border">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[.12em] text-accent-brand">
              {t.lb_title}
            </div>
            {/* `first-letter:uppercase`: `toLocaleDateString` da «septiembre» en
                minuscula en es/it/pt, y el diseno lo pinta capitalizado. */}
            <div className="text-[26px] font-bold font-cond leading-tight mt-1 first-letter:uppercase">
              {mesLargo}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[21px] font-bold font-cond leading-none">{registrados}</div>
              <div className="text-[10.5px] text-muted-foreground">{t.lb_registered}</div>
            </div>
            <div className="text-right">
              <div className="text-[21px] font-bold font-cond leading-none text-warn">{huecos}</div>
              <div className="text-[10.5px] text-muted-foreground">{t.lb_gaps}</div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMes(sumarMeses(mesActual, -1))}
                aria-label={t.lb_prev}
                className="size-11 md:size-9"
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMes(sumarMeses(mesActual, 1))}
                aria-label={t.lb_next}
                className="size-11 md:size-9"
              >
                →
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4.5">
          <div className="grid grid-cols-7 gap-1.5 text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground mb-1.5">
            {t.days.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* El arrastre se suelta en el CONTENEDOR y no en cada celda: si el raton
              se levanta fuera de un dia, `pintando` se quedaria en true y la rejilla
              seguiria marcando sola. `onMouseLeave` cubre salir por el borde. */}
          <div
            className="grid grid-cols-7 gap-1.5"
            onMouseUp={() => setPintando(false)}
            onMouseLeave={() => setPintando(false)}
          >
            {celdas.map((f) => {
              const e = porFecha.get(f);
              const code = e?.conceptCode ?? null;
              const otroMes = f.slice(0, 7) !== mesNum;
              const marcado = sel.includes(f);
              const puede = editable(f);
              return (
                <button
                  key={f}
                  type="button"
                  disabled={!puede}
                  onMouseDown={() => {
                    setPintando(true);
                    alternar(f);
                  }}
                  onMouseEnter={() => pintar(f)}
                  // Doble clic = abrir ESE dia en el cajon. La rejilla pinta en bloque
                  // —una descripcion para toda la seleccion— y hay cosas que son de un
                  // solo dia: la nota, los gastos, las maquinas adicionales. Sin esto
                  // habia que ir a «Mi semana» y navegar hasta la semana correcta.
                  onDoubleClick={() => patch({ logOpen: true, logDate: f })}
                  // Por que un dia no se deja tocar. Sin el titulo, un dia futuro se
                  // ve igual que uno bloqueado por estar aprobado, y el tecnico no
                  // tiene forma de distinguirlos.
                  title={
                    puede
                      ? t.lb_open_day
                      : cerrado(f)
                        ? t.lb_locked
                        : f > data.maxDate
                          ? t.lb_future
                          : t.lb_too_old
                  }
                  aria-pressed={marcado}
                  aria-current={f === hoy ? 'date' : undefined}
                  className={`relative rounded-lg border-[1.5px] p-1.5 min-h-[62px] flex flex-col justify-between text-left transition-colors ${
                    marcado
                      ? 'border-accent-brand bg-accent-tint'
                      : code
                        ? 'border-transparent bg-muted hover:bg-surface-3'
                        : 'border-border bg-surface hover:bg-muted'
                  } ${otroMes ? 'opacity-40' : ''} ${
                    puede ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                  } ${f === hoy ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                >
                  <span className="text-[12px] font-bold font-cond">{diaDe(f)}</span>
                  {code ? (
                    // El color va en `style` porque Tailwind no puede generar una
                    // utilidad por cada color en tiempo de compilacion.
                    <span
                      className="text-[9.5px] font-bold font-mono px-1 py-px rounded self-start text-white"
                      style={{ background: CONCEPT_COLOR[code] ?? 'var(--primary)' }}
                    >
                      {code}
                    </span>
                  ) : (
                    <span className="text-[9.5px] text-muted-foreground">—</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[11.5px] text-muted-foreground mt-3.5">
            {sel.length ? (
              <>
                <span className="font-bold text-foreground">
                  {t.lb_selected.replace('{n}', String(sel.length))}
                </span>
                <span className="mx-2 text-border-2">·</span>
                {[...sel].sort().map(diaDe).join(', ')}
              </>
            ) : (
              t.lb_hint
            )}
            {/* Que el futuro no se registre es la regla del servidor (ventana =
                hoy + 14 h), no una limitacion de esta pantalla: nadie puede declarar
                el dia que todavia no ha trabajado. Decirlo aqui evita leer la rejilla
                gris como una averia. */}
            <div className="mt-1">{t.lb_future_note}</div>
          </div>
        </div>
      </Card>

      {/* EL TECLADO */}
      <div className="w-full md:w-[296px] md:flex-none flex flex-col gap-3.5">
        <Card>
          <div className="p-4 flex flex-col gap-3.5">
            <div className="text-[11.5px] font-bold uppercase tracking-[.05em]">
              {t.lb_apply_to}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {conceptos.map((c) => {
                const on = concept === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setConcept(c.code as ConceptCode)}
                    aria-pressed={on}
                    className={`rounded-lg border-[1.5px] px-2.5 py-2 min-h-14 text-left cursor-pointer transition-colors ${
                      on ? 'border-primary bg-primary-tint' : 'border-border bg-surface hover:bg-muted'
                    }`}
                  >
                    <span
                      className="font-mono text-[12.5px] font-semibold"
                      style={{ color: CONCEPT_COLOR[c.code] ?? 'var(--primary)' }}
                    >
                      {c.code}
                    </span>
                    <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">
                      {state.lang === 'it' ? c.labelIt : c.labelEs}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Proyecto y maquina SOLO si el concepto los pide: una incapacidad no
                tiene proyecto, y la CHECK del servidor lo rechazaria. */}
            {pideProyecto ? (
              <>
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-foreground">
                    {t.log_project}
                  </div>
                  <select
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      setOrderId(''); // la maquina es de OTRO proyecto: se limpia
                    }}
                    className={`${inputStyle} mt-1.5`}
                  >
                    <option value="">{t.log_pick_project}</option>
                    {(proyectos ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {ordenes.length ? (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-foreground">
                      {t.log_machine}
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {ordenes.map((o) => {
                        const on = orderId === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setOrderId(on ? '' : o.id)}
                            aria-pressed={on}
                            className={`rounded-full border px-2.5 py-1.5 min-h-9 text-[11.5px] font-mono cursor-pointer transition-colors ${
                              on
                                ? 'border-primary bg-primary-tint text-primary font-semibold'
                                : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {concept && ADMITE_FABRICA.includes(concept) ? (
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={inFactory}
                  onChange={(e) => setInFactory(e.target.checked)}
                  className="size-4"
                />
                {t.log_in_factory}
              </label>
            ) : null}

            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-foreground">
                {t.log_desc}
              </div>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                placeholder={t.lb_work_ph}
                className={`${inputStyle} mt-1.5 resize-none`}
              />
            </div>

            <Button
              onClick={aplicar}
              disabled={!concept || !sel.length || guardando}
              className="w-full min-h-11"
            >
              {sel.length
                ? t.lb_apply_n.replace('{n}', String(sel.length))
                : t.lb_apply_none}
            </Button>
            <div className="text-[10.5px] text-muted-foreground leading-relaxed text-center">
              {t.lb_one_per_day}
            </div>
          </div>
        </Card>
      </div>

      {/* Que el servidor rechace la escritura no es un campo mal escrito: es un cambio
          de plan («ese dia ya esta aprobado y lo tiene que reabrir un administrador»).
          Va en un aviso con el texto traducido, no con el codigo crudo. */}
      {err ? (
        <AvisoModal titulo={t.err_save} mensaje={errTexto(err)} onClose={() => setErr(null)} />
      ) : null}
    </div>
  );
}
