import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConceptCode, Phase } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { aDate, aTexto, ventana } from './fecha';

/**
 * El `select` ES el contrato (doctrina de 02-05). Lo devuelven IGUAL el `GET` de la
 * semana y el `PUT` del dia: la grilla sustituye la fila que acaba de guardar sin un
 * refetch, igual que el `PUT` de sold-days devuelve el `delta` recalculado.
 *
 * `project.name` y `machineModel.code` viajan denormalizados y no por comodidad: un
 * proyecto cerrado no sale del selector (`listarParaTecnico` filtra activos) pero sus
 * dias SI se ven, y sin el nombre en la fila se pintarian en blanco.
 *
 * `updatedAt` es lo unico contra lo que `enConflicto()` del borrador local (03-02)
 * puede comparar su `savedAt`: sin el, la deteccion de conflicto no existe.
 */
const FILA = {
  date: true,
  projectId: true,
  machineModelId: true,
  conceptCode: true,
  phase: true,
  description: true,
  status: true,
  updatedAt: true,
  project: { select: { name: true } },
  machineModel: { select: { code: true } },
} as const;

/** Rango maximo del `GET`: sin techo, un `from=2020-01-01` se trae la tabla entera. */
const RANGO_MAX_DIAS = 30;

const DIA_MS = 86_400_000;

/** Los 5 campos que BIT-01 captura. El servidor calcula todo lo demas. */
export interface Jornada {
  projectId: string | null;
  machineModelId: string | null;
  conceptCode: ConceptCode | null;
  phase: Phase | null;
  description: string | null;
}

interface Cruda {
  date: Date;
  projectId: string | null;
  machineModelId: string | null;
  conceptCode: ConceptCode | null;
  phase: Phase | null;
  description: string | null;
  status: string;
  updatedAt: Date;
  project: { name: string } | null;
  machineModel: { code: string } | null;
}

const plana = (f: Cruda) => ({
  date: aTexto(f.date),
  projectId: f.projectId,
  projectName: f.project?.name ?? null,
  machineModelId: f.machineModelId,
  machineCode: f.machineModel?.code ?? null,
  conceptCode: f.conceptCode,
  phase: f.phase,
  description: f.description,
  status: f.status,
  updatedAt: f.updatedAt.toISOString(),
});

@Injectable()
export class DailyEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * PRIMERA puerta de los tres endpoints, antes que la forma de la fecha y que la del
   * cuerpo: sin vinculo no hay nada que hacer.
   *
   * El `technicianId` sale SIEMPRE de `req.user`, que es de donde sale la GUC
   * `app.technician_id`, y JAMAS del cliente. Con el vinculo a null la GUC vale `''`,
   * `NULLIF(…,'')::uuid` es NULL y la politica `de_self` filtra en SILENCIO: el `GET`
   * devolveria `[]` y el `INSERT` un 42501 crudo. Las dos cosas le dicen al tecnico que
   * la app le borro el trabajo.
   */
  tecnicoDe(actor: UserModel): string {
    if (!actor.technicianId) throw new ConflictException('USUARIO_SIN_TECNICO');
    return actor.technicianId;
  }

  /**
   * La semana (o cualquier rango de hasta 31 dias) del PROPIO tecnico. La ventana
   * viaja con los datos para que cliente y servidor no deriven: el cliente pinta
   * bloqueado lo que caiga fuera en vez de calcularlo por su cuenta.
   */
  async semana(technicianId: string, from: unknown, to: unknown) {
    if (typeof from !== 'string' || typeof to !== 'string')
      throw new BadRequestException('RANGO_INVALIDO');

    const desde = aDate(from);
    const hasta = aDate(to);
    const dias = (hasta.getTime() - desde.getTime()) / DIA_MS;
    if (dias < 0 || dias > RANGO_MAX_DIAS) throw new BadRequestException('RANGO_INVALIDO');

    const filas = await this.prisma.client.dailyEntry.findMany({
      where: { technicianId, date: { gte: desde, lte: hasta } },
      select: FILA,
      orderBy: { date: 'asc' },
    });

    const { min, max } = ventana();
    return { minDate: min, maxDate: max, entries: filas.map(plana) };
  }

  /**
   * PUT del dia. Idempotente por CLAVE NATURAL, no por cabecera:
   *  - `UNIQUE(technician_id, date)` existe desde `20260725220221_init`
   *  - VERIFICADO: 8 upserts concurrentes sobre esta clave con la fila inexistente ->
   *    8 respuestas OK, 1 fila, cero P2002 (Prisma emite INSERT ... ON CONFLICT).
   *
   * OJO: la ruta rapida se pierde EN SILENCIO si `create`/`update` llevan escrituras
   * ANIDADAS. Por eso van IDs escalares planos y NO `{ project: { connect: ... } }`.
   * Y no hay salida: un P2002 dentro de la $transaction del RlsInterceptor la deja
   * abortada (verificado: P2039 al cerrar), asi que no se puede capturar y reintentar.
   */
  async guardar(technicianId: string, fecha: string, datos: Jornada) {
    const date = aDate(fecha);

    const fila = await this.prisma.client.dailyEntry.upsert({
      where: { technicianId_date: { technicianId, date } },
      create: { technicianId, date, status: 'draft', ...datos },
      update: { ...datos },
      select: FILA,
    });
    return plana(fila);
  }
}
