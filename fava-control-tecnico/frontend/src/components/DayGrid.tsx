import { useState } from 'react';
import {
  Button,
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
 * KPI-07 — la cuadrícula de días por concepto.
 *
 * Es la tabla dinámica del Excel, y se navega igual: se elige HASTA QUÉ NIVEL se
 * despliega —proyecto, técnico o mes— y toda la tabla responde a la vez. Con solo el
 * `+/−` por fila no se sabía en qué profundidad estaba cada rama y la lectura se perdía;
 * el selector de nivel es el mismo gesto que «contraer/expandir campo» de Excel, que es
 * el que Andrea y Luca ya tienen aprendido.
 *
 * Las filas siguen siendo pulsables para abrir UNA rama concreta por encima del nivel
 * elegido, que es lo que se hace cuando algo no cuadra en un proyecto en particular.
 *
 * Los totales llegan calculados del servidor; aquí no se suma nada.
 */

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESI = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/**
 * Los iconos de los controles. Van como COMPONENTES porque `Select` y `Button` de
 * Tremor esperan un tipo de componente, no un elemento ya renderizado.
 */
const IconoDesglose = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <path d="M4 6h16M8 12h12M12 18h8" />
  </svg>
);
const IconoAnio = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 11h18" />
  </svg>
);
const IconoExportar = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

/** Hasta dónde se despliega la tabla. */
const PROYECTO = 0;
const TECNICO = 1;
const MES = 2;

/**
 * La primera columna se queda fija al desplazar en horizontal: sin ella no se sabe qué
 * fila se está mirando. `sticky` necesita fondo opaco o el contenido se transparenta.
 */
const FIJA = 'sticky left-0 z-10 min-w-[230px]';

