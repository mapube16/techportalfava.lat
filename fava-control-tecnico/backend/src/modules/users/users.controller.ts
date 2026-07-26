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
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { Role } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { UsersService } from './users.service';

const ROLES_VALIDOS = ['T', 'A', 'S'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerRoles(valor: unknown): Role[] {
  if (!Array.isArray(valor) || valor.length === 0 || !valor.every((r) => ROLES_VALIDOS.includes(r)))
    throw new BadRequestException('ROLES_INVALIDOS');
  return valor as Role[];
}

/**
 * Normalizacion identica a la de `seed.ts` y a la del claim `email` en EntraGuard:
 * un invitado guardado como `Nombre@Fava.com` no vincularia su login jamas.
 */
function leerEmail(valor: unknown): string {
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) throw new BadRequestException('EMAIL_INVALIDO');
  return email;
}

function leerNombre(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (!nombre) throw new BadRequestException('DISPLAY_NAME_INVALIDO');
  return nombre;
}

/** `null` desvincula. El formato se valida aqui o un uuid mal escrito seria un 500 (22P02). */
function leerTecnicoId(valor: unknown): string | null {
  if (valor === null) return null;
  if (typeof valor !== 'string' || !UUID.test(valor))
    throw new BadRequestException('TECHNICIAN_ID_INVALIDO');
  return valor;
}

// @Roles a nivel de clase: entrar es cosa de A y S; QUE puede hacer cada uno una
// vez dentro lo decide el servicio (la regla es condicional, no de endpoint).
@Controller('api/users')
@Roles('A', 'S')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  /** Invitar: crea la fila; el primer login real la reclama por email. Sin correo (V1X-01). */
  @Post()
  crear(
    @CurrentUser() actor: UserModel,
    @Body()
    body: { email?: unknown; displayName?: unknown; roles?: unknown; technicianId?: unknown },
  ) {
    return this.service.crear({
      actor,
      email: leerEmail(body?.email),
      displayName: leerNombre(body?.displayName),
      // Invitar sin decir el rol es invitar a un tecnico: es el 90 % de los casos.
      roles: body?.roles === undefined ? ['T'] : leerRoles(body.roles),
      technicianId: body?.technicianId === undefined ? null : leerTecnicoId(body.technicianId),
    });
  }

  /** El vinculo del que sale `app.technician_id` (precondicion de la Fase 3). */
  @Patch(':id/technician')
  vincularTecnico(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { technicianId?: unknown },
  ) {
    if (body?.technicianId === undefined) throw new BadRequestException('TECHNICIAN_ID_INVALIDO');
    return this.service.vincularTecnico(id, leerTecnicoId(body.technicianId));
  }

  @Patch(':id/roles')
  asignarRoles(
    @CurrentUser() actor: UserModel,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { roles?: unknown },
  ) {
    return this.service.asignarRoles(actor, id, leerRoles(body?.roles));
  }

  @Patch(':id/active')
  cambiarActivo(
    @CurrentUser() actor: UserModel,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive?: unknown },
  ) {
    if (typeof body?.isActive !== 'boolean') throw new BadRequestException('IS_ACTIVE_INVALIDO');
    return this.service.cambiarActivo(actor, id, body.isActive);
  }
}
