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
import { Roles } from '../../common/auth/roles.decorator';
import { EmploymentType } from '../../generated/prisma/enums';
import { type DatosTecnico, TechniciansService } from './technicians.service';

const TIPOS: string[] = Object.values(EmploymentType);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  constructor(private readonly service: TechniciansService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  crear(@Body() body: Cuerpo) {
    return this.service.crear({
      fullName: nombre(body?.fullName),
      roleTypeId: rol(body?.roleTypeId),
      employmentType: tipo(body?.employmentType),
    });
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    const data: DatosTecnico = {};
    if (body?.fullName !== undefined) data.fullName = nombre(body.fullName);
    if (body?.roleTypeId !== undefined) data.roleTypeId = rol(body.roleTypeId);
    if (body?.employmentType !== undefined) data.employmentType = tipo(body.employmentType);
    if (!Object.keys(data).length) throw new BadRequestException('NADA_QUE_EDITAR');
    return this.service.editar(id, data);
  }

  /** Endpoint propio para la baja, igual que `users`: es la unica «eliminacion» que hay. */
  @Patch(':id/active')
  cambiarActivo(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    if (typeof body?.isActive !== 'boolean') throw new BadRequestException('IS_ACTIVE_INVALIDO');
    return this.service.editar(id, { isActive: body.isActive });
  }
}
