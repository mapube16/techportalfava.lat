import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntraIdentity } from '../../common/auth/entra.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { UserModel } from '../../generated/prisma/models';

const CAMPOS = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class AccessRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La identidad sale SIEMPRE del token, nunca del body: si no, cualquiera
   * solicita acceso a nombre de otro. Upsert por entra_oid → pulsar el boton
   * cinco veces deja una sola solicitud.
   */
  async solicitar(entra: EntraIdentity, user: UserModel | null) {
    if (user) throw new ConflictException('YA_TIENES_ACCESO');
    // base: quien solicita no tiene usuario, asi que no hay contexto RLS que usar.
    const solicitud = await this.prisma.base.accessRequest.upsert({
      where: { entraOid: entra.oid },
      create: { entraOid: entra.oid, email: entra.email, displayName: entra.name },
      // Reabrir una descartada es intencionado: el usuario volvio a pedirlo.
      update: { status: 'pending', email: entra.email, displayName: entra.name },
    });
    return { id: solicitud.id, status: solicitud.status };
  }

  /** Aterrizan en la pantalla Usuarios; el feed de notificaciones es Fase 7. */
  listar() {
    return this.prisma.client.accessRequest.findMany({
      select: CAMPOS,
      // 'pending' > 'dismissed' alfabeticamente: desc deja las pendientes arriba.
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async descartar(id: string, status: string) {
    if (status !== 'dismissed') throw new BadRequestException('ESTADO_INVALIDO');
    try {
      return await this.prisma.client.accessRequest.update({
        where: { id },
        data: { status },
        select: CAMPOS,
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025')
        throw new NotFoundException('SOLICITUD_NO_ENCONTRADA');
      throw e;
    }
  }
}
