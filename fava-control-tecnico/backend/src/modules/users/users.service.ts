import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Lo minimo que la pantalla Usuarios necesita. `technicianId` es la expansion de la
 * Fase 2 anunciada aqui (CAT-05): la pantalla tiene que poder mostrar el vinculo, y
 * de esa columna sale la GUC `app.technician_id` que aisla la bitacora.
 */
const CAMPOS = {
  id: true,
  displayName: true,
  email: true,
  roles: true,
  isActive: true,
  technicianId: true,
} as const;

const esAdmin = (roles: Role[]) => roles.some((r) => r === 'A' || r === 'S');

/** Codigo de error de Prisma sin depender de `instanceof` (el adapter puede duplicar la clase). */
const codigoPrisma = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';

const objetivoPrisma = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'meta' in e
    ? String((e as { meta?: { target?: unknown } }).meta?.target ?? '')
    : '';

@Injectable()
export class UsersService {
  // client (getter del ALS): cuando el interceptor RLS del Plan 01-02 este activo,
  // estas escrituras entran en la transaccion de la peticion sin tocar este codigo.
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.client.user.findMany({ select: CAMPOS, orderBy: { displayName: 'asc' } });
  }

  /**
   * Invitar (CAT-05). No manda ningun correo: el email transaccional es V1X-01 y
   * esta diferido. Lo que crea es la fila que el primer login real reclamara.
   *
   * El anti-lockout no aplica: crear un usuario nunca deja la app sin Super Admin.
   */
  async crear(datos: {
    actor: UserModel;
    email: string;
    displayName: string;
    roles: Role[];
    technicianId: string | null;
  }) {
    this.exigirSuperParaAdmins(datos.actor, datos.roles);

    try {
      return await this.prisma.client.user.create({
        data: {
          email: datos.email,
          displayName: datos.displayName,
          roles: datos.roles,
          // A proposito: la invitacion NO fija identidad. El primer login con un token
          // cuyo claim `email` coincide escribe el entra_oid (EntraGuard.vincular, 01-03).
          entraOid: null,
          technicianId: datos.technicianId,
        },
        select: CAMPOS,
      });
    } catch (e) {
      this.traducirConflicto(e);
    }
  }

  /**
   * El vinculo del que depende la Fase 3: `app.technician_id` sale de esta columna,
   * y hasta ahora nadie la escribia (un tecnico no veria ni sus propios registros).
   *
   * Un solo UPDATE con los dos errores esperados traducidos desde el codigo de Prisma:
   * precomprobar con dos SELECT abre una carrera y el motor ya tiene la respuesta.
   */
  async vincularTecnico(targetId: string, technicianId: string | null) {
    await this.buscar(targetId);

    try {
      return await this.prisma.client.user.update({
        where: { id: targetId },
        data: { technicianId },
        select: CAMPOS,
      });
    } catch (e) {
      this.traducirConflicto(e);
    }
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
    this.exigirSuperParaAdmins(actor, next, target.roles);

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

  /**
   * La regla de escalada, en UN solo sitio: la usan `asignarRoles` (con los roles
   * nuevos y los del objetivo) y `crear` (con los roles de la invitacion). Cambiarla
   * aqui la cambia en los dos caminos; duplicarla garantizaba que uno se relajara.
   */
  private exigirSuperParaAdmins(actor: UserModel, ...conjuntos: Role[][]) {
    if (conjuntos.some(esAdmin) && !actor.roles.includes('S'))
      throw new ForbiddenException('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');
  }

  /**
   * Los dos unicos conflictos que el motor puede devolver al escribir un usuario.
   * Sin esta traduccion son 500: `email` @unique, `technician_id` @unique y su FK.
   */
  private traducirConflicto(e: unknown): never {
    const codigo = codigoPrisma(e);
    if (codigo === 'P2002')
      throw objetivoPrisma(e).includes('technician')
        ? new ConflictException('TECNICO_YA_VINCULADO')
        : new ConflictException('EMAIL_YA_REGISTRADO');
    // P2003 = FK: el tecnico no existe. 400 y no 404 porque el recurso pedido (el
    // usuario) si existe; lo invalido es el cuerpo.
    if (codigo === 'P2003') throw new BadRequestException('TECNICO_INEXISTENTE');
    throw e as Error;
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
