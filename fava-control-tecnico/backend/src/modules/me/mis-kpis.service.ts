import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConceptCode } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
// La MISMA regla que el tablero del admin (KPI-02): una definición, dos consumidores.
import { FUERA_DEL_DENOMINADOR, PRODUCTIVOS } from '../kpis/kpis.service';

/**
 * KPIs OPERATIVOS del propio técnico — su memoria de trabajo, no su evaluación.
 *
 * Existe separado de `KpisService` a propósito, y la diferencia no es de estilo: aquel
 * controller es `@Roles('A','S')` porque agrega TODOS los proyectos con el mismo rol de
 * aplicación (lo dice su propia cabecera: «RLS no los protege»). Relajarlo a técnico
 * habría filtrado el vendido/ejecutado de la empresa entera.
 *
 * Aquí es al revés: se consulta la bitácora, que RLS SÍ aísla por `app.technician_id`
 * (política `de_read`). Aun así el `technician_id` va explícito en cada WHERE —
 * cinturón y tirantes, el mismo criterio que `Notes.tsx` sigue en el cliente: una
 * cuenta que es T+A+S lleva `is_admin = 'on'` y sin el filtro vería la casa entera.
 *
 * LO QUE NO SALE DE AQUÍ, y no por olvido:
 *   · `contract_value`, `normal_hours`, `order_sold_days` — lo comercial no es suyo.
 *   · Datos de OTROS técnicos. Sin comparación no hay ranking entre personas.
 *
 * LA UTILIZACIÓN SÍ SALE, pero solo la PROPIA. Estuvo fuera («es la única cifra que
 * se lee como juicio»); el diseño 2a la pone como cabecera de la pantalla del
 * técnico y el usuario la eligió. Lo que la hacía un juicio era compararse con
 * otros, y aquí no hay nadie más: es su número, con la misma regla del admin
 * (`PRODUCTIVOS` / `FUERA_DEL_DENOMINADOR`, KPI-02) para que no existan dos
 * utilizaciones distintas de la misma persona.
 */

/** Una máquina en la que trabajó, con los días que le dedicó. */
export interface MiMaquina {
  orderId: string;
  /** «PL 6000 KG - 1-3428», la etiqueta literal de la hoja de proyecto. */
  label: string;
  /** Como se nombra en obra: «3428». Puede faltar en lo migrado del Excel. */
  commessaShort: string | null;
  projectName: string;
  days: number;
}

export interface MiProyecto {
  projectId: string;
  name: string;
  clientName: string;
  days: number;
  /** Primer y último día registrado: responde «¿cuánto llevo en esta obra?». */
  firstDate: string;
  lastDate: string;
}

export interface MiConcepto {
  code: ConceptCode;
  labelEs: string;
  labelIt: string;
  days: number;
}

/** Días por mes, para la línea del diseño 2a. `month` es 'YYYY-MM'. */
export interface MiMes {
  month: string;
  days: number;
}

export interface MiUtilizacion {
  productive: number;
  /** Productivos + no productivos. Fuera: los excluidos (IL). */
  denominator: number;
  /** `null` sin días disponibles: sin denominador no hay porcentaje, no un 0 %. */
  pct: number | null;
}

/**
 * La utilización PROPIA a partir de los días por concepto. Pura: es la misma
 * aritmética que `KpisService.utilizacion` fila a fila, y se prueba sin base.
 */
export function utilizacionDe(conceptos: MiConcepto[]): MiUtilizacion {
  let productive = 0;
  let nonProductive = 0;
  for (const c of conceptos) {
    if (FUERA_DEL_DENOMINADOR.includes(c.code)) continue;
    if (PRODUCTIVOS.includes(c.code)) productive += c.days;
    else nonProductive += c.days;
  }
  const denominator = productive + nonProductive;
  return {
    productive,
    denominator,
    pct: denominator ? Math.round((productive / denominator) * 1000) / 10 : null,
  };
}

export interface MisKpis {
  year: number | null;
  /** Los años en los que tiene jornadas. Para el selector, sin inventar un rango. */
  years: number[];
  totalDays: number;
  projectCount: number;
  machineCount: number;
  /** Notas suyas en el periodo, por estado. Cierra el ciclo del envío semanal. */
  notes: { submitted: number; approved: number; returned: number };
  machines: MiMaquina[];
  projects: MiProyecto[];
  concepts: MiConcepto[];
  months: MiMes[];
  utilization: MiUtilizacion;
}

