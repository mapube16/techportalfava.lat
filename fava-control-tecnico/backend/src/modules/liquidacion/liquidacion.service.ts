import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConceptCode } from '../../generated/prisma/enums';
import { aDate, aTexto, lunesDe, sumarDias } from '../daily-entries/fecha';

/**
 * LIQUIDACIÓN DEL MES — la vista del día 25 (diseño 5a/5b/5c).
 *
 * Los datos ya estaban en la cuadrícula KPI-07, pero ordenados por PROYECTO. Nómina se
 * paga por PERSONA: esta es la tabla de días por concepto y por técnico que Andrea
 * suma a mano cada día 25 desde una tabla dinámica del Excel.
 *
 * Tres decisiones que la hacen un instrumento de cierre y no un informe más:
 *
 *   · SOLO CUENTA LO APROBADO. Un día enviado sin validar no se paga; lo que entraría
 *     al aprobar se devuelve aparte (`pending`) para que la cifra pagable no se ensucie.
 *   · EL ESTADO DICE A QUIÉN LE FALTA ALGO. El problema del 25 no es sumar, es cerrar:
 *     días sin aprobar (Andrea), semanas sin enviar (el técnico), o nada en el periodo.
 *   · NI UN IMPORTE. La app entrega cantidades; Andrea multiplica (fuera de alcance:
 *     «la app entrega insumos, no calcula sueldos»).
 *
 * EL CORTE ES 26 → 25. Andrea cierra el 25 (capacitación del 31-ago) y el aviso del
 * corte ya trata «del 26 al fin de mes» como parte del cierre siguiente. Es la lectura
 * más razonable y NO está confirmada por FAVA: por eso el mes calendario sigue
 * disponible como modo alternativo, y por eso el rango viaja explícito en la respuesta.
 *
 * LR / NR según el tipo de técnico: «al externo no se le pagan los libres» (Andrea,
 * 30-ago). Al externo la celda LR no aplica, y al interno la NR: se devuelven como
 * `null`, que la pantalla pinta «—». Un 0 diría «trabajó cero días»; «—» dice «este
 * concepto no le corresponde».
 */

export type Modo = 'cut' | 'calendar';

export interface Celda {
  /** Días aprobados. `null` = el concepto no aplica a este tipo de técnico. */
  approved: number | null;
  /** Días en `submitted`: entrarían al aprobar. */
  pending: number;
}

export type EstadoFila =
  | { kind: 'ready' }
  | { kind: 'unapproved'; n: number }
  | { kind: 'unsent'; n: number }
  | { kind: 'none' };

export interface FilaLiquidacion {
  technicianId: string;
  name: string;
  employmentType: string;
  cells: Record<string, Celda>;
  total: number;
  state: EstadoFila;
}

export interface Liquidacion {
  period: string;
  mode: Modo;
  from: string;
  to: string;
  concepts: { code: ConceptCode; labelEs: string; labelIt: string }[];
  summary: { tecnicos: number; listos: number; pendientes: number; dias: number };
  rows: FilaLiquidacion[];
}

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** El rango de un periodo 'YYYY-MM'. Puro: es donde vive la regla del corte. */
export function rangoDe(period: string, mode: Modo): { from: string; to: string } {
  if (!PERIODO.test(period)) throw new BadRequestException('PERIODO_INVALIDO');
  const primero = `${period}-01`;
  if (mode === 'calendar') {
    const siguiente = sumarDias(primero, 31); // cae seguro en el mes siguiente
    return { from: primero, to: sumarDias(`${siguiente.slice(0, 7)}-01`, -1) };
  }
  // 26 del mes anterior → 25 de este. El 26 anterior es «el día 1 menos 6 días» solo
  // cuando el mes anterior tiene 31 días; se calcula desde el 1 del mes anterior.
  const anterior = sumarDias(primero, -1).slice(0, 7);
  return { from: `${anterior}-26`, to: `${period}-25` };
}

