import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EDITABLES } from '../../common/estados';
import { aDate } from './fecha';

/**
 * GASTO-01 — los gastos del DIA en que ocurren.
 *
 * Ivan Cortes lo pidio en la capacitacion del 2026-08-31: «¿no seria mas util tenerlo en
 * el diario? a veces uno efectuo el gasto de una vez, tiene la factura». Andrea acepto
 * en el momento. Antes solo se podian escribir al ENVIAR la nota: el viernes, de memoria
 * y con el ticket ya perdido.
 *
 * Vive en el modulo de la bitacora y no en el de notas porque su dueño es la JORNADA:
 * se captura con el dia, se bloquea con el dia (BIT-05) y desaparece con el dia. La nota
 * los LEE al imprimirse; no los posee.
 */

/** Lo que la pantalla ve de un gasto. Los bytes NUNCA viajan en el listado. */
const GASTO = {
  id: true,
  descripcion: true,
  valor: true,
  mimeType: true,
  sizeBytes: true,
} as const;

export interface GastoEntrada {
  descripcion: string;
  valor: string;
  /** El comprobante es opcional: se anota el gasto ahora y se sube la foto despues. */
  mimeType?: string | null;
  bytes?: Buffer | null;
}

/** Tope por dia. Cinco o seis gastos es lo normal segun Andrea; diez es holgado. */
const MAX_POR_DIA = 10;

@Injectable()
export class GastosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La jornada del dia, comprobando que sea DEL tecnico y que se pueda tocar.
   *
   * RLS ya impide ver la de otro, pero devolveria «no encontrada» sin decir por que; y
   * el bloqueo de lo enviado (BIT-05) es una regla de negocio, no de fila. Los dos
   * mensajes son los mismos que ya usa el guardado del dia, para que el tecnico lea lo
   * que ya conoce.
   */
  private async jornadaEditable(technicianId: string, fecha: string) {
    const dia = await this.prisma.client.dailyEntry.findUnique({
      where: { technicianId_date: { technicianId, date: aDate(fecha) } },
      select: { id: true, status: true },
    });
    if (dia && !EDITABLES.includes(dia.status)) throw new ConflictException('JORNADA_BLOQUEADA');
    return dia;
  }

  /**
   * La jornada donde colgar el gasto, CREANDOLA VACIA si el dia esta en blanco.
   *
   * El caso real es el corriente: el tecnico abre el dia para apuntar el taxi del
   * aeropuerto y todavia no ha escrito el trabajo. Exigirle que primero describa la
   * jornada convierte «apuntar un gasto» en dos tareas, que es justo la friccion por la
   * que los gastos se acababan escribiendo el viernes de memoria.
   *
   * La fila nace en `draft` y sin concepto — igual que un dia que el tecnico abrio y no
   * completo. No cuenta como dia trabajado en ningun sitio: la cuadricula y la
   * utilizacion filtran por `concept_code IS NOT NULL`, asi que un dia que solo tiene un
   * gasto no infla ningun indicador.
   */
  private async jornadaParaEscribir(technicianId: string, fecha: string) {
    const dia = await this.jornadaEditable(technicianId, fecha);
    if (dia) return dia;

    const tec = await this.prisma.client.technician.findUnique({
      where: { id: technicianId },
      select: { roleTypeId: true },
    });
    return this.prisma.client.dailyEntry.create({
      data: {
        technicianId,
        date: aDate(fecha),
        status: 'draft',
        roleTypeId: tec?.roleTypeId ?? null,
      },
      select: { id: true, status: true },
    });
  }

  listar(technicianId: string, fecha: string) {
    return this.prisma.client.dailyExpense.findMany({
      where: { dailyEntry: { technicianId, date: aDate(fecha) } },
      select: GASTO,
      orderBy: { createdAt: 'asc' },
    });
  }

  async crear(technicianId: string, fecha: string, datos: GastoEntrada) {
    const dia = await this.jornadaParaEscribir(technicianId, fecha);

    const cuantos = await this.prisma.client.dailyExpense.count({
      where: { dailyEntryId: dia.id },
    });
    if (cuantos >= MAX_POR_DIA) throw new BadRequestException('DEMASIADOS_GASTOS');

    return this.prisma.client.dailyExpense.create({
      data: {
        dailyEntryId: dia.id,
        descripcion: datos.descripcion,
        valor: datos.valor,
        // El CHECK del motor exige las tres columnas o ninguna: media foto guardada es
        // una fila que el servidor no sabe devolver.
        mimeType: datos.bytes ? datos.mimeType : null,
        // `new Uint8Array(...)` y no el Buffer tal cual: Prisma 7 tipa Bytes como
        // `Uint8Array<ArrayBuffer>` y un Buffer de Node puede apoyarse en un
        // SharedArrayBuffer. Mismo patron que `note_pdfs` y `expense_receipts`.
        bytes: datos.bytes ? new Uint8Array(datos.bytes) : null,
        sizeBytes: datos.bytes ? datos.bytes.length : null,
      },
      select: GASTO,
    });
  }

  /**
   * Borrar un gasto mal escrito el mismo dia es corregir, no falsear historia — por eso
   * aqui SI hay borrado real, al reves que en los maestros. Lo que no se puede es tocar
   * una jornada ya enviada, y de eso se encarga `jornadaEditable`.
   */
  async eliminar(technicianId: string, fecha: string, gastoId: string) {
    // Aqui NO se crea nada: sin jornada no hay gasto que borrar.
    const dia = await this.jornadaEditable(technicianId, fecha);
    const gasto = dia
      ? await this.prisma.client.dailyExpense.findFirst({
          where: { id: gastoId, dailyEntryId: dia.id },
          select: { id: true },
        })
      : null;
    if (!gasto) throw new NotFoundException('GASTO_NO_ENCONTRADO');

    await this.prisma.client.dailyExpense.delete({ where: { id: gastoId } });
    return { id: gastoId };
  }

  /** Los bytes de un comprobante, para verlo en pantalla. */
  async comprobante(technicianId: string, fecha: string, gastoId: string) {
    const g = await this.prisma.client.dailyExpense.findFirst({
      where: { id: gastoId, dailyEntry: { technicianId, date: aDate(fecha) } },
      select: { mimeType: true, bytes: true },
    });
    if (!g) throw new NotFoundException('GASTO_NO_ENCONTRADO');
    if (!g.bytes || !g.mimeType) throw new NotFoundException('COMPROBANTE_NO_DISPONIBLE');
    return { mimeType: g.mimeType, bytes: Buffer.from(g.bytes) };
  }
}
