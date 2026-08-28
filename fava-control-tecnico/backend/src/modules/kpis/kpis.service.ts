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

// ── KPI-02: la definición del denominador, en UN solo sitio ──
//
// Es la parte discutible del indicador y por eso está aquí arriba, nombrada y
// exportada, en vez de repartida por la consulta: cambiar la regla es editar estas
// tres listas, y la respuesta del endpoint las lleva para que la pantalla imprima con
// qué criterio se calculó.

/** Días que cuentan como trabajo. El medio día cuenta 1, igual que en el Excel. */
export const PRODUCTIVOS: ConceptCode[] = ['DC', 'MD', 'DFD', 'DVSF', 'DVRC'];

/** No productivos, pero SÍ en el denominador: el técnico estaba disponible y no produjo. */
export const NO_PRODUCTIVOS: ConceptCode[] = ['LR', 'NR'];

/**
 * Fuera del denominador ENTERO. Una incapacidad no es tiempo disponible que se
 * desaprovechó: es tiempo que no existió. Dejarla dentro castigaría al técnico que
 * se enfermó, que es justo lo que hace que un indicador así deje de usarse.
 */
export const FUERA_DEL_DENOMINADOR: ConceptCode[] = ['IL'];

export interface FilaUtilizacion {
  technicianId: string;
  technicianName: string;
  technicianActive: boolean;
  counts: Conteos;
  productive: number;
  nonProductive: number;
  excluded: number;
  denominator: number;
  /** `null` cuando el denominador es 0: sin días disponibles no hay porcentaje. */
  utilizationPct: number | null;
}

export interface Utilizacion {
  year: number | null;
  rule: { productive: ConceptCode[]; nonProductive: ConceptCode[]; excluded: ConceptCode[] };
  technicians: FilaUtilizacion[];
  productive: number;
  excluded: number;
  /** Días futuros que el Excel dejó pre-rellenados y que NO entran. Se muestra en pantalla. */
  futureExcluded: number;
  /**
   * Cuántos de los días contados están todavía en `submitted`, esperando que un admin
   * los apruebe. Se cuenta y se devuelve en vez de esconderlo: el indicador incluye
   * trabajo que el técnico declaró y nadie ha validado aún, y quien lo lee tiene
   * derecho a saber qué parte es.
   */
  pendingApproval: number;
  denominator: number;
  utilizationPct: number | null;
}

interface FilaUtil {
  technician_id: string;
  technician_name: string;
  technician_active: boolean;
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
   * QUÉ CUENTA COMO EJECUTADO: `submitted` Y `approved`, no solo `approved`.
   *
   * Antes era solo `approved` y con el histórico migrado daba igual — entró todo
   * aprobado. Deja de dar igual en cuanto los técnicos usan la app: su semana se
   * queda en `submitted` hasta que un admin la aprueba, así que el tablero iría
   * siempre por detrás de la realidad y, durante la adopción, parecería vacío.
   * Un día enviado ES un día trabajado; lo que falta es validarlo, no hacerlo.
   *
   * `draft` y `returned` siguen fuera, y por el mismo criterio: uno todavía se está
   * escribiendo y el otro está en corrección. Ninguno de los dos es una afirmación
   * del técnico de que la semana esté como debe.
   *
   * Cuántos de esos días esperan aprobación se devuelve aparte (`pendingApproval`
   * en KPI-02), para que el número se pueda leer sin suponer que todo está validado.
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
         WHERE de.status IN ('submitted', 'approved')
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