interface FilaMaquina {
  order_id: string;
  label: string;
  commessa_short: string | null;
  project_name: string;
  days: number;
}

interface FilaProyecto {
  project_id: string;
  name: string;
  client_name: string;
  days: number;
  first_date: Date;
  last_date: Date;
}

interface FilaConcepto {
  concept_code: ConceptCode;
  label_es: string;
  label_it: string;
  days: number;
}

/** 'YYYY-MM-DD' desde un `@db.Date`, sin pasar por el huso del servidor. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class MisKpisService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mismo mensaje que `DailyEntriesService.tecnicoDe`: sin ficha no hay bitácora. */
  tecnicoDe(actor: UserModel): string {
    if (!actor.technicianId) throw new ConflictException('USUARIO_SIN_TECNICO');
    return actor.technicianId;
  }

  async resumen(technicianId: string, year: number | null): Promise<MisKpis> {
    /**
     * TODOS los estados, incluido `draft`.
     *
     * Los KPIs del admin se recortan a `submitted`/`approved` porque son la cifra con
     * la que se negocia y un borrador ajeno no es un hecho. Aquí es al contrario: el
     * técnico está mirando SU trabajo, y el día que acaba de escribir es suyo desde que
     * lo escribe. Descontarlo haría que la pantalla no cuadrase con su propia semana.
     *
     * Las jornadas FUTURAS sí se quedan fuera: el técnico puede registrar por
     * adelantado y «llevo 42 días en esta máquina» no puede incluir los de la semana
     * que viene.
     */
    const filtro = { technicianId, ...(year ? { year } : {}) };

    const [maquinas, proyectos, conceptos, anios, notas, meses] = await Promise.all([
      this.maquinas(filtro),
      this.proyectos(filtro),
      this.conceptos(filtro),
      this.anios(technicianId),
      this.notas(filtro),
      this.meses(filtro),
    ]);

    return {
      year,
      years: anios,
      // El total sale de los CONCEPTOS y no de las máquinas: una jornada sin proyecto
      // (libre, no remunerado, incapacidad) no tiene máquina, y sumando por ahí el
      // total sería menor que su propia semana. Son el 63% de las filas del Excel.
      totalDays: conceptos.reduce((s, c) => s + c.days, 0),
      projectCount: proyectos.length,
      machineCount: maquinas.length,
      notes: notas,
      machines: maquinas,
      projects: proyectos,
      concepts: conceptos,
      months: meses,
      utilization: utilizacionDe(conceptos),
    };
  }

  /**
   * Días CON concepto por mes. `to_char` sobre la columna DATE, sin pasar por el
   * huso del proceso: es la misma razón por la que `iso()` no usa getters.
   */
  private meses(f: { technicianId: string; year?: number }): Promise<MiMes[]> {
    const year = f.year ?? null;
    return this.prisma.client.$queryRaw<MiMes[]>`
      SELECT to_char(de.date, 'YYYY-MM') AS month,
             COUNT(*)::int              AS days
        FROM daily_entries de
       WHERE de.technician_id = ${f.technicianId}::uuid
         AND de.concept_code IS NOT NULL
         AND de.date <= CURRENT_DATE
         AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
       GROUP BY 1
       ORDER BY 1
    `;
  }

  /**
   * Días por MÁQUINA, contando la principal Y las adicionales de BIT-10.
   *
   * El UNION ALL no es un adorno: `order_id` es la máquina principal y
   * `daily_entry_orders` son las demás del mismo día. Contar solo la principal
   * repetiría exactamente el problema que BIT-10 vino a resolver — Camilo con tres
   * máquinas a la vez vería sus días en una sola.
   *
   * Un día con tres máquinas cuenta UN día en cada una. La suma de la columna es
   * mayor que los días trabajados, y es lo correcto: la pregunta es «cuántos días
   * toqué esta máquina», no «cómo reparto mi jornada».
   */
  private maquinas(f: { technicianId: string; year?: number }): Promise<MiMaquina[]> {
    const year = f.year ?? null;
    return this.prisma.client
      .$queryRaw<FilaMaquina[]>`
        WITH mias AS (
          SELECT de.order_id
            FROM daily_entries de
           WHERE de.technician_id = ${f.technicianId}::uuid
             AND de.order_id IS NOT NULL
             AND de.date <= CURRENT_DATE
             AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
          UNION ALL
          SELECT deo.order_id
            FROM daily_entry_orders deo
            JOIN daily_entries de ON de.id = deo.daily_entry_id
           WHERE de.technician_id = ${f.technicianId}::uuid
             AND de.date <= CURRENT_DATE
             AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
        )
        SELECT o.id            AS order_id,
               o.label         AS label,
               o.commessa_short,
               p.name          AS project_name,
               COUNT(*)::int   AS days
          FROM mias m
          JOIN orders o   ON o.id = m.order_id
          JOIN projects p ON p.id = o.project_id
         GROUP BY o.id, o.label, o.commessa_short, p.name
         ORDER BY days DESC, o.label ASC
      `
      .then((filas) =>
        filas.map((r) => ({
          orderId: r.order_id,
          label: r.label,
          commessaShort: r.commessa_short,
          projectName: r.project_name,
          days: r.days,
        })),
      );
  }

  /** Días por PROYECTO, con el periodo que abarcan. Sin nada comercial. */
  private proyectos(f: { technicianId: string; year?: number }): Promise<MiProyecto[]> {
    const year = f.year ?? null;
    return this.prisma.client
      .$queryRaw<FilaProyecto[]>`
        SELECT p.id           AS project_id,
               p.name         AS name,
               p.client_name  AS client_name,
               COUNT(*)::int  AS days,
               MIN(de.date)   AS first_date,
               MAX(de.date)   AS last_date
          FROM daily_entries de
          JOIN projects p ON p.id = de.project_id
         WHERE de.technician_id = ${f.technicianId}::uuid
           AND de.date <= CURRENT_DATE
           AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
         GROUP BY p.id, p.name, p.client_name
         ORDER BY days DESC, p.name ASC
      `
      .then((filas) =>
        filas.map((r) => ({
          projectId: r.project_id,
          name: r.name,
          clientName: r.client_name,
          days: r.days,
          firstDate: iso(r.first_date),
          lastDate: iso(r.last_date),
        })),
      );
  }

  /**
   * Días por CONCEPTO, con la etiqueta del catálogo — que el Super Admin edita
   * (CAT-01), así que se lee de la tabla y no de una lista escrita aquí.
   */
  private conceptos(f: { technicianId: string; year?: number }): Promise<MiConcepto[]> {
    const year = f.year ?? null;
    return this.prisma.client
      .$queryRaw<FilaConcepto[]>`
        SELECT de.concept_code,
               c.label_es,
               c.label_it,
               COUNT(*)::int AS days
          FROM daily_entries de
          JOIN concepts c ON c.code = de.concept_code
         WHERE de.technician_id = ${f.technicianId}::uuid
           AND de.concept_code IS NOT NULL
           AND de.date <= CURRENT_DATE
           AND (${year}::int IS NULL OR EXTRACT(YEAR FROM de.date)::int = ${year}::int)
         GROUP BY de.concept_code, c.label_es, c.label_it
         ORDER BY days DESC
      `
      .then((filas) =>
        filas.map((r) => ({
          code: r.concept_code,
          labelEs: r.label_es,
          labelIt: r.label_it,
          days: r.days,
        })),
      );
  }

  /** Los años CON jornadas suyas, para el selector. Nunca un rango inventado. */
  private anios(technicianId: string): Promise<number[]> {
    return this.prisma.client
      .$queryRaw<{ year: number }[]>`
        SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year
          FROM daily_entries
         WHERE technician_id = ${technicianId}::uuid
           AND date <= CURRENT_DATE
         ORDER BY year DESC
      `
      .then((filas) => filas.map((r) => r.year));
  }

  /**
   * Sus notas por estado. `draft` no se cuenta: una nota en borrador no existe para
   * el técnico —las crea el servidor al ENVIAR la semana (NOTA-01)—, así que
   * enseñarla sería contar algo que él nunca vio nacer.
   */
  private async notas(f: { technicianId: string; year?: number }) {
    const year = f.year ?? null;
    const filas = await this.prisma.client.$queryRaw<{ status: string; n: number }[]>`
      SELECT status, COUNT(*)::int AS n
        FROM weekly_notes
       WHERE technician_id = ${f.technicianId}::uuid
         AND status <> 'draft'
         AND (${year}::int IS NULL OR EXTRACT(YEAR FROM week_start)::int = ${year}::int)
       GROUP BY status
    `;
    const de = (s: string) => filas.find((r) => r.status === s)?.n ?? 0;
    return { submitted: de('submitted'), approved: de('approved'), returned: de('returned') };
  }
}
