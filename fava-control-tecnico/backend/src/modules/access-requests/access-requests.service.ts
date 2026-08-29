import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntraIdentity } from '../../common/auth/entra.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { EmploymentType } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';

const CAMPOS = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  createdAt: true,
} as const;

/** El body es texto libre hasta que alguien lo mire: estos son los dos valores del enum. */
const EMPLEOS: readonly string[] = ['INTERNO', 'EXTERNO'];

/** Un `roleTypeId` que no sea UUID revienta el cast del motor antes de llegar a la FK. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /**
   * Aprobar = ficha de tecnico + usuario + cerrar la solicitud, de una vez. Antes
   * habia que ir a Tecnicos, crear la ficha, volver a Usuarios, invitar y vincular:
   * tres pantallas y una ficha huerfana cada vez que alguien se distraia a la mitad.
   *
   * La especialidad NO la declara quien solicita: `roleTypeId` alimenta el cruce
   * vendido/ejecutado y con dieciseis grafias de la misma cosa en el catalogo, que
   * cada uno eligiera la suya reproduciria dentro del sistema el desajuste que ya
   * tiene el Excel. La pone quien aprueba, que es una sola cabeza.
   *
   * `entraOid` se copia de la solicitud: quien la creo YA se autentico, asi que la
   * identidad esta probada y no hace falta el emparejamiento por email del guard.
   *
   * Los tres escritos comparten la transaccion por peticion de RlsInterceptor
   * (`prisma.client`), asi que un email repetido no deja la ficha creada detras.
   */
  async aprobar(id: string, roleTypeId: string, employmentType: string) {
    if (!UUID.test(roleTypeId)) throw new BadRequestException('ROL_TECNICO_INEXISTENTE');
    if (!EMPLEOS.includes(employmentType)) throw new BadRequestException('EMPLEO_INVALIDO');

    const solicitud = await this.prisma.client.accessRequest.findUnique({ where: { id } });
    if (!solicitud) throw new NotFoundException('SOLICITUD_NO_ENCONTRADA');
    if (solicitud.status !== 'pending') throw new ConflictException('SOLICITUD_YA_RESUELTA');

    try {
      const tecnico = await this.prisma.client.technician.create({
        data: {
          fullName: solicitud.displayName,
          roleTypeId,
          employmentType: employmentType as EmploymentType,
        },
        select: { id: true },
      });
      await this.prisma.client.user.create({
        data: {
          email: solicitud.email,
          displayName: solicitud.displayName,
          roles: ['T'],
          entraOid: solicitud.entraOid,
          technicianId: tecnico.id,
        },
      });
    } catch (e) {
      const codigo = (e as { code?: string })?.code;
      // P2002 = el email (o el oid) ya tiene usuario; P2003 = la especialidad no existe.
      if (codigo === 'P2002') throw new ConflictException('EMAIL_YA_REGISTRADO');
      if (codigo === 'P2003') throw new BadRequestException('ROL_TECNICO_INEXISTENTE');
      throw e;
    }

    return this.prisma.client.accessRequest.update({
      where: { id },
      data: { status: 'approved' },
      select: CAMPOS,
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
