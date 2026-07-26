import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConceptCode } from '../../generated/prisma/enums';

/**
 * `select` explicito en los cuatro: es el contrato que consume el cliente
 * (frontend/src/lib/api/catalogs.ts) y una columna nueva en el esquema no debe
 * filtrarse a la respuesta sin que nadie lo decida.
 */
const CONCEPTO = { code: true, labelEs: true, labelIt: true, sortOrder: true } as const;
const ROL = { id: true, name: true, isActive: true } as const;
const MONEDA = { code: true, symbol: true, isActive: true } as const;
const MAQUINA = { id: true, code: true, description: true, isActive: true } as const;

/**
 * Prisma -> HTTP. Sin esto, un `id` inexistente en un PATCH sale como 500.
 * P2025 = la fila no existe · P2002 = choque de @unique que el pre-chequeo no vio
 * (carrera entre dos Super Admins) · P2003 = FK inexistente.
 */
function traducir(e: unknown): never {
  const code = (e as { code?: string })?.code;
  if (code === 'P2025') throw new NotFoundException('NO_ENCONTRADO');
  if (code === 'P2002') throw new ConflictException('YA_EXISTE');
  throw e;
}

/**
 * Un solo servicio para los cuatro catalogos: son CRUD trivial sobre tablas de tres
 * columnas y partirlos en cuatro clases seria ceremonia sin ninguna regla de negocio
 * que separar.
 */
@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Los 4 catalogos en UNA peticion: los usan 6+ pantallas y la captura de la
   * Fase 3. Van en paralelo dentro de la transaccion del RlsInterceptor.
   */
  async todos() {
    const c = this.prisma.client;
    const [concepts, roleTypes, currencies, machineModels] = await Promise.all([
      c.concept.findMany({ select: CONCEPTO, orderBy: { sortOrder: 'asc' } }),
      c.roleType.findMany({ select: ROL, orderBy: { name: 'asc' } }),
      c.currency.findMany({ select: MONEDA, orderBy: { code: 'asc' } }),
      c.machineModel.findMany({ select: MAQUINA, orderBy: { code: 'asc' } }),
    ]);
    return { concepts, roleTypes, currencies, machineModels };
  }

  // ── Conceptos: la lista no puede crecer ni encoger (CAT-01) ──
  // Solo UPDATE de etiquetas. No hay `crear` ni `borrar` aqui a proposito, y el
  // motor lo respalda: `concepts` no tiene politica de INSERT ni de DELETE (02-01).

  editarEtiquetas(code: ConceptCode, data: { labelEs?: string; labelIt?: string }) {
    return this.intentar(() =>
      this.prisma.client.concept.update({ where: { code }, data, select: CONCEPTO }),
    );
  }

  // ── Roles tecnicos ──

  async crearRol(name: string) {
    this.noDuplicar(await this.prisma.client.roleType.findUnique({ where: { name }, select: ROL }));
    return this.intentar(() => this.prisma.client.roleType.create({ data: { name }, select: ROL }));
  }

  async editarRol(id: string, data: { name?: string; isActive?: boolean }) {
    if (data.name !== undefined)
      this.noDuplicar(
        await this.prisma.client.roleType.findFirst({
          where: { name: data.name, NOT: { id } },
          select: ROL,
        }),
      );
    return this.intentar(() =>
      this.prisma.client.roleType.update({ where: { id }, data, select: ROL }),
    );
  }

  // ── Monedas (el codigo ES la PK: llega ya normalizado a mayusculas) ──

  async crearMoneda(code: string, symbol: string) {
    this.noDuplicar(await this.prisma.client.currency.findUnique({ where: { code }, select: MONEDA }));
    return this.intentar(() =>
      this.prisma.client.currency.create({ data: { code, symbol }, select: MONEDA }),
    );
  }

  editarMoneda(code: string, data: { symbol?: string; isActive?: boolean }) {
    return this.intentar(() =>
      this.prisma.client.currency.update({ where: { code }, data, select: MONEDA }),
    );
  }

  // ── Modelos de maquina ──

  async crearMaquina(code: string, description: string | null) {
    this.noDuplicar(
      await this.prisma.client.machineModel.findUnique({ where: { code }, select: MAQUINA }),
    );
    return this.intentar(() =>
      this.prisma.client.machineModel.create({ data: { code, description }, select: MAQUINA }),
    );
  }

  async editarMaquina(
    id: string,
    data: { code?: string; description?: string | null; isActive?: boolean },
  ) {
    if (data.code !== undefined)
      this.noDuplicar(
        await this.prisma.client.machineModel.findFirst({
          where: { code: data.code, NOT: { id } },
          select: MAQUINA,
        }),
      );
    return this.intentar(() =>
      this.prisma.client.machineModel.update({ where: { id }, data, select: MAQUINA }),
    );
  }

  /**
   * @unique normal, no parcial: desactivar NO libera el nombre. Cuando la fila que
   * choca esta inactiva la UI necesita saberlo para ofrecer «reactivar» en vez de
   * repetir «ya existe» sobre algo que no aparece en ningun selector.
   *
   * Se comprueba ANTES de escribir a proposito: un error del motor dentro de la
   * transaccion-por-peticion la deja abortada, y el SELECT que averiguaria si la
   * fila esta inactiva ya no se podria ejecutar.
   */
  private noDuplicar(existente: { isActive: boolean } | null): void {
    if (!existente) return;
    throw new ConflictException({
      message: existente.isActive ? 'YA_EXISTE' : 'YA_EXISTE_INACTIVO',
      existente,
    });
  }

  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      return traducir(e);
    }
  }
}
