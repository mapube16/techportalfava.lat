import { useState } from 'react';
import { hi } from '../icons';
import { ApiState, Card, CardHead, gbtn, money, nf, td, th } from '../ui';
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

const ENTRADA: React.CSSProperties = {
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: '9px 10px',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 'var(--fs-input)',
  minHeight: 'var(--tap)',
};

export default function ProjectDetail() {
  const { state, t, go, showToast } = useApp();
  const movil = useIsMobile();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [celdas, setCeldas] = useState<Record<string, 'saving' | 'error'>>({});
  const [errOrden, setErrOrden] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ label: '', commessa: '', oaNumber: '', machineModelId: '' });

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
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
      <thead>
        <tr>
          {[t.role_type, t.kpi_sold, t.kpi_done, t.kpi_delta].map((c, i) => (
            <th key={i} style={{ ...th, textAlign: i ? 'center' : 'left' }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => {
          const k = clave(orderId, fila);
          const estado = celdas[k];
          return (
            <tr key={k} style={{ borderTop: '1px solid var(--border)', opacity: fila.roleTypeActive ? 1 : 0.6 }}>
              <td style={{ ...td, fontWeight: 600 }}>{fila.roleTypeName}</td>
              <td style={{ ...td, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <input
                    value={edits[k] ?? String(fila.sold)}
                    onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                    onBlur={(e) => guardarCelda(orderId, fila, e.target.value)}
                    style={{ width: 44, textAlign: 'center', border: '1px solid ' + (estado === 'error' ? 'var(--warn)' : 'var(--border-2)'), borderRadius: 6, padding: '5px 4px', background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'Roboto Mono', fontSize: 13, fontWeight: 600 }}
                  />
                  <span
                    title={estado === 'error' ? t.err_save : ''}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: estado === 'saving' ? 'var(--info)' : estado === 'error' ? 'var(--warn)' : 'transparent' }}
                  />
                </span>
              </td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 600 }}>{fila.executed}</td>
              <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 700, color: fila.delta < 0 ? 'var(--warn)' : 'var(--ok)' }}>
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
      machineModelId: nueva.machineModelId || null,
    })
      .then((o) => {
        setData((d) => d && { ...d, p: { ...d.p, orders: [...d.p.orders, { ...o, matrix: [] }] } });
        setNueva({ label: '', commessa: '', oaNumber: '', machineModelId: '' });
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
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <span style={{ fontWeight: 700, fontSize: 15 }}>{o.label}</span>
      {o.commessa ? (
        <span style={{ fontFamily: 'Roboto Mono', fontSize: 12.5, color: 'var(--primary)' }}>
          {t.order_commessa} {o.commessa}
        </span>
      ) : null}
      {o.oaNumber ? (
        <span style={{ fontFamily: 'Roboto Mono', fontSize: 12.5, color: 'var(--text-3)' }}>
          {o.oaNumber}
        </span>
      ) : null}
      {o.contractValue != null ? (
        <span style={{ fontFamily: 'Roboto Mono', fontSize: 12.5, fontWeight: 600 }}>
          {money(o.contractValue, o.currencyCode ?? '')}
        </span>
      ) : null}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000 }}>
      <button onClick={() => go('projects')} style={{ ...gbtn, alignSelf: 'flex-start' }}>← {t.t_projects}</button>
      <Card>
        <div style={{ padding: '18px 20px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{p.clientName} · {p.country}</div>
          </div>
          {metas.map(([a, b], i) => (
            <div key={a}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{a}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, fontFamily: i ? 'Roboto Mono' : 'inherit' }}>{b}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title={t.orders} />
        <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={nueva.label}
            onChange={(e) => setNueva({ ...nueva, label: e.target.value })}
            placeholder={t.order_label}
            style={{ ...ENTRADA, flex: '2 1 200px' }}
          />
          <input
            value={nueva.commessa}
            onChange={(e) => setNueva({ ...nueva, commessa: e.target.value })}
            placeholder={t.order_commessa}
            style={{ ...ENTRADA, flex: '1 1 110px', fontFamily: 'Roboto Mono' }}
          />
          <input
            value={nueva.oaNumber}
            onChange={(e) => setNueva({ ...nueva, oaNumber: e.target.value })}
            placeholder={t.order_oa}
            style={{ ...ENTRADA, flex: '1 1 110px', fontFamily: 'Roboto Mono' }}
          />
          <select
            value={nueva.machineModelId}
            onChange={(e) => setNueva({ ...nueva, machineModelId: e.target.value })}
            style={{ ...ENTRADA, flex: '1 1 140px' }}
          >
            {/* Hay alcances contratados que no son un modelo del catálogo
                («PC 4000 + 4 SILOS»), así que el modelo es opcional. */}
            <option value="">{t.order_no_model}</option>
            {data.machineModels.filter((m) => m.isActive).map((m) => (
              <option key={m.id} value={m.id}>{m.code}</option>
            ))}
          </select>
          <button
            onClick={anadirOrden}
            disabled={!nueva.label.trim()}
            style={{ ...gbtn, minHeight: 'var(--tap)', opacity: nueva.label.trim() ? 1 : 0.5 }}
          >
            {hi('plus', { w: 14 })} {t.order_add}
          </button>
          {errOrden ? <div style={{ fontSize: 12, color: 'var(--warn)', width: '100%' }}>{t.err_save}: {errOrden}</div> : null}
        </div>
      </Card>

      {p.orders.length === 0 ? (
        <Card>
          <div style={{ padding: '18px 20px', fontSize: 13, color: 'var(--text-3)' }}>{t.order_none}</div>
        </Card>
      ) : null}

      {/* Una tarjeta por máquina contratada, como los bloques de la hoja del Excel:
          JAV pinta tres matrices vendido/ejecutado independientes. */}
      {p.orders.map((o) => {
        const sinFase = o.matrix.filter((r) => r.phase === null);
        const de = (phase: Phase) => o.matrix.filter((r) => r.phase === phase);
        return (
          <Card key={o.id}>
            <CardHead
              title={cabeceraOrden(o)}
              right={
                <button onClick={() => quitarOrden(o.id)} style={{ ...gbtn, fontSize: 12.5 }}>
                  {t.order_delete}
                </button>
              }
            />
            <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr', gap: 0 }}>
              <div style={{ padding: '12px 18px', borderRight: movil ? 'none' : '1px solid var(--border)', borderBottom: movil ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.montaje}</div>
                {matriz(o.id, de('MONTAJE'))}
              </div>
              <div style={{ padding: '12px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.colaudo}</div>
                {matriz(o.id, de('COLLAUDO'))}
              </div>
            </div>
            {sinFase.length ? (
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.matrix_no_phase}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
                  <tbody>
                    {sinFase.map((fila) => (
                      <tr key={clave(o.id, fila)} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...td, fontWeight: 600 }}>{fila.roleTypeName}</td>
                        <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono' }}>{fila.sold}</td>
                        <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 600 }}>{fila.executed}</td>
                        <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 700, color: fila.delta < 0 ? 'var(--warn)' : 'var(--ok)' }}>
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
        <Card>
          <CardHead
            title={t.unassigned}
            right={<span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.unassigned_hint}</span>}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {p.unassigned.map((f) => (
                <tr key={`${f.roleTypeId}|${f.phase ?? ''}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{f.roleTypeName}</td>
                  <td style={{ ...td, color: 'var(--text-3)' }}>
                    {f.phase === null ? t.matrix_no_phase : f.phase === 'MONTAJE' ? t.montaje : t.colaudo}
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontFamily: 'Roboto Mono', fontWeight: 700, color: 'var(--warn)' }}>
                    {f.executed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