export default function DayGrid() {
  const { t, state } = useApp();
  const [anio, setAnio] = useState<number | null>(null);
  const [nivel, setNivel] = useState<number>(PROYECTO);
  /** Ramas abiertas A MANO, por encima del nivel elegido. Se limpian al cambiarlo. */
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

  const cambiarNivel = (n: number) => {
    setNivel(n);
    // Sin esto, una rama abierta a mano seguiría abierta al contraer todo y el nivel
    // elegido dejaría de describir lo que se ve.
    setAbiertos({});
  };

  /** Vacío en vez de «0»: una cuadrícula sembrada de ceros no se lee. */
  const cifras = (c: Counts, fuerte?: boolean) =>
    g.concepts.map((k) => (
      <TableCell key={k.code} className={`text-right tabular-nums ${fuerte ? 'font-semibold' : ''}`}>
        {c[k.code] ?? ''}
      </TableCell>
    ));

  const tecnicos = g.projects.reduce((n, p) => n + p.technicians.length, 0);

  /**
   * Exporta lo que se está viendo a CSV, con el mismo desglose elegido.
   *
   * Existe porque el destino natural de esta tabla sigue siendo Excel: Andrea y Luca
   * trabajan ahí, y una cuadrícula que no se puede sacar obliga a volver al fichero
   * original — que es justo lo que la app viene a sustituir.
   *
   * Punto y coma como separador: es lo que espera un Excel en configuración regional
   * española, donde la coma es el separador decimal.
   */
  const exportar = () => {
    const filas: string[][] = [[t.grid_rows, ...g.concepts.map((c) => c.code), t.grid_total]];
    const num = (c: Counts) => g.concepts.map((k) => String(c[k.code] ?? ''));
    for (const p of g.projects) {
      filas.push([p.projectName, ...num(p.counts), String(p.total)]);
      if (nivel < TECNICO && !abiertos[p.projectId ?? 'sin']) continue;
      for (const tec of p.technicians) {
        filas.push(['  ' + tec.technicianName, ...num(tec.counts), String(tec.total)]);
        if (nivel < MES && !abiertos[(p.projectId ?? 'sin') + '|' + tec.technicianId]) continue;
        for (const m of tec.months) filas.push(['    ' + mes(m.month), ...num(m.counts), String(m.total)]);
      }
    }
    filas.push([t.grid_total, ...num(g.counts), String(g.total)]);

    // El BOM es lo que hace que Excel lea los acentos: sin él, «Día» sale «DÃ­a».
    const csv =
      '\uFEFF' +
      filas.map((f) => f.map((v) => '"' + v.replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fava-dias-' + (data.elegido ?? 'todos') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /** El triángulo de desplegar. Vacío si la rama no tiene nada dentro. */
  const flecha = (abierto: boolean, hayHijos: boolean) => (
    <span className="inline-block w-3 shrink-0 text-tremor-content-subtle select-none">
      {hayHijos ? (abierto ? '▾' : '▸') : ''}
    </span>
  );

  const filasDe = (p: GridProject) => {
    const kp = p.projectId ?? 'sin';
    const verTecnicos = nivel >= TECNICO || abiertos[kp];

    const filas = [
      <TableRow
        key={kp}
        onClick={() => alternar(kp)}
        className="cursor-pointer group"
      >
        {/* Cabecera de grupo al estilo del planner: nombre en negrita y el conteo
            apagado al lado, sin fondo ni pastilla. El peso lo da la tipografia. */}
        <TableCell className={`${FIJA} bg-tremor-background py-4`}>
          <span className="inline-flex items-baseline gap-2">
            {flecha(!!verTecnicos, p.technicians.length > 0)}
            <span className="font-semibold text-tremor-content-strong">{p.projectName}</span>
            <span className="text-tremor-content-subtle tabular-nums">{p.total}</span>
          </span>
        </TableCell>
        {cifras(p.counts, true)}
        <TableCell className="text-right font-semibold tabular-nums py-4">{p.total}</TableCell>
      </TableRow>,
    ];
    if (!verTecnicos) return filas;

    for (const tec of p.technicians) {
      const kt = `${kp}|${tec.technicianId}`;
      const verMeses = nivel >= MES || abiertos[kt];
      filas.push(
        <TableRow
          key={kt}
          onClick={() => alternar(kt)}
          className="cursor-pointer hover:bg-tremor-background-muted"
        >
          {/* El nombre en color de marca, como las empresas del planner: ademas de
              verse mejor, es la senal de que la fila se puede abrir. */}
          <TableCell className={`${FIJA} bg-tremor-background py-3.5 pl-8`}>
            <span className="inline-flex items-center gap-2">
              {flecha(!!verMeses, tec.months.length > 0)}
              <span className="text-tremor-brand">{tec.technicianName}</span>
            </span>
          </TableCell>
          {cifras(tec.counts)}
          <TableCell className="text-right tabular-nums py-3.5">{tec.total}</TableCell>
        </TableRow>,
      );
      if (!verMeses) continue;
      for (const m of tec.months) {
        filas.push(
          <TableRow key={`${kt}|${m.month}`}>
            <TableCell className={`${FIJA} bg-tremor-background py-3 pl-16 text-tremor-content-subtle`}>
              {mes(m.month)}
            </TableCell>
            {cifras(m.counts)}
            <TableCell className="text-right tabular-nums py-3 text-tremor-content">{m.total}</TableCell>
          </TableRow>,
        );
      }
    }
    return filas;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Métricas arriba: lo que se mira antes de entrar al detalle. */}
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
        {/* Barra de la tabla, como la del planner: el título a la izquierda y los
            controles a la derecha. Sin textos de ayuda: lo que hace cada control lo
            dice el propio control. */}
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-b border-tremor-border">
          <Title className="min-w-0">{t.grid_title}</Title>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={String(nivel)}
              onValueChange={(v) => cambiarNivel(Number(v))}
              className="w-[170px] min-h-11 md:min-h-0"
              enableClear={false}
              icon={IconoDesglose}
            >
              <SelectItem value="0">{t.grid_level_project}</SelectItem>
              <SelectItem value="1">{t.grid_level_tech}</SelectItem>
              <SelectItem value="2">{t.grid_level_month}</SelectItem>
            </Select>
            <Select
              value={String(data.elegido ?? '')}
              onValueChange={(v) => setAnio(v ? Number(v) : null)}
              className="w-[130px] min-h-11 md:min-h-0"
              enableClear={false}
              icon={IconoAnio}
            >
              <SelectItem value="">{t.grid_all_years}</SelectItem>
              {data.anios.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {String(a)}
                </SelectItem>
              ))}
            </Select>
            <Button variant="secondary" icon={IconoExportar} onClick={exportar} className="min-h-11 md:min-h-0">
              {t.grid_export}
            </Button>
          </div>
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
