import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { EmploymentType } from '../../generated/prisma/enums';

/**
 * `roleType.name` y `user.id` viajan planos como `roleTypeName` / `userId`: la
 * pantalla Tecnicos necesita el nombre del rol para la tabla y el `userId` para
 * saber cual de ellos tiene cuenta Entra.
 *
 * `aliases` NO se selecciona: la columna existe para la conciliacion de grafias de
 * la Fase 6 (MIG-01) y nadie la escribe ni la lee todavia.
 */
const TECNICO = {
  id: true,
  fullName: true,
  roleTypeId: true,
  employmentType: true,
  isActive: true,
  roleType: { select: { name: true } },
  user: { select: { id: true } },
} as const;

interface Fila {
  id: string;
  fullName: string;
  roleTypeId: string;
  employmentType: EmploymentType;
  isActive: boolean;
  roleType: { name: string };
  user: { id: string } | null;
}

const plano = (t: Fila) => ({
  id: t.id,
  fullName: t.fullName,
  roleTypeId: t.roleTypeId,
  roleTypeName: t.roleType.name,
  employmentType: t.employmentType,
  isActive: t.isActive,
  userId: t.user?.id ?? null,
});

export interface DatosTecnico {
  fullName?: string;
  roleTypeId?: string;
  employmentType?: EmploymentType;
  isActive?: boolean;
}

@Injectable()
export class TechniciansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sin filtro por `isActive` a proposito: la lista muestra a los inactivos
   * atenuados (Techs.tsx ya lo hace) y son los SELECTORES los que filtran. Ocultarlos
   * aqui haria desaparecer de la pantalla al tecnico que tiene la bitacora historica.
   */
  async listar() {
    const filas = await this.prisma.client.technician.findMany({
      select: TECNICO,
      orderBy: { fullName: 'asc' },
    });
    return filas.map(plano);
  }

  /** CAT-02: no toca `users`. El vinculo con una cuenta Entra es opcional y va aparte. */
  async crear(d: Required<Omit<DatosTecnico, 'isActive'>>) {
    return plano(
      await this.intentar(() => this.prisma.client.technician.create({ data: d, select: TECNICO })),
    );
  }

  /** Sirve al PATCH de datos y al de baja: la baja es un campo, no una operacion aparte. */
  async editar(id: string, data: DatosTecnico) {
    return plano(
      await this.intentar(() =>
        this.prisma.client.technician.update({ where: { id }, data, select: TECNICO }),
      ),
    );
  }

  /**
   * Prisma -> HTTP. Sin esta traduccion un `roleTypeId` que no existe sale como 500
   * («violates foreign key constraint») y un `id` inventado tambien.
   */
  private async intentar<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2003') throw new BadRequestException('ROL_TECNICO_INEXISTENTE');
      if (code === 'P2025') throw new NotFoundException('TECNICO_NO_ENCONTRADO');
      throw e;
    }
  }
}
