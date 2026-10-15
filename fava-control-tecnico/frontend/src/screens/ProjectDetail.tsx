import { Fragment, useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ApiState, inputStyle, money, nf, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import { activos, getCatalogs } from '../lib/api/catalogs';
import { createOrder, deleteOrder, getExecutedDays, getProject, setSoldDays, updateOrder, updateProject, vePrecios } from '../lib/api/projects';
import type { ExecutedDay, MatrixRow, Order, Phase, Project, ProjectInput } from '../lib/api/projects';

/** Los campos de texto de la cabecera que se editan en sitio (los 7 de la Nota + horas). */
const CABECERA = ['name', 'clientName', 'clientNit', 'locality', 'country', 'supply', 'contractNumber'] as const;
type Cabecera = Record<(typeof CABECERA)[number] | 'normalHours', string>;
type FormOrden = { label: string; commessa: string; oaNumber: string; machineModel: string; contractValue: string; currencyCode: string };

const aCabecera = (p: Project): Cabecera => ({
  name: p.name,
  clientName: p.clientName,
  clientNit: p.clientNit ?? '',
  locality: p.locality,
  country: p.country,
  supply: p.supply,
  contractNumber: p.contractNumber,
  normalHours: p.normalHours == null ? '' : String(p.normalHours),
});

/**
 * Una celda se identifica por (orden, rol, fase). La orden entra en la clave desde la
 * Fase 2.1: dos máquinas del mismo proyecto tienen matrices independientes y sin ella
 * el autoguardado de una pisaría la celda equivalente de la otra.
 */
const clave = (orderId: string, r: MatrixRow) => `${orderId}|${r.roleTypeId}|${r.phase ?? ''}`;

export default function ProjectDetail() {
  const { state, t, go, showToast, errTexto } = useApp();
  const movil = useIsMobile();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [celdas, setCeldas] = useState<Record<string, 'saving' | 'error'>>({});
  const [errOrden, setErrOrden] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ label: '', commessa: '', oaNumber: '', machineModel: '' });
  /** Formulario de la cabecera abierto (null = solo lectura). */
  const [cab, setCab] = useState<Cabecera | null>(null);
  /** La orden en edición y su formulario; una a la vez. */
  const [edOrden, setEdOrden] = useState<{ id: string; f: FormOrden } | null>(null);
  const [errCab, setErrCab] = useState<string | null>(null);
  /**
   * Filas de la matriz reveladas a mano por orden. Una fila a cero en todo (vendido y
   * ejecutado, las dos fases) se OCULTA: el catálogo trae todos los tipos y en un
   * proyecto con cuatro vendidos los otros cinco son ruido. «Quitar» una fila es
   * ponerla a cero, no hay otro estado que guardar. Esto solo vive en la pantalla.
   */
  const [reveladas, setReveladas] = useState<Record<string, string[]>>({});
  /** Casillas de «ejecutado» abiertas, por clave (orden|rol|fase). */
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  /** Se piden al abrir la PRIMERA casilla, no con el detalle: la mayoría de visitas no las usa. */
  const [jornadas, setJornadas] = useState<ExecutedDay[] | null>(null);

  const id = state.selProject;
  const { data, setData, error } = useApiData(async () => {
    if (!id) return null;
    const [p, cat] = await Promise.all([getProject(id), getCatalogs()]);
    return { p, machineModels: cat.machineModels, currencies: cat.currencies };
  }, [id, state.dataVersion]);

  if (!id) return <ApiState error={null} label={t.proj_pick} />;
  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const p = data.p;

  /** El total del proyecto es la SUMA de sus órdenes; no existe como columna. */
  const total = p.orders.reduce((s, o) => s + (o.contractValue ?? 0), 0);
  const monedas = new Set(p.orders.map((o) => o.currencyCode).filter(Boolean));
  const moneda = monedas.size === 1 ? [...monedas][0]! : '';

  /**
   * Autoguardado por celda: al salir del campo. Si el valor no cambió NO se escribe
   * (evita la escritura y el ruido en el audit_log de la Fase 4); si el guardado falla
   * la celda vuelve al valor anterior y avisa.
   */
  const guardarCelda = (orderId: string, fila: MatrixRow, texto: string) => {
    const k = clave(orderId, fila);
    const olvidar = () => setEdits(({ [k]: _, ...resto }) => resto);
    const n = Number.parseInt(texto, 10);
    // El bucket sin fase es histórico del Excel: se lee, no se edita (el PUT exige fase).
    if (fila.phase === null || !Number.isInteger(n) || n < 0 || n === fila.sold) {
      olvidar();
      return;
    }
    setCeldas((c) => ({ ...c, [k]: 'saving' }));
    setSoldDays(orderId, { roleTypeId: fila.roleTypeId, phase: fila.phase, soldDays: n })
      .then((celda) => {
        // El delta llega calculado del servidor: la pantalla no resta nunca.
        setData((d) => d && {
          ...d,
          p: {
            ...d.p,
            orders: d.p.orders.map((o) => (o.id !== orderId ? o : {
              ...o,
              matrix: o.matrix.map((r) => (clave(orderId, r) === k
                ? { ...r, sold: celda.sold, executed: celda.executed, delta: celda.delta }
                : r)),
            })),
          },
        });
        olvidar();
        setCeldas(({ [k]: _, ...resto }) => resto);
      })
      .catch(() => {
        olvidar(); // revertir: el input vuelve a pintar el valor cargado
        setCeldas((c) => ({ ...c, [k]: 'error' }));
        showToast('error');
      });
  };

  /** Pone a cero el vendido de las dos fases y la fila desaparece sola (ver `reveladas`). */
  const quitarFila = (o: Order, roleTypeId: string) => {
    for (const fila of o.matrix) if (fila.roleTypeId === roleTypeId && fila.sold > 0) guardarCelda(o.id, fila, '0');
    setReveladas((r) => ({ ...r, [o.id]: (r[o.id] ?? []).filter((x) => x !== roleTypeId) }));
  };

  const abrir = (k: string) => {
    setAbiertas((a) => ({ ...a, [k]: !a[k] }));
    if (!jornadas) getExecutedDays(p.id).then(setJornadas).catch((e: unknown) => setErrOrden(codigo(e)));
  };

  /** El número de «ejecutado», pulsable si hay días detrás. */
  const ejecutado = (k: string, n: number) =>
    n > 0 ? (
      <button type="button" onClick={() => abrir(k)} aria-expanded={!!abiertas[k]} title={t.exec_detail}
        className="font-mono font-semibold underline decoration-dotted underline-offset-4 hover:text-primary min-h-11 md:min-h-6 px-1">
        {n}
      </button>
    ) : n;

  /**
   * Quién fue y qué días: la pivot del Excel (reunión 2026-10-14). Agrupado por técnico.
   * Filtra en el cliente la lista del servidor, que ya viene con el filtro de la matriz.
   */
  const detalle = (orderId: string | null, roleTypeId: string, phase: Phase | null) => {
    if (!jornadas) return <div className="text-xs text-muted-foreground">{t.loading}</div>;
    const mias = jornadas.filter((j) => j.orderId === orderId && j.roleTypeId === roleTypeId && j.phase === phase);
    const porTecnico = new Map<string, ExecutedDay[]>();
    for (const j of mias) porTecnico.set(j.technician, [...(porTecnico.get(j.technician) ?? []), j]);
    const dia = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4);
    return (
      <div className="rounded-md bg-muted/60 p-3 flex flex-col gap-2.5 text-[12.5px]">
        {[...porTecnico].map(([nombre, dias]) => (
          <div key={nombre}>
            <div className="font-semibold">{nombre} · <span className="font-mono">{dias.length}</span> {t.exec_days}</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {dias.map((j) => (
                <span key={j.date} title={j.description ?? ''} className="font-mono text-[11.5px] bg-card border border-border rounded px-1.5 py-0.5">
                  {dia(j.date)}{j.concept ? ` ${j.concept}` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const matriz = (o: Order, filas: MatrixRow[], quitables: Set<string>) => (
    <table className="w-full border-collapse text-[13px] mt-1.5">
      <thead>
        <tr>
          {[t.role_type, t.kpi_sold, t.kpi_done, t.kpi_delta].map((c, i) => (
            <th key={i} className={`${th} ${i ? 'text-center' : 'text-left'}`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => {
          const k = clave(o.id, fila);
          const estado = celdas[k];
          return (
            <Fragment key={k}>
            <tr className={`border-t border-border ${fila.roleTypeActive ? '' : 'opacity-60'}`}>
              <td className={`${td} font-semibold`}>
                <span className="inline-flex items-center gap-1">
                  {fila.roleTypeName}
                  {quitables.has(fila.roleTypeId) ? (
                    <button
                      type="button"
                      onClick={() => quitarFila(o, fila.roleTypeId)}
                      aria-label={t.matrix_remove_role}
                      title={t.matrix_remove_role}
                      className="no-print text-muted-foreground hover:text-warn px-1 min-h-11 md:min-h-6"
                    >
                      {hi('x', { w: 12 })}
                    </button>
                  ) : null}
                </span>
              </td>
              <td className={`${td} text-center`}>
                <span className="inline-flex items-center gap-1.5">
                  <input
                    value={edits[k] ?? String(fila.sold)}
                    onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                    onBlur={(e) => guardarCelda(o.id, fila, e.target.value)}
                    className={`print-plain w-11 text-center rounded-md px-1 py-1 bg-muted text-foreground font-mono text-[13px] font-semibold border outline-none focus:border-primary ${
                      estado === 'error' ? 'border-warn' : 'border-input'
                    }`}
                  />
                  <span
                    title={estado === 'error' ? t.err_save : ''}
                    className={`size-1.5 rounded-full ${
                      estado === 'saving' ? 'bg-info' : estado === 'error' ? 'bg-warn' : 'bg-transparent'
                    }`}
                  />
                </span>
              </td>
              <td className={`${td} text-center font-mono font-semibold`}>{ejecutado(k, fila.executed)}</td>
              <td className={`${td} text-center font-mono font-bold ${fila.delta < 0 ? 'text-warn' : 'text-ok'}`}>
                {(fila.delta > 0 ? '+' : '') + fila.delta}
              </td>
            </tr>
            {abiertas[k] ? (
              <tr><td colSpan={4} className="px-3 pb-3">{detalle(o.id, fila.roleTypeId, fila.phase)}</td></tr>
            ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  const anadirOrden = () => {
    if (!nueva.label.trim()) return;
    setErrOrden(null);
    createOrder(p.id, {
      label: nueva.label.trim(),
      commessa: nueva.commessa.trim() || null,
      // Los 4 primeros dígitos son como se nombra la máquina en obra («3428»).
      commessaShort: nueva.commessa.trim().slice(0, 4) || null,
      oaNumber: nueva.oaNumber.trim() || null,
      // El CODIGO, no el id: el servidor lo busca en el catalogo y lo crea si no existe.
      machineModel: nueva.machineModel.trim() || null,
    })
      .then((o) => {
        setData((d) => d && { ...d, p: { ...d.p, orders: [...d.p.orders, { ...o, matrix: [] }] } });
        setNueva({ label: '', commessa: '', oaNumber: '', machineModel: '' });
      })
      .catch((e: unknown) => setErrOrden(codigo(e)));
  };

  /** El servidor se niega si tiene bitácora o días vendidos: aquí solo se confirma. */
  const quitarOrden = (orderId: string) => {
    if (!window.confirm(t.order_delete_warn)) return;
    setErrOrden(null);
    deleteOrder(orderId)
      .then(() => setData((d) => d && {
        ...d,
        p: { ...d.p, orders: d.p.orders.filter((o) => o.id !== orderId) },
      }))
      .catch((e: unknown) => setErrOrden(codigo(e)));
  };

  /**
   * La fase EN CURSO. Es la que heredan los días que se registren desde ahora. Desde
   * 2026-10 la declara el TÉCNICO desde su bitácora (marcar collaudo en un día la mueve
   * hacia delante, ver daily-entries.service.ts); este selector queda para corregir
   * desde Admin, en las dos direcciones. Los días ya escritos conservan la suya.
   */
  const cambiarFase = (fase: Phase) =>
    updateProject(p.id, { currentPhase: fase })
      .then(() => {
        setData((d) => d && { ...d, p: { ...d.p, currentPhase: fase } });
        showToast('proj_saved');
      })
      .catch((e: unknown) => setErrOrden(codigo(e)));

  /** El precio es solo del rol A: sin el, la fila del contrato no existe (el servidor
      tampoco manda el importe de las ordenes, asi que `cabeceraOrden` lo omite sola). */
  const precios = vePrecios(state.myRoles);
  const divisas = activos(data.currencies);

  /**
   * Cabecera editable en sitio: mismo PATCH que la fase. NIT y horas son opcionales
   * (vacío = null); el resto el servidor lo exige no vacío, igual que al crear.
   */
  const guardarCabecera = () => {
    if (!cab) return;
    // Solo lo que CAMBIO. Los 20 proyectos migrados del Excel tienen localidad, pais,
    // suministro y contrato vacios; mandarlos enteros obligaba a rellenar los cuatro
    // para corregir una letra del nombre (el servidor exige no vacio campo a campo).
    const antes = aCabecera(p);
    const body: Partial<ProjectInput> = {};
    for (const k of CABECERA) if (cab[k].trim() !== antes[k]) body[k] = cab[k].trim();
    if (cab.clientNit.trim() !== antes.clientNit) body.clientNit = cab.clientNit.trim() || null;
    const h = cab.normalHours.trim();
    if (h !== antes.normalHours) body.normalHours = h === '' ? null : Number.parseInt(h, 10);
    if (!Object.keys(body).length) {
      setCab(null);
      return;
    }
    setErrCab(null);
    updateProject(p.id, body)
      .then((q) => {
        setData((d) => d && { ...d, p: { ...d.p, ...q, orders: d.p.orders, unassigned: d.p.unassigned } });
        setCab(null);
        showToast('proj_saved');
      })
      .catch((e: unknown) => setErrCab(codigo(e)));
  };

  const abrirOrden = (o: Order) =>
    setEdOrden({
      id: o.id,
      f: {
        label: o.label,
        commessa: o.commessa ?? '',
        oaNumber: o.oaNumber ?? '',
        machineModel: data.machineModels.find((m) => m.id === o.machineModelId)?.code ?? '',
        contractValue: o.contractValue == null ? '' : String(o.contractValue),
        currencyCode: o.currencyCode ?? divisas[0]?.code ?? '',
      },
    });

  /** PATCH de la orden: el modelo va por CODIGO (se crea si no existe), como al añadir. */
  const guardarOrden = () => {
    if (!edOrden || !edOrden.f.label.trim()) return;
    const f = edOrden.f;
    const valor = Number.parseInt(f.contractValue.replace(/[^0-9]/g, ''), 10);
    setErrOrden(null);
    updateOrder(edOrden.id, {
      label: f.label.trim(),
      commessa: f.commessa.trim() || null,
      commessaShort: f.commessa.trim().slice(0, 4) || null,
      oaNumber: f.oaNumber.trim() || null,
      machineModel: f.machineModel.trim() || null,
      // Sin rol A el importe no viaja: el servidor lo rechazaría (PRECIO_SOLO_ADMIN).
      ...(precios
        ? { contractValue: Number.isInteger(valor) ? valor : null, currencyCode: f.currencyCode || null }
        : {}),
    })
      .then((o) => {
        setData((d) => d && {
          ...d,
          p: { ...d.p, orders: d.p.orders.map((x) => (x.id === o.id ? { ...x, ...o } : x)) },
        });
        setEdOrden(null);
        showToast('proj_saved');
      })
      .catch((e: unknown) => setErrOrden(codigo(e)));
  };

  const campo = (label: string, v: string, set: (s: string) => void, mono = false, list?: string) => (
    <label className="block flex-1 min-w-[140px]">
      <span className="block text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <input list={list} value={v} onChange={(e) => set(e.target.value)} className={`${inputStyle} mt-0.5 ${mono ? 'font-mono' : ''}`} />
    </label>
  );

  const formOrden = (o: Order) => {
    if (!edOrden || edOrden.id !== o.id) return null;
    const f = edOrden.f;
    const set = (k: keyof FormOrden) => (v: string) => setEdOrden({ id: o.id, f: { ...f, [k]: v } });
    return (
      <div className="flex gap-2 flex-wrap items-end w-full">
        {campo(t.order_label, f.label, set('label'))}
        {campo(t.order_commessa, f.commessa, set('commessa'), true)}
        {campo(t.order_oa, f.oaNumber, set('oaNumber'), true)}
        {campo(t.order_model, f.machineModel, set('machineModel'), true, 'modelos-maquina')}
        {precios ? (
          <>
            {campo(t.proj_value, f.contractValue, set('contractValue'), true)}
            <label className="block">
              <span className="block text-[11px] text-muted-foreground uppercase tracking-wide">{t.proj_cur}</span>
              <select value={f.currencyCode} onChange={(e) => set('currencyCode')(e.target.value)} className={`${inputStyle} mt-0.5`}>
                {divisas.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </label>
          </>
        ) : null}
        <Button variant="outline" onClick={() => setEdOrden(null)} className="min-h-11 md:min-h-9">{t.btn_cancel}</Button>
        <Button onClick={guardarOrden} disabled={!f.label.trim()} className="min-h-11 md:min-h-9">{t.btn_save}</Button>
      </div>
    );
  };
  const metas: [string, string][] = [
    ...(precios ? [[t.contract, total === 0 ? '—' : money(total, moneda)] as [string, string]] : []),
    [t.proj_hours, nf(p.normalHours || 0) + ' h'],
    [t.proj_locality, p.locality],
    [t.proj_supply, p.supply],
    [t.proj_contract_no, p.contractNumber],
    [t.proj_nit, p.clientNit ?? '—'],
  ];

  /** Cabecera de una orden: es la línea que Andrea busca para ubicar el trabajo. */
  const cabeceraOrden = (o: Order) => (
    <div className="flex gap-3.5 flex-wrap items-baseline">
      <span className="font-bold text-[15px]">{o.label}</span>
      {o.commessa ? (
        <span className="font-mono text-[12.5px] text-primary">
          {t.order_commessa} {o.commessa}
        </span>
      ) : null}
      {o.oaNumber ? <span className="font-mono text-[12.5px] text-muted-foreground">{o.oaNumber}</span> : null}
      {o.contractValue != null ? (
        <span className="font-mono text-[12.5px] font-semibold">{money(o.contractValue, o.currencyCode ?? '')}</span>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 max-w-[1000px]">
      <div className="no-print flex gap-2 justify-between">
        <Button variant="outline" onClick={() => go('projects')} className="min-h-11 md:min-h-9">
          ← {t.t_projects}
        </Button>
        {/* «Como una impresión de pantalla» (Andrea, 2026-10-14): el navegador guarda la
            página como PDF. Los detalles por técnico abiertos salen también. */}
        <Button variant="outline" onClick={() => window.print()} className="min-h-11 md:min-h-9">
          {hi('download', { w: 15 })} {t.proj_pdf}
        </Button>
      </div>

      <Card>
        <CardContent className="flex gap-6 flex-wrap items-center">
          {cab ? (
            <div className="flex gap-3 flex-wrap items-end w-full">
              {campo(t.proj_name, cab.name, (v) => setCab({ ...cab, name: v }))}
              {campo(t.client, cab.clientName, (v) => setCab({ ...cab, clientName: v }))}
              {campo(t.proj_nit, cab.clientNit, (v) => setCab({ ...cab, clientNit: v }), true)}
              {campo(t.proj_locality, cab.locality, (v) => setCab({ ...cab, locality: v }))}
              {campo(t.proj_country, cab.country, (v) => setCab({ ...cab, country: v }))}
              {campo(t.proj_supply, cab.supply, (v) => setCab({ ...cab, supply: v }))}
              {campo(t.proj_contract_no, cab.contractNumber, (v) => setCab({ ...cab, contractNumber: v }), true)}
              {campo(t.proj_hours, cab.normalHours, (v) => setCab({ ...cab, normalHours: v.replace(/\D/g, '') }), true)}
              <Button variant="outline" onClick={() => setCab(null)} className="min-h-11 md:min-h-9">{t.btn_cancel}</Button>
              <Button onClick={guardarCabecera} className="min-h-11 md:min-h-9">{t.btn_save}</Button>
              {errCab ? <div className="text-xs text-warn w-full">{errTexto(errCab)}</div> : null}
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-[220px]">
                <div className="text-xl font-bold flex items-center gap-2">
                  {p.name}
                  <Button variant="ghost" size="icon" onClick={() => setCab(aCabecera(p))} aria-label={t.cat_edit} title={t.cat_edit} className="no-print size-8">
                    {hi('pencil', { w: 15 })}
                  </Button>
                </div>
                <div className="text-[13px] text-muted-foreground mt-0.5">{p.clientName} · {p.country}</div>
              </div>
              {metas.map(([a, b], i) => (
                <div key={a}>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{a}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${i ? 'font-mono' : ''}`}>{b}</div>
                </div>
              ))}
            </>
          )}
          <label className="block" title={t.proj_phase_hint}>
            <span className="block text-[11px] text-muted-foreground uppercase tracking-wide">{t.proj_phase}</span>
            <select
              value={p.currentPhase}
              onChange={(e) => cambiarFase(e.target.value as Phase)}
              className={`${inputStyle} mt-0.5 min-h-11 md:min-h-9 py-1`}
            >
              <option value="MONTAJE">{t.montaje}</option>
              <option value="COLLAUDO">{t.colaudo}</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <Card className="no-print p-0 gap-0 overflow-hidden">
        <CardHeader className="border-b p-4">
          <CardTitle>{t.orders}</CardTitle>
        </CardHeader>
        <CardContent className="p-4.5 flex gap-2 flex-wrap items-center">
          <input
            value={nueva.label}
            onChange={(e) => setNueva({ ...nueva, label: e.target.value })}
            placeholder={t.order_label}
            className={`${inputStyle} flex-[2_1_200px]`}
          />
          <input
            value={nueva.commessa}
            onChange={(e) => setNueva({ ...nueva, commessa: e.target.value })}
            placeholder={t.order_commessa}
            className={`${inputStyle} flex-[1_1_110px] font-mono`}
          />
          <input
            value={nueva.oaNumber}
            onChange={(e) => setNueva({ ...nueva, oaNumber: e.target.value })}
            placeholder={t.order_oa}
            className={`${inputStyle} flex-[1_1_110px] font-mono`}
          />
          {/* Se ESCRIBE, con el catálogo como sugerencia (datalist), en vez de un
              desplegable cerrado. En la capacitación del 31-ago Andrea se quedó
              atascada aquí: la máquina del proyecto nuevo no estaba en el catálogo y
              crear el proyecto exigía irse a Configuración, darla de alta y volver. Un
              modelo nuevo se crea solo, en el servidor, si el código no existe.
              Sigue siendo opcional: hay alcances que no son un modelo («PC 4000 + 4 SILOS»). */}
          <input
            list="modelos-maquina"
            value={nueva.machineModel}
            onChange={(e) => setNueva({ ...nueva, machineModel: e.target.value })}
            placeholder={t.order_model_ph}
            className={`${inputStyle} flex-[1_1_140px] font-mono`}
          />
          <datalist id="modelos-maquina">
            {data.machineModels.filter((m) => m.isActive).map((m) => (
              <option key={m.id} value={m.code} />
            ))}
          </datalist>
          <Button onClick={anadirOrden} disabled={!nueva.label.trim()} className="min-h-11 md:min-h-9">
            {hi('plus', { w: 14 })} {t.order_add}
          </Button>
          {errOrden ? <div className="text-xs text-warn w-full">{errTexto(errOrden)}</div> : null}
        </CardContent>
      </Card>

      {p.orders.length === 0 ? (
        <Card>
          <CardContent className="text-[13px] text-muted-foreground">{t.order_none}</CardContent>
        </Card>
      ) : null}

      {/* Una tarjeta por máquina contratada, como los bloques de la hoja del Excel:
          JAV pinta tres matrices vendido/ejecutado independientes. */}
      {p.orders.map((o) => {
        const sinFase = o.matrix.filter((r) => r.phase === null);
        // Visible = tiene algún dato en cualquier fase, o la reveló el usuario ahora.
        const visibles = new Set([
          ...o.matrix.filter((r) => r.sold > 0 || r.executed > 0).map((r) => r.roleTypeId),
          ...(reveladas[o.id] ?? []),
        ]);
        const de = (phase: Phase) => o.matrix.filter((r) => r.phase === phase && visibles.has(r.roleTypeId));
        // Con días ejecutados no se quita: la bitácora manda y la fila tiene que cuadrar.
        const conEjecutado = new Set(o.matrix.filter((r) => r.executed > 0).map((r) => r.roleTypeId));
        const quitables = new Set([...visibles].filter((id) => !conEjecutado.has(id)));
        const ocultas = o.matrix
          .filter((r) => r.phase === 'MONTAJE' && r.roleTypeActive && !visibles.has(r.roleTypeId))
          .map((r) => ({ id: r.roleTypeId, name: r.roleTypeName }));
        return (
          <Card key={o.id} className="p-0 gap-0 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap border-b p-4">
              {edOrden?.id === o.id ? formOrden(o) : (
                <>
                  <CardTitle>{cabeceraOrden(o)}</CardTitle>
                  <div className="no-print flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => abrirOrden(o)} className="min-h-11 md:min-h-8 text-[12.5px]">
                      {hi('pencil', { w: 13 })} {t.cat_edit}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => quitarOrden(o.id)} className="min-h-11 md:min-h-8 text-[12.5px]">
                      {t.order_delete}
                    </Button>
                  </div>
                </>
              )}
            </CardHeader>
            <CardContent className={`p-0 grid ${movil ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div className={`p-4.5 ${movil ? 'border-b border-border' : 'border-r border-border'}`}>
                <div className="text-xs font-bold text-primary uppercase tracking-wide">{t.montaje}</div>
                {matriz(o, de('MONTAJE'), quitables)}
              </div>
              <div className="p-4.5">
                <div className="text-xs font-bold text-accent-brand uppercase tracking-wide">{t.colaudo}</div>
                {matriz(o, de('COLLAUDO'), quitables)}
              </div>
            </CardContent>
            {ocultas.length ? (
              <div className="no-print px-4.5 py-3 border-t border-border">
                <select
                  value=""
                  onChange={(e) => e.target.value && setReveladas((r) => ({ ...r, [o.id]: [...(r[o.id] ?? []), e.target.value] }))}
                  className={`${inputStyle} w-auto min-h-11 md:min-h-9 py-1`}
                >
                  <option value="">{t.matrix_add_role}</option>
                  {ocultas.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            ) : null}
            {sinFase.length ? (
              <div className="px-4.5 py-3 border-t border-border">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t.matrix_no_phase}</div>
                <table className="w-full border-collapse text-[13px] mt-1.5">
                  <tbody>
                    {sinFase.map((fila) => {
                      const k = clave(o.id, fila);
                      return (
                        <Fragment key={k}>
                          <tr className="border-t border-border">
                            <td className={`${td} font-semibold`}>{fila.roleTypeName}</td>
                            <td className={`${td} text-center font-mono`}>{fila.sold}</td>
                            <td className={`${td} text-center font-mono font-semibold`}>{ejecutado(k, fila.executed)}</td>
                            <td className={`${td} text-center font-mono font-bold ${fila.delta < 0 ? 'text-warn' : 'text-ok'}`}>
                              {(fila.delta > 0 ? '+' : '') + fila.delta}
                            </td>
                          </tr>
                          {abiertas[k] ? (
                            <tr><td colSpan={4} className="px-3 pb-3">{detalle(o.id, fila.roleTypeId, null)}</td></tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        );
      })}

      {/* Los días aprobados que no dicen a qué máquina fueron. Se muestran en vez de
          repartirse: repartir a ojo es el trabajo manual que esta app elimina. */}
      {p.unassigned.length ? (
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between border-b p-4">
            <CardTitle>{t.unassigned}</CardTitle>
            <span className="text-xs text-muted-foreground">{t.unassigned_hint}</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {p.unassigned.map((f) => {
                  const k = `|${f.roleTypeId}|${f.phase ?? ''}`;
                  return (
                    <Fragment key={k}>
                      <TableRow>
                        <TableCell className="font-semibold">{f.roleTypeName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {f.phase === null ? t.matrix_no_phase : f.phase === 'MONTAJE' ? t.montaje : t.colaudo}
                        </TableCell>
                        <TableCell className="text-center font-mono font-bold text-warn">{ejecutado(k, f.executed)}</TableCell>
                      </TableRow>
                      {abiertas[k] ? (
                        <TableRow><TableCell colSpan={3}>{detalle(null, f.roleTypeId, f.phase)}</TableCell></TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
