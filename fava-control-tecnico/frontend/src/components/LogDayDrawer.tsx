import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { hi } from '../icons';
import { CONCEPT_COLOR } from '../i18n';
import { FieldError, gbtn, pbtn } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getCatalogs } from '../lib/api/catalogs';
import { listProjects } from '../lib/api/projects';
import { getWeek, putEntry } from '../lib/api/dailyEntries';
import type { ConceptCode } from '../lib/api/dailyEntries';
import { hoyLocal } from '../lib/fecha';

const inp: CSSProperties = { width: '100%', padding: '12px 13px', minHeight: 'var(--tap)', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'max(15px, var(--fs-input))', fontFamily: 'inherit', outline: 'none' };
const errInp: CSSProperties = { ...inp, border: '1px solid var(--warn)', background: 'var(--warn-tint)' };

/**
 * Los conceptos que la CHECK `de_proyecto_por_concepto` deja ir SIN proyecto. Es la
 * misma lista que el motor: si se desincronizan, el servidor rechaza con un 23514 que
 * al técnico no le dice nada. Aquí sirve para no pedirle un proyecto que no tiene.
 */
const SIN_PROYECTO: ConceptCode[] = ['LR', 'NR', 'IL'];

/** «En Fabrica» solo tiene sentido en día completo y festivo: es su modificador. */
const ADMITE_FABRICA: ConceptCode[] = ['DC', 'DFD'];

export default function LogDayDrawer() {
  const { state, t, patch, showToast, refresh } = useApp();
  const [fecha, setFecha] = useState(state.logDate ?? hoyLocal());
  const [projectId, setProjectId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [concept, setConcept] = useState<ConceptCode>('DC');
  const [inFactory, setInFactory] = useState(false);
  const [desc, setDesc] = useState('');
  const [descError, setDescError] = useState(false);
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
    setDesc(existente.description ?? '');
  }, [existente]);

  const close = () => patch({ logOpen: false, logDate: null });

  const proyecto = (proyectos ?? []).find((p) => p.id === projectId);
  // `orders` solo viaja en la proyección del técnico; para un admin el listado trae
  // otra forma, así que se lee con cuidado en vez de asumir.
  const ordenes = ((proyecto as unknown as { orders?: { id: string; label: string; commessaShort: string | null }[] })?.orders) ?? [];
  const exigeProyecto = !SIN_PROYECTO.includes(concept);

  const save = () => {
    if (!desc.trim()) {
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
    putEntry(fecha, {
      projectId: projectId || null,
      // La orden es opcional aunque haya proyecto: puede no estar creada todavía, y
      // bloquear la captura por eso dejaría al técnico sin poder registrar su día.
      orderId: orderId || null,
      conceptCode: concept,
      phase: null,
      inFactory: ADMITE_FABRICA.includes(concept) ? inFactory : false,
      description: desc.trim(),
    })
      .then(() => {
        close();
        refresh();
        showToast('saved');
      })
      .catch((e: unknown) => setErrApi(codigo(e)))
      .finally(() => setGuardando(false));
  };

  const field = (label: string, el: ReactNode, err?: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
      {el}
      {err ? <FieldError msg={t.field_req} /> : null}
    </div>
  );

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'favaIn .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: '20px 20px 0 0', boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto', animation: 'favaIn .28s ease both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--border-2)' }} />
        </div>
        <div style={{ padding: '6px 22px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{t.log_title}</div>
              {existente ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{t.log_editing}</div>
              ) : null}
            </div>
            <button onClick={close} style={{ ...gbtn, padding: '8px 10px' }}>{hi('x', { w: 15 })}</button>
          </div>

          {field(
            t.log_date,
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inp} />,
          )}

          {field(
            t.log_project,
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setOrderId(''); }} style={inp}>
              <option value="">{exigeProyecto ? t.log_pick_project : t.log_no_project}</option>
              {(proyectos ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ordenes.map((o) => {
                    const on = orderId === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setOrderId(on ? '' : o.id)}
                        style={{ flex: '1 1 120px', padding: 11, minHeight: 'var(--tap)', border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border-2)'), background: on ? 'var(--primary-tint)' : 'var(--surface-2)', color: on ? 'var(--primary)' : 'var(--text-2)', borderRadius: 10, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'Roboto Mono' }}
                      >
                        {o.label}
                        {o.commessaShort ? (
                          <span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>{o.commessaShort}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t.log_no_machines}</div>
              ),
            )
          ) : null}

          {field(
            t.log_concept,
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {conceptos.map((c) => {
                const on = concept === c.code;
                const color = CONCEPT_COLOR[c.code] ?? 'var(--primary)';
                return (
                  <button
                    key={c.code}
                    onClick={() => setConcept(c.code as ConceptCode)}
                    title={state.lang === 'it' ? c.labelIt : c.labelEs}
                    style={{ padding: '10px 4px', minHeight: 'var(--tap)', border: '1px solid ' + (on ? color : 'var(--border-2)'), background: on ? color : 'var(--surface-2)', color: on ? '#fff' : 'var(--text-2)', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Roboto Mono' }}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>,
          )}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '-6px 0 14px' }}>
            {(() => {
              const c = conceptos.find((x) => x.code === concept);
              return c ? (state.lang === 'it' ? c.labelIt : c.labelEs) : '';
            })()}
          </div>

          {/* Modificador, no concepto: el catálogo cerrado son 8 y «En Fabrica» duplicaría
              DC y DFD si fuese uno más. */}
          {ADMITE_FABRICA.includes(concept) ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, minHeight: 'var(--tap)', cursor: 'pointer' }}>
              <input type="checkbox" checked={inFactory} onChange={(e) => setInFactory(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span style={{ fontSize: 13.5 }}>{t.log_in_factory}</span>
            </label>
          ) : null}

          {field(
            t.log_desc,
            <textarea
              value={desc}
              onChange={(e) => {
                setDesc(e.target.value);
                if (descError && e.target.value.trim()) setDescError(false);
              }}
              placeholder={t.log_desc_ph}
              style={{ ...(descError ? errInp : inp), minHeight: 96, resize: 'vertical' }}
            />,
            descError,
          )}

          {errApi ? <FieldError msg={`${t.err_save}: ${errApi}`} /> : null}

          <button
            onClick={save}
            disabled={guardando}
            style={{ ...pbtn, width: '100%', padding: 14, fontSize: 15, justifyContent: 'center', opacity: guardando ? 0.6 : 1 }}
          >
            {guardando ? t.loading : t.btn_saveday}
          </button>
        </div>
      </div>
    </div>
  );
}
