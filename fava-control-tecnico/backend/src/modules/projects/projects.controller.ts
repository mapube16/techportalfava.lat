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
import type { UserModel } from '../../generated/prisma/models';
import { type DatosProyecto, ProjectsService } from './projects.service';

type Cuerpo = Record<string, unknown>;

/** ISO-4217: exactamente 3 letras (mismo criterio que el catalogo de monedas). */
const ISO_4217 = /^[A-Za-z]{3}$/;

/**
 * Maquinas y dias vendidos son recursos APARTE (PUT propios). Mandarlos aqui es un
 * 400 explicito y no un descarte silencioso: ignorarlos dejaria creer al cliente
 * que se guardaron. Mismo criterio que `code` en el PATCH de un concepto (02-03).
 */
const APARTE = ['machines', 'machineModelIds', 'soldDays', 'delta', 'executed'];

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new BadRequestException(`${campo}_INVALIDO`);
  return valor.trim();
}

/** Opcional de verdad: ausente, `null` y cadena vacia son lo mismo (null). */
function opcional(valor: unknown, campo: string): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') throw new BadRequestException(`${campo}_INVALIDO`);
  return valor.trim() || null;
}

/**
 * `@db.Decimal(14, 2)`: 12 digitos enteros. Sin el techo, un valor mayor es un
 * `numeric field overflow` del motor (22003) convertido en 500.
 */
function valorContrato(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 1e12)
    throw new BadRequestException('VALOR_CONTRATO_INVALIDO');
  return valor;
}

function horas(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (!Number.isInteger(valor) || (valor as number) < 0)
    throw new BadRequestException('HORAS_NORMALES_INVALIDAS');
  return valor as number;
}

function moneda(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || !ISO_4217.test(valor.trim()))
    throw new BadRequestException('CODIGO_MONEDA_INVALIDO');
  return valor.trim().toUpperCase();
}

/**
 * @Roles('A','S') a nivel de clase: el proyecto y sus dias vendidos son capacidad de
 * Admin (matriz §6 del documento de requerimientos). Ninguna regla condicional que
 * bajar al servicio, a diferencia de `users`.
 *
 * Sin @Delete: desactivar, nunca borrar.
 */
@Controller('api/projects')
@Roles('A', 'S')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detalle(id);
  }

  @Post()
  crear(@CurrentUser() actor: UserModel, @Body() body: Cuerpo) {
    sinRecursosAparte(body);
    return this.service.crear(actor.id, {
      name: texto(body?.name, 'NOMBRE'),
      // Los 7 del encabezado de la Nota. Los NOT NULL son los que imprime el PDF:
      // sin ellos el documento sale mutilado, asi que faltan aqui, no en la Fase 5.
      clientName: texto(body?.clientName, 'CLIENTE'),
      clientNit: opcional(body?.clientNit, 'NIT'),
      locality: texto(body?.locality, 'LOCALIDAD'),
      country: texto(body?.country, 'PAIS'),
      supply: texto(body?.supply, 'SUMINISTRO'),
      contractNumber: texto(body?.contractNumber, 'CONTRATO'),
      oaNumber: opcional(body?.oaNumber, 'OA'),
      contractValue: valorContrato(body?.contractValue),
      currencyCode: moneda(body?.currencyCode),
      normalHours: horas(body?.normalHours),
    });
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    sinRecursosAparte(body);
    const data: DatosProyecto = {};
    if (body?.name !== undefined) data.name = texto(body.name, 'NOMBRE');
    if (body?.clientName !== undefined) data.clientName = texto(body.clientName, 'CLIENTE');
    if (body?.clientNit !== undefined) data.clientNit = opcional(body.clientNit, 'NIT');
    if (body?.locality !== undefined) data.locality = texto(body.locality, 'LOCALIDAD');
    if (body?.country !== undefined) data.country = texto(body.country, 'PAIS');
    if (body?.supply !== undefined) data.supply = texto(body.supply, 'SUMINISTRO');
    if (body?.contractNumber !== undefined)
      data.contractNumber = texto(body.contractNumber, 'CONTRATO');
    if (body?.oaNumber !== undefined) data.oaNumber = opcional(body.oaNumber, 'OA');
    if (body?.contractValue !== undefined) data.contractValue = valorContrato(body.contractValue);
    if (body?.currencyCode !== undefined) data.currencyCode = moneda(body.currencyCode);
    if (body?.normalHours !== undefined) data.normalHours = horas(body.normalHours);
    // Sin esto un body `{ foo: 1 }` moveria `updated_at` sin cambiar nada.
    if (!Object.keys(data).length) throw new BadRequestException('NADA_QUE_EDITAR');
    return this.service.editar(id, data);
  }

  @Patch(':id/active')
  cambiarActivo(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    if (typeof body?.isActive !== 'boolean') throw new BadRequestException('IS_ACTIVE_INVALIDO');
    return this.service.editar(id, { isActive: body.isActive });
  }
}

function sinRecursosAparte(body: Cuerpo): void {
  if (body && APARTE.some((campo) => campo in body)) throw new BadRequestException('RECURSO_APARTE');
}
