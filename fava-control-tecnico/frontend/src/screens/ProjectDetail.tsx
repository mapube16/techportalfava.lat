import { useState } from 'react';
import { hi } from '../icons';
import { ApiState, Card, CardHead, gbtn, money, nf, td, th } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { getCatalogs } from '../lib/api/catalogs';
import { getProject, setProjectMachines, setSoldDays } from '../lib/api/projects';
import type { MatrixRow, Phase } from '../lib/api/projects';

/** Una celda de la matriz se identifica por (rol, fase); la fase puede ser nula. */
const clave = (r: MatrixRow) => `${r.roleTypeId}|${r.phase ?? ''}`;

export default function ProjectDetail() {
  const { state, t, go, showToast } = useApp();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [celdas, setCeldas] = useState<Record<string, 'saving' | 'error'>>({});
  const [errMaq, setErrMaq] = useState<string | null>(null);

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

  /**
   * Autoguardado por celda: al salir del campo. Si el valor no cambió NO se escribe
   * (evita la escritura y el ruido en el audit_log de la Fase 4); si el guardado falla
   * la celda vuelve al valor anterior y avisa.
   */
  const guardarCelda = (fila: MatrixRow, texto: string) => {
    const k = clave(fila);
    const olvidar = () => setEdits(({ [k]: _, ...resto }) => resto);
    const n = Number.parseInt(texto, 10);
    // El bucket sin fase es histórico del Excel: se lee, no se edita (el PUT exige fase).
    if (fila.phase === null || !Number.isInteger(n) || n < 0 || n === fila.sold) {
      olvidar();
      return;
    }
    setCeldas((c) => ({ ...c, [k]: 'saving' }));
    setSoldDays(p.id, { roleTypeId: fila.roleTypeId, phase: fila.phase, soldDays: n })
      .then((celda) => {
        // El delta llega calculado del servidor: la pantalla no resta nunca.
        setData((d) => d && {
          ...d,
          p: {
            ...d.p,
            matrix: d.p.matrix.map((r) => (clave(r) === k
              ? { ...r, sold: celda.sold, executed: celda.executed, delta: celda.delta }
              : r)),
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

  const matriz = (phase: Phase) => {
    const filas = p.matrix.filter((r) => r.phase === phase);
    return (
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
            const k = clave(fila);
            const estado = celdas[k];
            return (
              <tr key={k} style={{ borderTop: '1px solid var(--border)', opacity: fila.roleTypeActive ? 1 : 0.6 }}>
                <td style={{ ...td, fontWeight: 600 }}>{fila.roleTypeName}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <input
                      value={edits[k] ?? String(fila.sold)}
                      onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                      onBlur={(e) => guardarCelda(fila, e.target.value)}
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
  };

  // Solo existe si hay ejecutado sin fase (histórico del Excel): una fila vacía en
  // todos los proyectos sería ruido permanente.
  const sinFase = p.matrix.filter((r) => r.phase === null);

  /** Quitar una máquina con jornadas se avisa y se permite: el servidor nunca bloquea. */
  const conmutarMaquina = (machineModelId: string) => {
    const puesta = p.machines.find((x) => x.machineModelId === machineModelId);
    if (puesta && puesta.entryCount > 0 && !window.confirm(t.machine_entries_warn)) return;
    const ids = puesta
      ? p.machines.filter((x) => x.machineModelId !== machineModelId).map((x) => x.machineModelId)
      : [...p.machines.map((x) => x.machineModelId), machineModelId];
    setErrMaq(null);
    setProjectMachines(p.id, ids)
      .then((ms) => setData((d) => d && { ...d, p: { ...d.p, machines: ms } }))
      .catch((e: unknown) => setErrMaq(codigo(e)));
  };

  // Los inactivos no se ofrecen, pero el que ya está en el proyecto sigue visible.
  const elegibles = data.machineModels.filter(
    (m) => m.isActive || p.machines.some((x) => x.machineModelId === m.id),
  );

  const metas: [string, string][] = [
    ['OA / Commessa', p.oaNumber ?? '—'],
    [t.contract, p.contractValue == null ? '—' : money(p.contractValue, p.currencyCode ?? '')],
    [t.proj_hours, nf(p.normalHours || 0) + ' h'],
    [t.proj_locality, p.locality],
    [t.proj_supply, p.supply],
    [t.proj_contract_no, p.contractNumber],
    [t.proj_nit, p.clientNit ?? '—'],
  ];

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
        <CardHead title={t.machines} />
        <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {elegibles.map((m) => {
            const on = p.machines.some((x) => x.machineModelId === m.id);
            return (
              <button
                key={m.id}
                onClick={() => conmutarMaquina(m.id)}
                title={m.description ?? ''}
                style={{ padding: '9px 14px', border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border-2)'), background: on ? 'var(--primary-tint)' : 'var(--surface-2)', color: on ? 'var(--primary)' : 'var(--text-2)', borderRadius: 9, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'Roboto Mono', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {on ? hi('check', { w: 14 }) : null}
                {m.code}
              </button>
            );
          })}
          {errMaq ? <div style={{ fontSize: 12, color: 'var(--warn)', width: '100%' }}>{t.err_save}: {errMaq}</div> : null}
        </div>
      </Card>
      <Card>
        <CardHead title={t.matrix} right={<span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.matrix_hint}</span>} />
        <div style={{ display: 'grid', gridTemplateColumns: state.mobile ? '1fr' : '1fr 1fr', gap: 0 }}>
          <div style={{ padding: '12px 18px', borderRight: state.mobile ? 'none' : '1px solid var(--border)', borderBottom: state.mobile ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.montaje}</div>
            {matriz('MONTAJE')}
          </div>
          <div style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.colaudo}</div>
            {matriz('COLLAUDO')}
          </div>
        </div>
        {sinFase.length ? (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.matrix_no_phase}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
              <tbody>
                {sinFase.map((fila) => (
                  <tr key={clave(fila)} style={{ borderTop: '1px solid var(--border)' }}>
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
    </div>
  );
}
