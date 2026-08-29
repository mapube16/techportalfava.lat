import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { EmploymentType } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { WeeklyNotesService } from '../weekly-notes/weekly-notes.service';
import { type DatosTecnico, TechniciansService } from './technicians.service';

const TIPOS: string[] = Object.values(EmploymentType);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** El mismo de `users.controller.ts`: basta con que tenga arroba y un punto detras. */
const EMAIL = /^[^s@]+@[^s@]+.[^s@]+$/;

type Cuerpo = Record<string, unknown>;

function nombre(valor: unknown): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new BadRequestException('NOMBRE_INVALIDO');
  return valor.trim();
}

/** UUID en el body: `ParseUUIDPipe` solo cubre el path, y un uuid mal formado seria un 500. */
function rol(valor: unknown): string {
  if (typeof valor !== 'string' || !UUID.test(valor))
    throw new BadRequestException('ROL_TECNICO_INVALIDO');
  return valor;
}

/**
 * El correo de la persona. OPCIONAL y en minusculas.
 *
 * Opcional porque un tecnico historico puede no tener ninguno y obligarlo inventaria
 * un dato. En minusculas por el mismo motivo que en `users`: el indice unico va sobre
 * `lower(email)` y el emparejado con la cuenta compara sin distinguir mayusculas — una
 * ficha guardada como `Nombre@Fava.com` no se uniria nunca con su cuenta.
 *
 * Cadena vacia = borrar, y por eso devuelve `null` en vez de `undefined`: en un PATCH
 * `undefined` significa «no lo toques» y no habria forma de quitar un correo mal puesto.
 */
function correo(valor: unknown): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) throw new BadRequestException('EMAIL_INVALIDO');
  return email;
}

/** El enum de Postgres es la lista cerrada; aqui solo se traduce a 400 en vez de 500. */
function tipo(valor: unknown): EmploymentType {
  if (typeof valor !== 'string' || !TIPOS.includes(valor))
    throw new BadRequestException('TIPO_CONTRATACION_INVALIDO');
  return valor as EmploymentType;
}

/**
 * @Roles('A','S') a nivel de clase: el maestro de tecnicos es cosa de A y S de punta
 * a punta. A diferencia de `users`, aqui no hay ninguna regla condicional (escalada,
 * anti-lockout) que justifique bajar la decision al servicio.
 *
 * Sin @Delete: desactivar, nunca borrar.
 */
@Controller('api/technicians')
@Roles('A', 'S')
export class TechniciansController {
  constructor(
    private readonly service: TechniciansService,
    private readonly notes: WeeklyNotesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  /**
   * CAT-02c — darle acceso: crea la cuenta si falta y le manda el correo.
   *
   * @Roles de la clase: A y S, igual que el resto del maestro. Es ademas el UNICO
   * correo de la aplicacion que sale porque una persona lo pide; los otros cuatro los
   * dispara un reloj o una transicion.
   */
  @Post(':id/invitar')
  invitar(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.invitar(id, actor.displayName);
  }

  @Post()
  crear(@Body() body: Cuerpo) {
    return this.service.crear({
      fullName: nombre(body?.fullName),
      roleTypeId: rol(body?.roleTypeId),
      employmentType: tipo(body?.employmentType),
      email: correo(body?.email) ?? null,
    });
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    const data: DatosTecnico = {};
    if (body?.fullName !== undefined) data.fullName = nombre(body.fullName);
    if (body?.roleTypeId !== undefined) data.roleTypeId = rol(body.roleTypeId);
    if (body?.employmentType !== undefined) data.employmentType = tipo(body.employmentType);
    if (body?.email !== undefined) data.email = correo(body.email);
    if (!Object.keys(data).length) throw new BadRequestException('NADA_QUE_EDITAR');
    return this.service.editar(id, data);
  }

  /**
   * CAT-06. Lo que el dialogo de baja necesita ANTES de desactivar: cuantas notas
   * quedan sin cerrar. No bloquea la baja —el requisito dice «avisa y permite»— pero
   * sin el dato la UI no puede avisar de nada.
   */
  @Get(':id/pending-notes')
  pendientes(@Param('id', ParseUUIDPipe) id: string) {
    return this.notes.pendientesDe(id).then((count) => ({ count }));
  }

  /** Endpoint propio para la baja, igual que `users`: es la unica «eliminacion» que hay. */
  @Patch(':id/active')
  async cambiarActivo(
    @CurrentUser() actor: UserModel,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Cuerpo,
  ) {
    if (typeof body?.isActive !== 'boolean') throw new BadRequestException('IS_ACTIVE_INVALIDO');
    const tecnico = await this.service.editar(id, { isActive: body.isActive });
    // La baja de una persona con historia SI deja rastro (AUD-01): es de las cosas que
    // alguien pregunta meses despues, y el nombre del actor tiene que estar escrito.
    await this.audit.registrar({
      actorId: actor.id,
      actorName: actor.displayName,
      entity: 'technician',
      entityId: id,
      action: body.isActive ? 'update' : 'deactivate',
      after: { isActive: body.isActive },
    });
    return tecnico;
  }
}
