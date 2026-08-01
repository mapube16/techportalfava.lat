import { useState } from 'react';
import { ApiState, Card, CardHead } from '../ui';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { getDayGrid, getGridYears } from '../lib/api/kpis';
import type { Counts, DayGrid as Datos, GridProject } from '../lib/api/kpis';

/**
 * KPI-07 — la cuadrícula de días por concepto: proyecto → técnico → mes en las filas,
 * los 8 conceptos en las columnas, totales en cada nivel.
 *
 * Es la misma forma que la tabla dinámica del Excel a propósito: sustituirla es el
 * objetivo, y Andrea y Luca ya saben leer ésa. Los totales llegan calculados del
 * servidor; aquí no se suma nada.
 *
 * Se pliega por niveles en vez de pintar las ~1.500 filas de golpe: en el Excel eso se
 * navega con scroll infinito, en pantalla no.
 */

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESI = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const celda: React.CSSProperties = {
  padding: '7px 10px',
  textAlign: 'right',
  fontFamily: 'Roboto Mono',
  fontSize: 12.5,
  whiteSpace: 'nowrap',
};

const cabecera: React.CSSProperties = {
  ...celda,
  position: 'sticky',
  top: 0,
  background: 'var(--surface-2)',
  color: 'var(--text-3)',
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  borderBottom: '1px solid var(--border)',
  zIndex: 1,
};

/** La primera columna se queda fija al desplazar en horizontal: sin ella no se sabe qué fila es. */
const fija = (extra?: React.CSSProperties): React.CSSProperties => ({
  ...celda,
  textAlign: 'left',
  position: 'sticky',
  left: 0,
  background: 'var(--surface)',
  fontFamily: 'inherit',
  minWidth: 190,
  ...extra,
});

export default function DayGrid() {
  const { t, state } = useApp();
  const [anio, setAnio] = useState<number | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const { data, error } = useApiData(async () => {
    const anios = await getGridYears();
    // El año más reciente por defecto: es lo que se mira. `null` sólo si no hay datos.
    const elegido = anio ?? anios[0] ?? null;
    return { anios, grid: await getDayGrid(elegido), elegido };
  }, [anio, state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const g: Datos = data.grid;
  const mes = (n: number) => (state.lang === 'it' ? MESI[n] : MESES[n]);
  const alternar = (k: string) => setAbiertos((a) => ({ ...a, [k]: !a[k] }));

  /** Vacío en vez de «0»: una cuadrícula sembrada de ceros no se lee. */
  const cifras = (c: Counts, negrita?: boolean) =>
    g.concepts.map((k) => (
      <td key={k.code} style={{ ...celda, fontWeight: negrita ? 700 : 400 }}>
        {c[k.code] ?? ''}
      </td>
    ));

  const filasDe = (p: GridProject) => {
    const kp = p.projectId ?? 'sin';
    const filas = [
      <tr
        key={kp}
        onClick={() => alternar(kp)}
        style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface-2)' }}
      >
        <td style={fija({ fontWeight: 700, background: 'var(--surface-2)' })}>
          <span style={{ display: 'inline-block', width: 14, color: 'var(--text-3)' }}>
            {abiertos[kp] ? '−' : '+'}
          </span>
          {p.projectName}
        </td>
        {cifras(p.counts, true)}
        <td style={{ ...celda, fontWeight: 700 }}>{p.total}</td>
      </tr>,
    ];
    if (!abiertos[kp]) return filas;

    for (const tec of p.technicians) {
      const kt = `${kp}|${tec.technicianId}`;
      filas.push(
        <tr key={kt} onClick={() => alternar(kt)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
          <td style={fija({ paddingLeft: 30, fontWeight: 600 })}>
            <span style={{ display: 'inline-block', width: 14, color: 'var(--text-3)' }}>
              {abiertos[kt] ? '−' : '+'}
            </span>
            {tec.technicianName}
          </td>
          {cifras(tec.counts, true)}
          <td style={{ ...celda, fontWeight: 700 }}>{tec.total}</td>
        </tr>,
      );
      if (!abiertos[kt]) continue;
      for (const m of tec.months) {
        filas.push(
          <tr key={`${kt}|${m.month}`} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={fija({ paddingLeft: 62, color: 'var(--text-3)' })}>{mes(m.month)}</td>
            {cifras(m.counts)}
            <td style={{ ...celda, fontWeight: 600 }}>{m.total}</td>
          </tr>,
        );
      }
    }
    return filas;
  };

  return (
    <Card>
      <CardHead
        title={t.grid_title}
        right={
          <select
            value={data.elegido ?? ''}
            onChange={(e) => setAnio(e.target.value ? Number(e.target.value) : null)}
            style={{
              border: '1px solid var(--border-2)',
              borderRadius: 8,
              padding: '7px 10px',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontSize: 13,
              minHeight: 'var(--tap)',
            }}
          >
            <option value="">{t.grid_all_years}</option>
            {data.anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        }
      />
      {/* El scroll horizontal vive AQUÍ dentro: 10 columnas no caben en un móvil y el
          body de la página nunca debe desplazarse en horizontal. */}
      <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...cabecera, textAlign: 'left', left: 0, zIndex: 2, minWidth: 190 }}>
                {t.grid_rows}
              </th>
              {g.concepts.map((c) => (
                <th key={c.code} style={cabecera} title={state.lang === 'it' ? c.labelIt : c.labelEs}>
                  {c.code}
                </th>
              ))}
              <th style={{ ...cabecera, color: 'var(--text)' }}>{t.grid_total}</th>
            </tr>
          </thead>
          <tbody>
            {g.projects.length ? (
              g.projects.flatMap(filasDe)
            ) : (
              <tr>
                <td colSpan={g.concepts.length + 2} style={{ padding: 26, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  {t.grid_empty}
                </td>
              </tr>
            )}
          </tbody>
          {g.projects.length ? (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-2)' }}>
                <td style={fija({ fontWeight: 700, position: 'sticky', bottom: 0 })}>{t.grid_total}</td>
                {cifras(g.counts, true)}
                <td style={{ ...celda, fontWeight: 700 }}>{g.total}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Card>
  );
}
