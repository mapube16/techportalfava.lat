import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
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
  email: true,
  roleType: { select: { name: true } },
  user: { select: { id: true } },
} as const;

interface Fila {
  id: string;
  fullName: string;
  roleTypeId: string;
  employmentType: EmploymentType;
  isActive: boolean;
  email: string | null;
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
  email: t.email,
  userId: t.user?.id ?? null,
});

export interface DatosTecnico {
  fullName?: string;
  roleTypeId?: string;
  employmentType?: EmploymentType;
  isActive?: boolean;
  /** `null` borra el correo; `undefined` lo deja como esta. */
  email?: string | null;
}

@Injectable()
export class TechniciansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
  ) {}

  /**
   * CAT-02c — dar acceso a un tecnico: crea su cuenta si no la tiene y le manda el correo.
   *
   * UN SOLO PASO. Antes eran tres pantallas —crear la ficha, invitar al usuario,
   * acordarse de vincularlos— y ademas NADIE avisaba al invitado: la fila se creaba y
   * la persona no se enteraba nunca. El usuario existia y jamas entraba.
   *
   * El rol es 'T' y solo 'T': dar acceso a un tecnico es dar acceso a SU semana. Un
   * admin se invita desde la pantalla de Usuarios, donde se eligen los roles a
   * conciencia, no de rebote desde el maestro de tecnicos.
   */
  async invitar(id: string, invitadoPor: string) {
    const t = await this.prisma.client.technician.findUnique({
      where: { id },
      select: { id: true, fullName: true, email: true, isActive: true, user: { select: { id: true } } },
    });
    if (!t) throw new NotFoundException('TECNICO_NO_ENCONTRADO');
    if (!t.email) throw new BadRequestException('TECNICO_SIN_CORREO');
    if (!t.isActive) throw new ConflictException('TECNICO_INACTIVO');

    // Reinvitar es legitimo y frecuente: el correo se pierde o se va a spam. Si ya
    // tiene cuenta se reutiliza en vez de fallar.
    const usuario =
      t.user?.id != null
        ? await this.prisma.client.user.findUniqueOrThrow({
            where: { id: t.user.id },
            select: { id: true, email: true, displayName: true, lang: true },
          })
        : await this.prisma.client.user.create({
            data: {
              email: t.email,
              displayName: t.fullName,
              roles: ['T'],
              // La invitacion NO fija identidad: el primer login con un token cuyo
              // claim de correo coincida escribe el entra_oid (EntraGuard.vincular).
              entraOid: null,
              technicianId: t.id,
            },
            select: { id: true, email: true, displayName: true, lang: true },
          });

    await this.notif.invitar({ userId: usuario.id, ...usuario }, invitadoPor);
    return { userId: usuario.id, email: usuario.email };
  }

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
    const creado = await this.intentar(() =>
      this.prisma.client.technician.create({ data: d, select: TECNICO }),
    );
    await this.emparejarPorCorreo(creado.id, d.email);
    // Se relee: `emparejarPorCorreo` puede haber escrito el vinculo y `userId` sale de él.
    return plano(
      await this.prisma.client.technician.findUniqueOrThrow({
        where: { id: creado.id },
        select: TECNICO,
      }),
    );
  }

  /**
   * Une la ficha con la cuenta que tenga ESE correo, si existe y está libre.
   *
   * Es el motivo por el que el correo vive en el técnico. Antes había que crear la
   * ficha, invitar al usuario y acordarse de vincularlos a mano desde un desplegable;
   * tres pasos, y olvidar el tercero deja al técnico sin ver ni sus propios registros
   * —`app.technician_id` sale de esa columna— sin ningún aviso.
   *
   * NO PISA un vínculo existente. Si esa cuenta ya apunta a otro técnico, la unión no
   * se hace y no pasa nada: reasignar a quién pertenece una cuenta es una decisión, no
   * un efecto secundario de teclear un correo.
   */
  private async emparejarPorCorreo(technicianId: string, email?: string | null) {
    if (!email) return;
    await this.prisma.client.user.updateMany({
      where: { email: { equals: email, mode: 'insensitive' }, technicianId: null },
      data: { technicianId },
    });
  }

  /** Sirve al PATCH de datos y al de baja: la baja es un campo, no una operacion aparte. */
  async editar(id: string, data: DatosTecnico) {
    const fila = await this.intentar(() =>
      this.prisma.client.technician.update({ where: { id }, data, select: TECNICO }),
    );
    // Escribir el correo también empareja: es la vía por la que se arregla un técnico
    // histórico al que por fin se le pone el suyo.
    if (data.email !== undefined) await this.emparejarPorCorreo(id, data.email);
    return plano(
      await this.prisma.client.technician.findUniqueOrThrow({ where: { id: fila.id }, select: TECNICO }),
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
