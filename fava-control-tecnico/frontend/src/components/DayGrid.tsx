import { useState } from 'react';
import { CalendarDays, Download, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiState, mesCorto } from '../ui';
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
 * Construida con shadcn/ui. Sus tokens (`bg-card`, `text-muted-foreground`, …) están
 * conectados a las variables de FAVA en `index.css`, así que hereda la identidad y el
 * tema oscuro sin configurar nada componente a componente.
 *
 * Los totales llegan calculados del servidor; aquí no se suma nada.
 */


/** Hasta dónde se despliega la tabla. */
const PROYECTO = 0;
const TECNICO = 1;
const MES = 2;

/**
 * La primera columna se queda fija al desplazar en horizontal: sin ella no se sabe qué
 * fila se está mirando. `sticky` necesita fondo opaco o el contenido se transparenta.
 */
const FIJA = 'sticky left-0 z-10 bg-card min-w-[230px]';

/**
 * Una tarjeta de métrica. Tres arriba, como en el planner.
 *
 * El filete de color en el borde superior es el `decoration="top"` que traía Tremor y
 * que se perdió al retirarlo. Es CSS, no un componente, así que se reproduce entero:
 * `border-t-4` sobre el color de marca.
 */
function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Card className="border-t-4 border-t-primary">
      <CardContent>
        <p className="text-sm text-muted-foreground">{etiqueta}</p>
        <p className="text-3xl font-semibold tabular-nums mt-1">{valor}</p>
      </CardContent>
    </Card>
  );
}

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
  const mes = (n: number) => mesCorto(n, state.lang);
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

  /**
   * Técnicos DISTINTOS, no pares proyecto-técnico.
   *
   * Sumaba `technicians.length` de cada proyecto, así que quien trabajó en cinco obras
   * contaba cinco veces: la tarjeta decía 67 donde la verdad son 16. Y el error no se
   * ve — 67 es un número plausible junto a «6.700 días» y nadie lo cuestiona hasta que
   * intenta cuadrarlo con la lista de Técnicos, que tiene dieciséis filas.
   */
  const tecnicos = new Set(g.projects.flatMap((p) => p.technicians.map((t) => t.technicianId)))
    .size;

  /**
   * Exporta lo que se está viendo a CSV, con el mismo desglose elegido.
   *
   * Existe porque el destino natural de esta cuadrícula sigue siendo Excel: Andrea y
   * Luca trabajan ahí, y una tabla que no se puede sacar obliga a volver al fichero
   * original — que es justo lo que la app viene a sustituir.
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

    // Punto y coma: es lo que espera un Excel en configuración regional española, donde
    // la coma es el separador decimal. Y el BOM es lo que hace que lea los acentos —
    // sin él, «Día» sale «DÃ­a».
    const csv =
      '﻿' +
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
    <span className="inline-block w-3 shrink-0 text-muted-foreground select-none">
      {hayHijos ? (abierto ? '▾' : '▸') : ''}
    </span>
  );

  const filasDe = (p: GridProject) => {
    const kp = p.projectId ?? 'sin';
    const verTecnicos = nivel >= TECNICO || abiertos[kp];

    const filas = [
      <TableRow key={kp} onClick={() => alternar(kp)} className="cursor-pointer">
        {/* Cabecera de grupo al estilo del planner: nombre en negrita y el conteo
            apagado justo al lado, sin fondo ni pastilla. El peso lo da la tipografía. */}
        <TableCell className={`${FIJA} py-4`}>
          <span className="inline-flex items-baseline gap-2">
            {flecha(!!verTecnicos, p.technicians.length > 0)}
            <span className="font-semibold">{p.projectName}</span>
            <span className="text-muted-foreground tabular-nums">{p.total}</span>
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
        <TableRow key={kt} onClick={() => alternar(kt)} className="cursor-pointer">
          {/* El nombre en color de marca, como las empresas del planner: además de
              verse mejor, es la señal de que la fila se puede abrir. */}
          <TableCell className={`${FIJA} py-3.5 pl-8`}>
            <span className="inline-flex items-center gap-2">
              {flecha(!!verMeses, tec.months.length > 0)}
              <span className="text-primary">{tec.technicianName}</span>
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
            <TableCell className={`${FIJA} py-3 pl-16 text-muted-foreground`}>{mes(m.month)}</TableCell>
            {cifras(m.counts)}
            <TableCell className="text-right tabular-nums py-3 text-muted-foreground">{m.total}</TableCell>
          </TableRow>,
        );
      }
    }
    return filas;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metrica etiqueta={t.grid_kpi_days} valor={g.total.toLocaleString('es-CL')} />
        <Metrica
          etiqueta={t.grid_kpi_projects}
          valor={String(g.projects.filter((p) => p.projectId).length)}
        />
        <Metrica etiqueta={t.grid_kpi_techs} valor={String(tecnicos)} />
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        {/* Barra de la tabla: el título a la izquierda y los controles a la derecha.
            Sin textos de ayuda — lo que hace cada control lo dice el propio control. */}
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap border-b p-4">
          <CardTitle className="min-w-0">{t.grid_title}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(nivel)} onValueChange={(v) => cambiarNivel(Number(v))}>
              <SelectTrigger className="w-[175px] min-h-11 md:min-h-9">
                <ListTree className="size-4 opacity-60" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t.grid_level_project}</SelectItem>
                <SelectItem value="1">{t.grid_level_tech}</SelectItem>
                <SelectItem value="2">{t.grid_level_month}</SelectItem>
              </SelectContent>
            </Select>

            {/* `SelectItem` de Radix no admite valor vacío, así que «todos» va con un
                centinela y se traduce a `null` al salir. */}
            <Select
              value={data.elegido === null ? 'todos' : String(data.elegido)}
              onValueChange={(v) => setAnio(v === 'todos' ? null : Number(v))}
            >
              <SelectTrigger className="w-[135px] min-h-11 md:min-h-9">
                <CalendarDays className="size-4 opacity-60" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">{t.grid_all_years}</SelectItem>
                {data.anios.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {String(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={exportar} className="min-h-11 md:min-h-9">
              <Download className="size-4" />
              {t.grid_export}
            </Button>
          </div>
        </CardHeader>

        {/* El scroll horizontal vive AQUÍ dentro: 10 columnas no caben en un móvil y el
            body de la página nunca debe desplazarse en horizontal. */}
        <CardContent className="p-0 overflow-x-auto max-h-[70vh] overflow-y-auto">
          {g.projects.length ? (
            <Table>
              <TableHeader className="sticky top-0 z-20 bg-muted">
                <TableRow>
                  <TableHead className={`${FIJA} z-30 bg-muted`}>{t.grid_rows}</TableHead>
                  {g.concepts.map((c) => (
                    <TableHead
                      key={c.code}
                      className="text-right"
                      title={state.lang === 'it' ? c.labelIt : c.labelEs}
                    >
                      {c.code}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-foreground">{t.grid_total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{g.projects.flatMap(filasDe)}</TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className={`${FIJA} bg-muted font-semibold`}>{t.grid_total}</TableCell>
                  {g.concepts.map((k) => (
                    <TableCell key={k.code} className="text-right tabular-nums font-semibold">
                      {g.counts[k.code] ?? ''}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums font-semibold">{g.total}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">{t.grid_empty}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