/**
 * El estado de una fila, por prioridad: lo que impide cerrar va primero.
 *
 * `unsent` cuenta SEMANAS con borradores, no días: es lo que el técnico tiene que
 * hacer («envía la semana 34»). Las semanas vacías dentro del periodo NO se cuentan:
 * en un mes en curso serían las que aún no han pasado, y en uno cerrado el recordatorio
 * del viernes ya las persiguió. Aquí no se inventa una alarma que aquel no dio.
 */
export function estadoDe(c: { approved: number; submitted: number; draftWeeks: number }): EstadoFila {
  if (c.draftWeeks > 0) return { kind: 'unsent', n: c.draftWeeks };
  if (c.submitted > 0) return { kind: 'unapproved', n: c.submitted };
  if (c.approved > 0) return { kind: 'ready' };
  return { kind: 'none' };
}

/** Si un concepto aplica a este tipo de técnico. La regla dura vive en daily-entries. */
export const aplica = (code: string, employmentType: string) =>
  !((code === 'LR' && employmentType === 'EXTERNO') || (code === 'NR' && employmentType === 'INTERNO'));

/**
 * La celda que se devuelve. «—» SOLO si el concepto no aplica Y no hay nada: el
 * servidor bloquea LR a externos, pero NR a internos no (sale en datos reales), y
 * un día que existe no se esconde detrás de un guion — se pinta, y que se vea raro.
 * Esconderlo lo dejaría fuera del total y de la nómina sin que nadie lo notara.
 */
export const celda = (applies: boolean, base: Celda | undefined): Celda => {
  const c = base ?? { approved: 0, pending: 0 };
  if (applies) return c;
  return (c.approved ?? 0) > 0 || c.pending > 0 ? c : { approved: null, pending: 0 };
};

interface FilaCruda {
  technician_id: string;
  status: string;
  concept_code: ConceptCode;
  date: Date;
  days: number;
}

@Injectable()
export class LiquidacionService {
  constructor(private readonly prisma: PrismaService) {}

