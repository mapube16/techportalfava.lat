import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { Phase } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { type DatosOrden, OrdersService } from './orders.service';
import { type DatosProyecto, ProjectsService } from './projects.service';
import { SoldDaysService } from './sold-days.service';

type Cuerpo = Record<string, unknown>;

/** Las dos fases del enum de Postgres, no una lista copiada a mano. */
const FASES: string[] = Object.values(Phase);

/** ISO-4217: exactamente 3 letras (mismo criterio que el catalogo de monedas). */
const ISO_4217 = /^[A-Za-z]{3}$/;

/** `ParseUUIDPipe` solo cubre el path; en el body un uuid mal formado seria un 500 (22P02). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maquinas y dias vendidos son recursos APARTE (PUT propios). Mandarlos aqui es un
 * 400 explicito y no un descarte silencioso: ignorarlos dejaria creer al cliente
 * que se guardaron. Mismo criterio que `code` en el PATCH de un concepto (02-03).
 */
const APARTE = ['orders', 'oaNumber', 'contractValue', 'currencyCode', 'machines', 'machineModelIds', 'soldDays', 'delta', 'executed'];

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
  constructor(
    private readonly service: ProjectsService,
    private readonly soldDays: SoldDaysService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * El UNICO metodo relajado a Tecnico (BIT-01): la clase sigue en `@Roles('A','S')` y
   * el guard hace `getAllAndOverride`, asi que el metodo la pisa. Al reves —clase
   * abierta y restrictivo por metodo— el olvido de un decorador en un endpoint futuro
   * caeria del lado inseguro.
   *
   * El reparto es por ROLES y no por RLS: `proj_read` es `USING (TRUE)`, o sea que el
   * motor le dejaria leer todas las columnas. Un usuario con `['T','A']` es admin
   * (mismo criterio que `ROLE_RANK` del frontend y que `app.is_admin` del interceptor).
   * No hay endpoint aparte: es la misma ruta con dos proyecciones.
   */
  @Get()
  @Roles('T', 'A', 'S')
  listar(@CurrentUser() actor: UserModel) {
    const admin = actor.roles.some((r) => r === 'A' || r === 'S');
    return admin ? this.service.listar() : this.service.listarParaTecnico();
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
      // OA, importe y moneda ya NO se piden aqui: son de la orden (POST /:id/orders).
      // `sinRecursosAparte` los rechaza con 400 en vez de descartarlos en silencio.
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

  @Get(':id/orders')
  ordenes(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listar(id);
  }

  /**
   * CRUD de verdad, no el «reemplazar la seleccion» del viejo `PUT /:id/machines`: la
   * orden lleva commessa, OA e importe, y reemplazarla entera perderia datos que nadie
   * pidio borrar.
   */
  @Post(':id/orders')
  crearOrden(@Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    return this.orders.crear(id, {
      // La etiqueta es lo unico obligatorio: es lo que el tecnico ve al elegir. Los
      // demas llegan despues, cuando se firma la orden.
      label: texto(body?.label, 'ETIQUETA'),
      ...camposOrden(body),
    });
  }

  @Patch('orders/:orderId')
  editarOrden(@Param('orderId', ParseUUIDPipe) orderId: string, @Body() body: Cuerpo) {
    const data: DatosOrden = camposOrden(body);
    if (body?.label !== undefined) data.label = texto(body.label, 'ETIQUETA');
    if (body?.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new BadRequestException('IS_ACTIVE_INVALIDO');
      data.isActive = body.isActive;
    }
    if (!Object.keys(data).length) throw new BadRequestException('NADA_QUE_EDITAR');
    return this.orders.editar(orderId, data);
  }

  /** Borrado real: una orden creada por error no es historia que preservar. */
  @Delete('orders/:orderId')
  eliminarOrden(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.orders.eliminar(orderId);
  }

  /**
   * UNA celda. El autoguardado al salir del campo necesita un endpoint pequeno y
   * aislado: un `PATCH /:id` generico que ademas tocase dias vendidos es el
   * anti-patron declarado del research.
   */
  @Put('orders/:orderId/sold-days')
  fijarDiasVendidos(
    @CurrentUser() actor: UserModel,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: Cuerpo,
  ) {
    // Primero que nada: `delta` y `executed` los calcula el servidor. Aceptarlos y
    // descartarlos en silencio dejaria creer al cliente que los ha guardado.
    if (body && ('delta' in body || 'executed' in body))
      throw new BadRequestException('CAMPO_CALCULADO_NO_ADMITIDO');

    const { roleTypeId, phase, soldDays } = body ?? {};
    if (typeof roleTypeId !== 'string' || !UUID.test(roleTypeId))
      throw new BadRequestException('ROL_TECNICO_INVALIDO');
    if (typeof phase !== 'string' || !FASES.includes(phase))
      throw new BadRequestException('FASE_INVALIDA');
    // Techo de 9999: mas dias vendidos que 27 anos de proyecto es un dedo, no un dato.
    if (!Number.isInteger(soldDays) || (soldDays as number) < 0 || (soldDays as number) > 9999)
      throw new BadRequestException('DIAS_VENDIDOS_INVALIDOS');

    return this.soldDays.fijar(actor.id, orderId, roleTypeId, phase as Phase, soldDays as number);
  }
}

/** Los campos opcionales de una orden, compartidos por el POST y el PATCH. */
function camposOrden(body: Cuerpo): DatosOrden {
  const data: DatosOrden = {};
  if (body?.machineModelId !== undefined) {
    const v = body.machineModelId;
    if (v !== null && (typeof v !== 'string' || !UUID.test(v)))
      throw new BadRequestException('MAQUINA_INVALIDA');
    data.machineModelId = (v as string | null) ?? null;
  }
  if (body?.commessa !== undefined) data.commessa = opcional(body.commessa, 'COMMESSA');
  if (body?.commessaShort !== undefined)
    data.commessaShort = opcional(body.commessaShort, 'COMMESSA_CORTA');
  if (body?.oaNumber !== undefined) data.oaNumber = opcional(body.oaNumber, 'OA');
  if (body?.contractValue !== undefined) data.contractValue = valorContrato(body.contractValue);
  if (body?.currencyCode !== undefined) data.currencyCode = moneda(body.currencyCode);
  return data;
}

function sinRecursosAparte(body: Cuerpo): void {
  if (body && APARTE.some((campo) => campo in body)) throw new BadRequestException('RECURSO_APARTE');
}