  /**
   * KPI-02 — utilización por técnico.
   *
   * El denominador es lo que hace que este número sea defendible o no, así que la
   * definición vive en UN sitio (`PRODUCTIVOS` / `FUERA_DEL_DENOMINADOR`, arriba) y
   * viaja en la respuesta: la pantalla imprime con qué regla se calculó, en vez de que
   * cada lector suponga la suya.
   *
   * Cada jornada vale 1, incluido el medio día. No es un descuido: es la misma regla
   * con la que el Excel cuenta el ejecutado (verificado celda a celda contra
   * `Dettaglio anno 2026`), y usar 0,5 aquí y 1 allí daría dos utilizaciones distintas
   * para los mismos días. Si algún día se pondera, se pondera en los dos sitios.
   */
  async utilizacion(year: number | null): Promise<Utilizacion> {
    // `date <= CURRENT_DATE` NO es una precaución de estilo: el Excel pre-rellena el
    // AÑO ENTERO y marca como LR/NR los días que aún no han ocurrido. En producción son
    // 1.220 filas futuras (911 LR + 309 NR) de 8 técnicos con calendario hasta el 31 de
    // diciembre. Contarlas hunde el denominador de todos y da 36,8 % donde la cifra real
    // es 54,6 % — y la segunda es la que cuadra con los ~210 días/año con los que Andrea
    // costea. Un día que no ha pasado no es tiempo disponible desaprovechado.
    const filas = await this.prisma.client.$queryRaw<FilaUtil[]>`
      SELECT de.technician_id,
             t.full_name    AS technician_name,
             t.is_active    AS technician_active,
             de.concept_code,
             COUNT(*)::int  AS days
        FROM daily_entries de
        JOIN technicians t ON t.id = de.technician_id
       WHERE de.status IN ('submitted', 'approved')
         AND de.concept_code IS NOT NULL
         AND de.date <= CURRENT_DATE
         AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
       GROUP BY 1, 2, 3, 4
    `;

    // Se cuentan aparte y se devuelven: descartarlas en silencio dejaría al lector sin
    // saber por qué la cuadrícula (KPI-07, que sí las muestra porque reproduce el pivot
    // de Andrea) y esta pantalla no dan el mismo total de días.

    // La parte del indicador que aún no ha validado nadie. Mismo recorte que arriba
    // (con concepto, no futura) para que sea un subconjunto honesto del denominador.
    const [{ n: pendientes }] = await this.prisma.client.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
        FROM daily_entries
       WHERE status = 'submitted'
         AND concept_code IS NOT NULL
         AND date <= CURRENT_DATE
         AND (${year}::int IS NULL OR EXTRACT(YEAR FROM date)::int = ${year}::int)
    `;

    const [{ n: futuras }] = await this.prisma.client.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
        FROM daily_entries
       WHERE status IN ('submitted', 'approved')
         AND concept_code IS NOT NULL
         AND date > CURRENT_DATE
         AND (${year}::int IS NULL OR EXTRACT(YEAR FROM date)::int = ${year}::int)
    `;

    const por = new Map<string, FilaUtilizacion>();
    for (const f of filas) {
      let t = por.get(f.technician_id);
      if (!t) {
        t = {
          technicianId: f.technician_id,
          technicianName: f.technician_name,
          technicianActive: f.technician_active,
          counts: {},
          productive: 0,
          nonProductive: 0,
          excluded: 0,
          denominator: 0,
          utilizationPct: null,
        };
        por.set(f.technician_id, t);
      }
      sumar(t.counts, f.concept_code, f.days);
      if (FUERA_DEL_DENOMINADOR.includes(f.concept_code)) t.excluded += f.days;
      else if (PRODUCTIVOS.includes(f.concept_code)) t.productive += f.days;
      else t.nonProductive += f.days;
    }

    const tecnicos = [...por.values()];
    for (const t of tecnicos) {
      t.denominator = t.productive + t.nonProductive;
      // `null`, no 0: un técnico cuyos días son TODOS incapacidad no tiene una
      // utilización del 0 %, no tiene utilización. Pintar 0 % lo acusaría de algo que
      // el dato no dice.
      t.utilizationPct = t.denominator ? Math.round((t.productive / t.denominator) * 1000) / 10 : null;
    }
    tecnicos.sort((a, b) => (b.utilizationPct ?? -1) - (a.utilizationPct ?? -1));

    const productive = tecnicos.reduce((s, t) => s + t.productive, 0);
    const denominator = tecnicos.reduce((s, t) => s + t.denominator, 0);

    return {
      year,
      // La regla, explícita y en la respuesta: la pantalla la imprime.
      rule: { productive: PRODUCTIVOS, nonProductive: NO_PRODUCTIVOS, excluded: FUERA_DEL_DENOMINADOR },
      technicians: tecnicos,
      productive,
      excluded: tecnicos.reduce((s, t) => s + t.excluded, 0),
      futureExcluded: futuras,
      pendingApproval: pendientes,
      denominator,
      utilizationPct: denominator ? Math.round((productive / denominator) * 1000) / 10 : null,
    };
  }

  /** Los años con datos, para el selector. Descendente: se mira el actual primero. */
  async anios(): Promise<number[]> {
    const filas = await this.prisma.client.$queryRaw<{ year: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year
        FROM daily_entries
       WHERE status IN ('submitted', 'approved')
       ORDER BY 1 DESC
    `;
    return filas.map((f) => f.year);
  }
}
