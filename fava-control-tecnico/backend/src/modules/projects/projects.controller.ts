import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { camposOrden, opcional, texto } from './orders.dto';
import { OrdersService } from './orders.service';
import { type DatosProyecto, ProjectsService } from './projects.service';

type Cuerpo = Record<string, unknown>;

/**
 * Maquinas y dias vendidos son recursos APARTE (PUT propios). Mandarlos aqui es un
 * 400 explicito y no un descarte silencioso: ignorarlos dejaria creer al cliente
 * que se guardaron. Mismo criterio que `code` en el PATCH de un concepto (02-03).
 */
const APARTE = [
  'orders',
  'oaNumber',
  'contractValue',
  'currencyCode',
  'machines',
  'machineModelIds',
  'soldDays',
  'delta',
  'executed',
];

function horas(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (!Number.isInteger(valor) || (valor as number) < 0)
    throw new BadRequestException('HORAS_NORMALES_INVALIDAS');
  return valor as number;
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
}

function sinRecursosAparte(body: Cuerpo): void {
  if (body && APARTE.some((campo) => campo in body))
    throw new BadRequestException('RECURSO_APARTE');
}
