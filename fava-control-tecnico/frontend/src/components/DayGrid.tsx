import { useState } from 'react';
import {
  Badge,
  Card,
  Metric,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableFooterCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from '@tremor/react';
import { ApiState } from '../ui';
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
 * Construida con `@tremor/react`, siguiendo el patrón del planner de Tremor: métricas
 * arriba, tabla agrupada debajo y el CONTEO en la cabecera de cada grupo (ahí «Europe 6»,
 * aquí los días del proyecto). Los tokens `tremor-*` están conectados a las variables de
 * FAVA en `index.css`, así que estos componentes heredan la identidad y el tema oscuro
 * sin configurarles nada.
 *
 * Se pliega por niveles en vez de pintar las ~1.500 filas de golpe: en el Excel eso se
 * navega con scroll infinito, en pantalla no.
 */

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESI = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/**
 * La primera columna se queda fija al desplazar en horizontal: sin ella no se sabe qué
 * fila se está mirando. `sticky` necesita un fondo opaco o el contenido se transparenta
 * por debajo.
 */
const FIJA = 'sticky left-0 z-10 bg-tremor-background min-w-[210px]';

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
  const mes = (n: number) => (state.lang === 'it' ? MESI[n] : MESES[n])!;
  const alternar = (k: string) => setAbiertos((a) => ({ ...a, [k]: !a[k] }));

  /** Vacío en vez de «0»: una cuadrícula sembrada de ceros no se lee. */
  const cifras = (c: Counts, fuerte?: boolean) =>
    g.concepts.map((k) => (
      <TableCell key={k.code} className={`text-right tabular-nums ${fuerte ? 'font-semibold' : ''}`}>
        {c[k.code] ?? ''}
      </TableCell>
    ));

  const tecnicos = g.projects.reduce((n, p) => n + p.technicians.length, 0);

  const filasDe = (p: GridProject) => {
    const kp = p.projectId ?? 'sin';
    const filas = [
      <TableRow
        key={kp}
        onClick={() => alternar(kp)}
        className="cursor-pointer bg-tremor-background-muted hover:bg-tremor-background-subtle"
      >
        <TableCell className={`${FIJA} bg-tremor-background-muted font-semibold`}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 text-tremor-content-subtle">{abiertos[kp] ? '−' : '+'}</span>
            {p.projectName}
            {/* El conteo en la cabecera del grupo, como en el planner. */}
            <Badge size="xs" color="gray">{p.total}</Badge>
          </span>
        </TableCell>
        {cifras(p.counts, true)}
        <TableCell className="text-right font-bold tabular-nums">{p.total}</TableCell>
      </TableRow>,
    ];
    if (!abiertos[kp]) return filas;

    for (const tec of p.technicians) {
      const kt = `${kp}|${tec.technicianId}`;
      filas.push(
        <TableRow key={kt} onClick={() => alternar(kt)} className="cursor-pointer hover:bg-tremor-background-muted">
          <TableCell className={`${FIJA} pl-8 font-medium`}>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-3 text-tremor-content-subtle">{abiertos[kt] ? '−' : '+'}</span>
              {tec.technicianName}
            </span>
          </TableCell>
          {cifras(tec.counts, true)}
          <TableCell className="text-right font-semibold tabular-nums">{tec.total}</TableCell>
        </TableRow>,
      );
      if (!abiertos[kt]) continue;
      for (const m of tec.months) {
        filas.push(
          <TableRow key={`${kt}|${m.month}`}>
            <TableCell className={`${FIJA} pl-16 text-tremor-content-subtle`}>{mes(m.month)}</TableCell>
            {cifras(m.counts)}
            <TableCell className="text-right tabular-nums">{m.total}</TableCell>
          </TableRow>,
        );
      }
    }
    return filas;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Métricas arriba, como en el planner: lo que se mira antes de entrar al detalle. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card decoration="top" decorationColor="blue">
          <Text>{t.grid_kpi_days}</Text>
          <Metric className="tabular-nums">{g.total.toLocaleString('es-CL')}</Metric>
        </Card>
        <Card decoration="top" decorationColor="blue">
          <Text>{t.grid_kpi_projects}</Text>
          <Metric className="tabular-nums">{g.projects.filter((p) => p.projectId).length}</Metric>
        </Card>
        <Card decoration="top" decorationColor="blue">
          <Text>{t.grid_kpi_techs}</Text>
          <Metric className="tabular-nums">{tecnicos}</Metric>
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-b border-tremor-border">
          <div className="min-w-0">
            <Title>{t.grid_title}</Title>
            <Text className="mt-0.5">{t.grid_hint}</Text>
          </div>
          <Select
            value={String(data.elegido ?? '')}
            onValueChange={(v) => setAnio(v ? Number(v) : null)}
            className="max-w-[180px] min-h-11 md:min-h-0"
            enableClear={false}
          >
            {/* `SelectItem` exige valor no vacío, así que «todos» va como centinela. */}
            <SelectItem value="">{t.grid_all_years}</SelectItem>
            {data.anios.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {String(a)}
              </SelectItem>
            ))}
          </Select>
        </div>

        {/* El scroll horizontal vive AQUÍ dentro: 10 columnas no caben en un móvil y el
            body de la página nunca debe desplazarse en horizontal. */}
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          {g.projects.length ? (
            <Table>
              <TableHead className="sticky top-0 z-20 bg-tremor-background-muted">
                <TableRow>
                  <TableHeaderCell className={`${FIJA} z-30 bg-tremor-background-muted`}>
                    {t.grid_rows}
                  </TableHeaderCell>
                  {g.concepts.map((c) => (
                    <TableHeaderCell
                      key={c.code}
                      className="text-right"
                      title={state.lang === 'it' ? c.labelIt : c.labelEs}
                    >
                      {c.code}
                    </TableHeaderCell>
                  ))}
                  <TableHeaderCell className="text-right text-tremor-content-strong">
                    {t.grid_total}
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>{g.projects.flatMap(filasDe)}</TableBody>
              <TableFoot>
                <TableRow>
                  <TableFooterCell className={`${FIJA} bg-tremor-background-muted`}>
                    {t.grid_total}
                  </TableFooterCell>
                  {g.concepts.map((k) => (
                    <TableFooterCell key={k.code} className="text-right tabular-nums">
                      {g.counts[k.code] ?? ''}
                    </TableFooterCell>
                  ))}
                  <TableFooterCell className="text-right tabular-nums">{g.total}</TableFooterCell>
                </TableRow>
              </TableFoot>
            </Table>
          ) : (
            <div className="p-10 text-center">
              <Text>{t.grid_empty}</Text>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
