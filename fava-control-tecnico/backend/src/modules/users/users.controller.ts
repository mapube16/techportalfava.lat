import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { Role } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { UsersService } from './users.service';

const ROLES_VALIDOS = ['T', 'A', 'S'];

function leerRoles(valor: unknown): Role[] {
  if (!Array.isArray(valor) || valor.length === 0 || !valor.every((r) => ROLES_VALIDOS.includes(r)))
    throw new BadRequestException('ROLES_INVALIDOS');
  return valor as Role[];
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
