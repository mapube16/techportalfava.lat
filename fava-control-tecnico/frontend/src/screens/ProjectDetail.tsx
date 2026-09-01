import { useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ApiState, inputStyle, money, nf, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getCatalogs } from '../lib/api/catalogs';
import { createOrder, deleteOrder, getProject, setSoldDays } from '../lib/api/projects';
import type { MatrixRow, Order, Phase } from '../lib/api/projects';

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

  const id = state.selProject;
  const { data, setData, error } = useApiData(async () => {
    if (!id) return null;
    const [p, cat] = await Promise.all([getProject(id), getCatalogs()]);
    return { p, machineModels: cat.machineModels };
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

  const matriz = (orderId: string, filas: MatrixRow[]) => (
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
          const k = clave(orderId, fila);
          const estado = celdas[k];
          return (
            <tr key={k} className={`border-t border-border ${fila.roleTypeActive ? '' : 'opacity-60'}`}>
              <td className={`${td} font-semibold`}>{fila.roleTypeName}</td>
              <td className={`${td} text-center`}>
                <span className="inline-flex items-center gap-1.5">
                  <input
                    value={edits[k] ?? String(fila.sold)}
                    onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                    onBlur={(e) => guardarCelda(orderId, fila, e.target.value)}
                    className={`w-11 text-center rounded-md px-1 py-1 bg-muted text-foreground font-mono text-[13px] font-semibold border outline-none focus:border-primary ${
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
              <td className={`${td} text-center font-mono font-semibold`}>{fila.executed}</td>
              <td className={`${td} text-center font-mono font-bold ${fila.delta < 0 ? 'text-warn' : 'text-ok'}`}>
                {(fila.delta > 0 ? '+' : '') + fila.delta}
              </td>
            </tr>
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

  const metas: [string, string][] = [
    [t.contract, total === 0 ? '—' : money(total, moneda)],
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
      <Button variant="outline" onClick={() => go('projects')} className="self-start min-h-11 md:min-h-9">
        ← {t.t_projects}
      </Button>

      <Card>
        <CardContent className="flex gap-6 flex-wrap items-center">
          <div className="flex-1 min-w-[220px]">
            <div className="text-xl font-bold">{p.name}</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">{p.clientName} · {p.country}</div>
          </div>
          {metas.map(([a, b], i) => (
            <div key={a}>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{a}</div>
              <div className={`text-sm font-semibold mt-0.5 ${i ? 'font-mono' : ''}`}>{b}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="p-0 gap-0 overflow-hidden">
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
        const de = (phase: Phase) => o.matrix.filter((r) => r.phase === phase);
        return (
          <Card key={o.id} className="p-0 gap-0 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b p-4">
              <CardTitle>{cabeceraOrden(o)}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => quitarOrden(o.id)} className="min-h-11 md:min-h-8 text-[12.5px] shrink-0">
                {t.order_delete}
              </Button>
            </CardHeader>
            <CardContent className={`p-0 grid ${movil ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div className={`p-4.5 ${movil ? 'border-b border-border' : 'border-r border-border'}`}>
                <div className="text-xs font-bold text-primary uppercase tracking-wide">{t.montaje}</div>
                {matriz(o.id, de('MONTAJE'))}
              </div>
              <div className="p-4.5">
                <div className="text-xs font-bold text-accent-brand uppercase tracking-wide">{t.colaudo}</div>
                {matriz(o.id, de('COLLAUDO'))}
              </div>
            </CardContent>
            {sinFase.length ? (
              <div className="px-4.5 py-3 border-t border-border">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t.matrix_no_phase}</div>
                <table className="w-full border-collapse text-[13px] mt-1.5">
                  <tbody>
                    {sinFase.map((fila) => (
                      <tr key={clave(o.id, fila)} className="border-t border-border">
                        <td className={`${td} font-semibold`}>{fila.roleTypeName}</td>
                        <td className={`${td} text-center font-mono`}>{fila.sold}</td>
                        <td className={`${td} text-center font-mono font-semibold`}>{fila.executed}</td>
                        <td className={`${td} text-center font-mono font-bold ${fila.delta < 0 ? 'text-warn' : 'text-ok'}`}>
                          {(fila.delta > 0 ? '+' : '') + fila.delta}
                        </td>
                      </tr>
                    ))}
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
                {p.unassigned.map((f) => (
                  <TableRow key={`${f.roleTypeId}|${f.phase ?? ''}`}>
                    <TableCell className="font-semibold">{f.roleTypeName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {f.phase === null ? t.matrix_no_phase : f.phase === 'MONTAJE' ? t.montaje : t.colaudo}
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold text-warn">{f.executed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
