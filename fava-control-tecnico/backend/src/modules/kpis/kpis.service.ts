import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConceptCode } from '../../generated/prisma/enums';

/** Conteos por código de concepto. Ausente = 0; la celda se pinta vacía, no «0». */
export type Conteos = Partial<Record<ConceptCode, number>>;

export interface NodoMes {
  month: number; // 1-12
  counts: Conteos;
  total: number;
}

export interface NodoTecnico {
  technicianId: string;
  technicianName: string;
  counts: Conteos;
  total: number;
  months: NodoMes[];
}

export interface NodoProyecto {
  /** `null` = «Sin Proyecto»: días libres, no remunerados y de fábrica (63% del Excel). */
  projectId: string | null;
  projectName: string;
  counts: Conteos;
  total: number;
  technicians: NodoTecnico[];
}

export interface Cuadricula {
  year: number | null;
  /** Las columnas, en el orden del catálogo. Con etiqueta ES/IT para el encabezado. */
  concepts: { code: ConceptCode; labelEs: string; labelIt: string }[];
  projects: NodoProyecto[];
  counts: Conteos;
  total: number;
}

interface FilaCruda {
  project_id: string | null;
  project_name: string | null;
  technician_id: string;
  technician_name: string;
  month: number;
  concept_code: ConceptCode;
  days: number;
}

/** Suma `n` en la clave `code` de un acumulador de conteos. */
const sumar = (c: Conteos, code: ConceptCode, n: number) => {
  c[code] = (c[code] ?? 0) + n;
};

/**
 * KPI-07 — la cuadrícula de días por concepto: filas proyecto → técnico → mes,
 * columnas los 8 conceptos, totales en cada nivel.
 *
 * Es la tabla dinámica que Andrea mantiene a mano y que sólo ella sabe refrescar
 * («yo me siento con Luca… él, como no sabe hacerle una actualización a la data, pues
 * no sabe mirar los datos»). Sustituir esa tabla es el objetivo, así que la forma es
 * deliberadamente la misma que la del Excel, encabezados incluidos.
 */
@Injectable()
export class KpisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * UNA consulta con el groupBy en el motor, no 12 × N. Postgres agrega 6.573 filas
   * sin despeinarse y lo que viaja son las ~1.500 combinaciones que existen de verdad,
   * no el producto cartesiano de proyectos × técnicos × meses × conceptos.
   *
   * `status = 'approved'`, coherente con KPI-01 y con la agregación de vendido/
   * ejecutado: un borrador no es un día ejecutado. Todo el histórico migrado entra
   * como aprobado, que es lo que es — un hecho ya cerrado.
   */
  async cuadricula(year: number | null): Promise<Cuadricula> {
    const [filas, conceptos] = await Promise.all([
      this.prisma.client.$queryRaw<FilaCruda[]>`
        SELECT de.project_id,
               p.name                      AS project_name,
               de.technician_id,
               t.full_name                 AS technician_name,
               EXTRACT(MONTH FROM de.date)::int AS month,
               de.concept_code,
               COUNT(*)::int               AS days
          FROM daily_entries de
          JOIN technicians t ON t.id = de.technician_id
          LEFT JOIN projects p ON p.id = de.project_id
         WHERE de.status = 'approved'
           AND de.concept_code IS NOT NULL
           AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
         GROUP BY 1, 2, 3, 4, 5, 6
      `,
      this.prisma.client.concept.findMany({
        select: { code: true, labelEs: true, labelIt: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    // El árbol se arma con Maps y se ordena UNA vez al final: ordenar dentro del bucle
    // sería O(n log n) por inserción sin ganar nada.
    const porProyecto = new Map<string, NodoProyecto>();
    const porTecnico = new Map<string, NodoTecnico>();
    const porMes = new Map<string, NodoMes>();
    const raiz: Conteos = {};
    let granTotal = 0;

    for (const f of filas) {
      const kp = f.project_id ?? '';
      let proyecto = porProyecto.get(kp);
      if (!proyecto) {
        proyecto = {
          projectId: f.project_id,
          // El centinela del Excel se conserva como etiqueta: son días reales
          // (libres, no remunerados, fábrica) y esconderlos falsearía los totales.
          projectName: f.project_name ?? 'Sin Proyecto',
          counts: {},
          total: 0,
          technicians: [],
        };
        porProyecto.set(kp, proyecto);
      }

      const kt = `${kp}|${f.technician_id}`;
      let tecnico = porTecnico.get(kt);
      if (!tecnico) {
        tecnico = {
          technicianId: f.technician_id,
          technicianName: f.technician_name,
          counts: {},
          total: 0,
          months: [],
        };
        porTecnico.set(kt, tecnico);
        proyecto.technicians.push(tecnico);
      }

      const km = `${kt}|${f.month}`;
      let mes = porMes.get(km);
      if (!mes) {
        mes = { month: f.month, counts: {}, total: 0 };
        porMes.set(km, mes);
        tecnico.months.push(mes);
      }

      // Los cuatro niveles se acumulan a la vez: así el total de un proyecto es la
      // suma de sus celdas por construcción y no una segunda pasada que pueda
      // desviarse de ellas.
      for (const nodo of [mes, tecnico, proyecto]) {
        sumar(nodo.counts, f.concept_code, f.days);
        nodo.total += f.days;
      }
      sumar(raiz, f.concept_code, f.days);
      granTotal += f.days;
    }

    const proyectos = [...porProyecto.values()].sort((a, b) => {
      // «Sin Proyecto» al final: es el cajón de los días no imputables y arriba
      // taparía los proyectos reales, que son lo que se viene a mirar.
      if (a.projectId === null) return 1;
      if (b.projectId === null) return -1;
      return a.projectName.localeCompare(b.projectName, 'es');
    });
    for (const p of proyectos) {
      p.technicians.sort((a, b) => a.technicianName.localeCompare(b.technicianName, 'es'));
      for (const t of p.technicians) t.months.sort((a, b) => a.month - b.month);
    }

    return { year, concepts: conceptos, projects: proyectos, counts: raiz, total: granTotal };
  }

  /** Los años con datos, para el selector. Descendente: se mira el actual primero. */
  async anios(): Promise<number[]> {
    const filas = await this.prisma.client.$queryRaw<{ year: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year
        FROM daily_entries
       WHERE status = 'approved'
       ORDER BY 1 DESC
    `;
    return filas.map((f) => f.year);
  }
}
