import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { UserModel } from '../../generated/prisma/models';
import { aDate, aTexto, lunesDe, sumarDias, ventana } from '../daily-entries/fecha';

/**
 * Lo que al PROPIO tecnico le falta por hacer (`GET /api/me/pendientes`) — diseno 3b.
 *
 * El criterio de «semana sin enviar» es el MISMO que el del recordatorio del viernes
 * (`recordatorios.ts` → `faltantes()`): hay borradores, o no hay nada. Se derivo alli de
 * lo que hacen `enviarSemana` y `reopen`, y resuelve los tres casos que se escapan
 * mirando `weekly_notes` (semana sin proyecto, semana reabierta, semana vacia). Aqui no
 * se reusa la funcion porque aquella responde «¿que tecnicos faltan esta semana?» y esta
 * «¿que semanas le faltan a este tecnico?» — misma regla, otro eje.
 *
 * Solo la ventana editable (`ventana()`, con tolerancia de huso): una semana mas vieja
 * ya no la puede arreglar el tecnico, y listarsela seria un pendiente sin salida.
 *
 * El `technicianId` sale del token y ademas va en el WHERE: RLS ya aisla la bitacora,
 * pero una cuenta T+A+S lleva `is_admin = 'on'` y sin el filtro veria la casa entera.
 */

/** El dia en que Andrea cierra el mes. Dictado en la capacitacion del 31-ago. */
export const DIA_CORTE = 25;

export interface SemanaPendiente {
  /** Lunes, 'YYYY-MM-DD'. */
  lunes: string;
  /** Dias con concepto. Una jornada vacia (creada por un gasto) no cuenta. */
  registrados: number;
  /** Filas en 'draft', con o sin concepto: es lo que impide que la semana este enviada. */
  borradores: number;
}

export interface Pendientes {
  minDate: string;
  maxDate: string;
  diaCorte: number;
  /** Todas las semanas de la ventana, incluidas las que no tienen nada. */
  semanas: SemanaPendiente[];
}

/** Lo que la consulta trae de cada jornada. Estructural para probar sin base. */
export interface FilaJornada {
  date: string;
  status: string;
  conceptCode: string | null;
}

/**
 * Reparte las jornadas en las semanas de `min`..`max`. Pura: es donde estan las trampas
 * (el domingo pertenece a SU lunes, una semana vacia tiene que aparecer igual) y por eso
 * se prueba sin base de datos.
 */
export function agruparSemanas(min: string, max: string, filas: FilaJornada[]): SemanaPendiente[] {
  const porLunes = new Map<string, SemanaPendiente>();
  for (let lunes = lunesDe(min); lunes <= max; lunes = sumarDias(lunes, 7)) {
    porLunes.set(lunes, { lunes, registrados: 0, borradores: 0 });
  }
  for (const f of filas) {
    const s = porLunes.get(lunesDe(f.date));
    if (!s) continue;
    if (f.conceptCode) s.registrados += 1;
    if (f.status === 'draft') s.borradores += 1;
  }
  return [...porLunes.values()];
}

@Injectable()
export class PendientesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mismo mensaje que `DailyEntriesService.tecnicoDe`: sin ficha no hay bitacora. */
  tecnicoDe(actor: UserModel): string {
    if (!actor.technicianId) throw new ConflictException('USUARIO_SIN_TECNICO');
    return actor.technicianId;
  }

  async mios(technicianId: string): Promise<Pendientes> {
    const { min, max } = ventana();
    const filas = await this.prisma.client.dailyEntry.findMany({
      where: { technicianId, date: { gte: aDate(min), lte: aDate(max) } },
      select: { date: true, status: true, conceptCode: true },
    });
    return {
      minDate: min,
      maxDate: max,
      diaCorte: DIA_CORTE,
      semanas: agruparSemanas(
        min,
        max,
        filas.map((f) => ({ date: aTexto(f.date), status: f.status, conceptCode: f.conceptCode })),
      ),
    };
  }
}
