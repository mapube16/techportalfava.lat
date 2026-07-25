import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Lo minimo que la pantalla Usuarios necesita. Fase 2 lo expande; no adelantar campos. */
const CAMPOS = { id: true, displayName: true, email: true, roles: true, isActive: true } as const;

const esAdmin = (roles: Role[]) => roles.some((r) => r === 'A' || r === 'S');

@Injectable()
export class UsersService {
  // client (getter del ALS): cuando el interceptor RLS del Plan 01-02 este activo,
  // estas escrituras entran en la transaccion de la peticion sin tocar este codigo.
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.client.user.findMany({ select: CAMPOS, orderBy: { displayName: 'asc' } });
  }

  /**
   * Criterio 4 del roadmap + los dos guards anti-lockout, en un solo sitio.
   * El orden importa: los anti-lockout van primero para que quitar el rol S al
   * ultimo Super Admin responda «no puedes dejar la app sin Super Admin» y no un
   * «no eres Super Admin» que manda a arreglar lo que no esta roto.
   */
  async asignarRoles(actor: UserModel, targetId: string, next: Role[]) {
    const target = await this.buscar(targetId);

    if (target.id === actor.id && actor.roles.includes('S') && !next.includes('S'))
      throw new BadRequestException('NO_PUEDES_QUITARTE_SUPER_ADMIN');

    if (
      target.isActive &&
      target.roles.includes('S') &&
      !next.includes('S') &&
      (await this.contarSuperAdminsActivos()) === 1
    )
      throw new BadRequestException('DEBE_QUEDAR_UN_SUPER_ADMIN');

    // Dos mitades de la misma regla: solo un Super Admin CREA administradores, y
    // solo un Super Admin toca a los que ya lo son (si no, un Admin degrada a su
    // Super Admin y se queda mandando).
    if ((esAdmin(next) || esAdmin(target.roles)) && !actor.roles.includes('S'))
      throw new ForbiddenException('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');

    return this.prisma.client.user.update({
      where: { id: targetId },
      data: { roles: next },
      select: CAMPOS,
    });
  }

  async cambiarActivo(actor: UserModel, targetId: string, isActive: boolean) {
    const target = await this.buscar(targetId);

    if (
      !isActive &&
      target.isActive &&
      target.roles.includes('S') &&
      (await this.contarSuperAdminsActivos()) === 1
    )
      throw new BadRequestException('DEBE_QUEDAR_UN_SUPER_ADMIN');

    if (esAdmin(target.roles) && !actor.roles.includes('S'))
      throw new ForbiddenException('SOLO_SUPER_ADMIN_DESACTIVA_ADMINS');

    // Sin cache en el guard: el desactivado pierde el acceso en su siguiente
    // peticion, con el token que ya tenia en la mano (AUTH-04).
    return this.prisma.client.user.update({
      where: { id: targetId },
      data: { isActive },
      select: CAMPOS,
    });
  }

  private contarSuperAdminsActivos() {
    return this.prisma.client.user.count({ where: { isActive: true, roles: { has: 'S' } } });
  }

  private async buscar(id: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('USUARIO_NO_ENCONTRADO');
    return user;
  }
}
