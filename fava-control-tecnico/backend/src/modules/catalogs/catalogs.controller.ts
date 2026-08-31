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
import { ConceptCode } from '../../generated/prisma/enums';
import { CatalogsService } from './catalogs.service';

/** Los codigos del enum de Postgres, no una lista copiada a mano. */
const CODIGOS: string[] = Object.values(ConceptCode);

/** ISO-4217: exactamente 3 letras. Se normaliza a mayusculas, no se rechaza por eso. */
const ISO_4217 = /^[A-Za-z]{3}$/;

type Cuerpo = Record<string, unknown>;

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new BadRequestException(`${campo}_INVALIDO`);
  return valor.trim();
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') throw new BadRequestException(`${campo}_INVALIDO`);
  return valor;
}

/** Un PATCH sin ningun campo reconocido moveria `updated_at` sin cambiar nada. */
function algoQueEditar<T extends object>(data: T): T {
  if (!Object.keys(data).length) throw new BadRequestException('NADA_QUE_EDITAR');
  return data;
}

/**
 * @Roles('S') a nivel de CLASE y el GET lo relaja a los tres roles (el guard hace
 * getAllAndOverride: el metodo pisa a la clase). Al reves — clase abierta y `@Roles`
 * por mutacion — un endpoint futuro que olvide el decorador quedaria abierto a
 * cualquier autenticado; asi el olvido cae del lado seguro.
 *
 * No hay un solo @Delete en este archivo: desactivar, nunca borrar.
 */
@Controller('api/catalogs')
@Roles('S')
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  /** Abierto a T·A·S: la captura de la Fase 3 lo pide con token de tecnico. */
  @Get()
  @Roles('T', 'A', 'S')
  todos() {
    return this.service.todos();
  }

  /**
   * CAT-01: solo las etiquetas visibles. El codigo y la semantica son fijos, asi que
   * `code` en el body es un 400 explicito (no un cambio silenciosamente ignorado) y
   * cualquier otra clave se descarta sin ruido.
   */
  @Patch('concepts/:code')
  editarEtiquetas(@Param('code') code: string, @Body() body: Cuerpo) {
    if (!CODIGOS.includes(code)) throw new BadRequestException('CONCEPTO_INEXISTENTE');
    if (body && 'code' in body) throw new BadRequestException('CODIGO_NO_EDITABLE');

    const data: { labelEs?: string; labelIt?: string } = {};
    if (body?.labelEs !== undefined) data.labelEs = texto(body.labelEs, 'LABEL_ES');
    if (body?.labelIt !== undefined) data.labelIt = texto(body.labelIt, 'LABEL_IT');

    return this.service.editarEtiquetas(code as ConceptCode, algoQueEditar(data));
  }

  @Post('role-types')
  crearRol(@Body() body: Cuerpo) {
    return this.service.crearRol(texto(body?.name, 'NOMBRE'));
  }

  @Patch('role-types/:id')
  editarRol(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    const data: { name?: string; isActive?: boolean } = {};
    if (body?.name !== undefined) data.name = texto(body.name, 'NOMBRE');
    if (body?.isActive !== undefined) data.isActive = booleano(body.isActive, 'IS_ACTIVE');
    return this.service.editarRol(id, algoQueEditar(data));
  }

  @Post('currencies')
  crearMoneda(@Body() body: Cuerpo) {
    return this.service.crearMoneda(codigoIso(body?.code), texto(body?.symbol, 'SIMBOLO'));
  }

  @Patch('currencies/:code')
  editarMoneda(@Param('code') code: string, @Body() body: Cuerpo) {
    const data: { symbol?: string; isActive?: boolean } = {};
    if (body?.symbol !== undefined) data.symbol = texto(body.symbol, 'SIMBOLO');
    if (body?.isActive !== undefined) data.isActive = booleano(body.isActive, 'IS_ACTIVE');
    return this.service.editarMoneda(codigoIso(code), algoQueEditar(data));
  }

  @Post('machine-models')
  crearMaquina(@Body() body: Cuerpo) {
    return this.service.crearMaquina(texto(body?.code, 'CODIGO'), descripcion(body?.description));
  }

  @Patch('machine-models/:id')
  editarMaquina(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    const data: { code?: string; description?: string | null; isActive?: boolean } = {};
    if (body?.code !== undefined) data.code = texto(body.code, 'CODIGO');
    if (body?.description !== undefined) data.description = descripcion(body.description);
    if (body?.isActive !== undefined) data.isActive = booleano(body.isActive, 'IS_ACTIVE');
    return this.service.editarMaquina(id, algoQueEditar(data));
  }
}

function codigoIso(valor: unknown): string {
  if (typeof valor !== 'string' || !ISO_4217.test(valor.trim()))
    throw new BadRequestException('CODIGO_MONEDA_INVALIDO');
  return valor.trim().toUpperCase();
}

/** La descripcion es opcional de verdad: ausente y `null` son lo mismo. */
function descripcion(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return texto(valor, 'DESCRIPCION');
}