  async liquidar(period: string, mode: Modo): Promise<Liquidacion> {
    const { from, to } = rangoDe(period, mode);

    const [tecnicos, conceptos, filas] = await Promise.all([
      // Los activos siempre, aunque no tengan días (salen como «sin días»); los
      // inactivos solo si tienen días en el periodo (se resuelve abajo).
      this.prisma.client.technician.findMany({
        select: { id: true, fullName: true, employmentType: true, isActive: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.client.concept.findMany({
        select: { code: true, labelEs: true, labelIt: true },
        orderBy: { sortOrder: 'asc' },
      }),
      // Por técnico, estado y concepto; y por FECHA para poder contar semanas con
      // borradores. Postgres agrega; aquí solo se reparte.
      this.prisma.client.$queryRaw<FilaCruda[]>`
        SELECT de.technician_id,
               de.status,
               de.concept_code,
               de.date,
               COUNT(*)::int AS days
          FROM daily_entries de
         WHERE de.concept_code IS NOT NULL
           AND de.date >= ${aDate(from)}
           AND de.date <= ${aDate(to)}
           AND de.date <= CURRENT_DATE
         GROUP BY 1, 2, 3, 4
      `,
    ]);

    const porTecnico = new Map<
      string,
      { cells: Map<string, Celda>; approved: number; submitted: number; semanasDraft: Set<string> }
    >();
    const de = (id: string) => {
      let t = porTecnico.get(id);
      if (!t) {
        t = { cells: new Map(), approved: 0, submitted: 0, semanasDraft: new Set() };
        porTecnico.set(id, t);
      }
      return t;
    };

    for (const f of filas) {
      const t = de(f.technician_id);
      if (f.status === 'approved') {
        const c = t.cells.get(f.concept_code) ?? { approved: 0, pending: 0 };
        c.approved = (c.approved ?? 0) + f.days;
        t.cells.set(f.concept_code, c);
        t.approved += f.days;
      } else if (f.status === 'submitted') {
        const c = t.cells.get(f.concept_code) ?? { approved: 0, pending: 0 };
        c.pending += f.days;
        t.cells.set(f.concept_code, c);
        t.submitted += f.days;
      } else if (f.status === 'draft' || f.status === 'returned') {
        t.semanasDraft.add(lunesDe(aTexto(f.date)));
      }
    }

    const rows: FilaLiquidacion[] = [];
    for (const tec of tecnicos) {
      const t = porTecnico.get(tec.id);
      if (!tec.isActive && !t) continue;
      const cells: Record<string, Celda> = {};
      for (const c of conceptos) {
        cells[c.code] = celda(aplica(c.code, tec.employmentType), t?.cells.get(c.code));
      }
      rows.push({
        technicianId: tec.id,
        name: tec.fullName,
        employmentType: tec.employmentType,
        cells,
        total: t?.approved ?? 0,
        state: estadoDe({
          approved: t?.approved ?? 0,
          submitted: t?.submitted ?? 0,
          draftWeeks: t?.semanasDraft.size ?? 0,
        }),
      });
    }

    return {
      period,
      mode,
      from,
      to,
      concepts: conceptos,
      summary: {
        tecnicos: rows.length,
        listos: rows.filter((r) => r.state.kind === 'ready').length,
        pendientes: rows.filter((r) => r.state.kind === 'unapproved' || r.state.kind === 'unsent').length,
        dias: rows.reduce((s, r) => s + r.total, 0),
      },
      rows,
    };
  }

  /**
   * La misma tabla en un .xlsx: es lo que Andrea y la casa matriz abren y reenvían tal
   * cual. Excel y no CSV a petición del cliente. Sin fórmulas ni formatos de moneda:
   * cantidades, igual que la pantalla.
   */
  async xlsx(period: string, mode: Modo, lang: string): Promise<Buffer> {
    const liq = await this.liquidar(period, mode);
    const es = lang !== 'it';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Liquidación ${period}`);

    ws.columns = [
      { header: es ? 'Técnico' : 'Tecnico', key: 'name', width: 30 },
      { header: es ? 'Tipo' : 'Tipo', key: 'tipo', width: 10 },
      ...liq.concepts.map((c) => ({ header: c.code, key: c.code, width: 8 })),
      { header: 'Total', key: 'total', width: 8 },
      { header: es ? 'Sin aprobar' : 'Da approvare', key: 'pending', width: 12 },
      { header: es ? 'Estado' : 'Stato', key: 'state', width: 26 },
    ];
    ws.getRow(1).font = { bold: true };

    const estado = (s: EstadoFila) =>
      s.kind === 'ready'
        ? es ? 'Listo' : 'Pronto'
        : s.kind === 'unapproved'
          ? es ? `${s.n} días sin aprobar` : `${s.n} giorni da approvare`
          : s.kind === 'unsent'
            ? es ? `${s.n} semanas sin enviar` : `${s.n} settimane non inviate`
            : es ? 'Sin días' : 'Nessun giorno';

    for (const r of liq.rows) {
      const fila: Record<string, string | number> = {
        name: r.name,
        tipo: r.employmentType === 'EXTERNO' ? (es ? 'Externo' : 'Esterno') : es ? 'Interno' : 'Interno',
        total: r.total,
        pending: Object.values(r.cells).reduce((s, c) => s + c.pending, 0),
        state: estado(r.state),
      };
      for (const c of liq.concepts) {
        const cell = r.cells[c.code];
        fila[c.code] = cell.approved === null ? '—' : cell.approved;
      }
      ws.addRow(fila);
    }

    // Fila de totales por concepto, en negrita: es lo que Andrea copia al final.
    const tot: Record<string, string | number> = { name: es ? 'TOTAL' : 'TOTALE', total: liq.summary.dias };
    for (const c of liq.concepts)
      tot[c.code] = liq.rows.reduce((s, r) => s + (r.cells[c.code].approved ?? 0), 0);
    ws.addRow(tot).font = { bold: true };

    // Rango del corte, para que el archivo se explique solo fuera de la app.
    ws.addRow([]);
    ws.addRow([es ? `Periodo: ${liq.from} → ${liq.to}` : `Periodo: ${liq.from} → ${liq.to}`]);
    ws.addRow([es ? 'Solo días aprobados. LR solo internos, NR solo externos.' : 'Solo giorni approvati. LR solo interni, NR solo esterni.']);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
