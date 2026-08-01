import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Lo que ve la pantalla de una orden. `select` explicito por el mismo motivo que en
 * proyectos: una columna nueva del esquema no se filtra sola a la respuesta.
 */
const ORDEN = {
  id: true,
  label: true,
  machineModelId: true,
  commessa: true,
  commessaShort: true,
  oaNumber: true,
  contractValue: true,
  currencyCode: true,
  isActive: true,
} as const;

export interface DatosOrden {
  label?: string;
  machineModelId?: string | null;
  commessa?: string | null;
  commessaShort?: string | null;
  oaNumber?: string | null;
  contractValue?: number | null;
  currencyCode?: string | null;
  isActive?: boolean;
}

/** Misma conversion que en `projects.service.ts`: Decimal serializa como string. */
type Dinero = { toString(): string } | null;
const dinero = (v: Dinero): number | null => (v === null ? null : Number(v));

/**
 * La maquina contratada. Vive en el modulo de proyectos porque no tiene ciclo de vida
 * propio: una orden sin proyecto no existe.
 *
 * Es CRUD de verdad y no un «reemplazar la seleccion» como el viejo PUT /machines: la
 * orden lleva commessa, OA e importe, asi que reemplazarla entera perderia datos que
 * nadie pidio borrar.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(projectId: string) {
    const filas = await this.prisma.client.order.findMany({
      where: { projectId },
      select: ORDEN,
      orderBy: { label: 'asc' },
    });
    return filas.map((o) => ({ ...o, contractValue: dinero(o.contractValue) }));
  }

  async crear(projectId: string, datos: DatosOrden & { label: string }) {
    const proyecto = await this.prisma.client.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!proyecto) throw new NotFoundException('PROYECTO_NO_ENCONTRADO');

    const fila = await this.intentar(() =>
      this.prisma.client.order.create({ data: { ...datos, projectId }, select: ORDEN }),
    );
    return { ...fila, contractValue: dinero(fila.contractValue) };
  }

  async editar(id: string, datos: DatosOrden) {
    const fila = await this.intentar(() =>
      this.prisma.client.order.update({ where: { id }, data: datos, select: ORDEN }),
    );
    return { ...fila, contractValue: dinero(fila.contractValue) };
  }

  /**
   * Borrado real, no desactivacion, y solo si nadie la referencia. Es la diferencia
   * con un maestro: una orden creada por error no es historia que preservar.
   *
   * Se comprueba ANTES de borrar en vez de atrapar el P2003: el error del motor deja
   * la transaccion de la peticion abortada (25P02) y el mensaje no distingue cual de
   * las dos referencias falló.
   */
  async eliminar(id: string) {
    const c = this.prisma.client;
    const [orden, jornadas, vendidos] = await Promise.all([
      c.order.findUnique({ where: { id }, select: { id: true } }),
      c.dailyEntry.count({ where: { orderId: id } }),
      c.orderSoldDays.count({ where: { orderId: id } }),
    ]);
    if (!orden) throw new NotFoundException('ORDEN_NO_ENCONTRADA');
    if (jornadas > 0) throw new BadRequestException('ORDEN_CON_BITACORA');
    if (vendidos > 0) throw new BadRequestException('ORDEN_CON_DIAS_VENDIDOS');

    await c.order.delete({ where: { id } });
    return { id };
  }

  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // La commessa es @unique en todo el sistema: identifica la maquina en la casa
      // matriz, asi que dos proyectos no pueden reclamar la misma.
      if (code === 'P2002') throw new BadRequestException('COMMESSA_DUPLICADA');
      if (code === 'P2003') throw new BadRequestException('MAQUINA_O_MONEDA_INEXISTENTE');
      if (code === 'P2025') throw new NotFoundException('ORDEN_NO_ENCONTRADA');
      throw e;
    }
  }
}
