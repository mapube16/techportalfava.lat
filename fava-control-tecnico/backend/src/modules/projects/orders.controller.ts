import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { Phase } from '../../generated/prisma/enums';
import type { UserModel } from '../../generated/prisma/models';
import { camposOrden, texto, UUID } from './orders.dto';
import { type DatosOrden, OrdersService } from './orders.service';
import { SoldDaysService } from './sold-days.service';

type Cuerpo = Record<string, unknown>;

/** Las dos fases del enum de Postgres, no una lista copiada a mano. */
const FASES: string[] = Object.values(Phase);

/**
 * La orden ya creada, por su propio id. Crear y listar viven bajo el proyecto
 * (`/api/projects/:id/orders`) porque una orden sin proyecto no existe; una vez creada
 * tiene identidad propia y colgarla de la ruta del proyecto obligaria a mandar dos ids
 * para la misma cosa.
 *
 * Mismo `@Roles('A','S')` que proyectos: la orden es el contrato.
 */
@Controller('api/orders')
@Roles('A', 'S')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly soldDays: SoldDaysService,
  ) {}

  @Patch(':orderId')
  editar(@Param('orderId', ParseUUIDPipe) orderId: string, @Body() body: Cuerpo) {
    const data: DatosOrden = camposOrden(body);
    if (body?.label !== undefined) data.label = texto(body.label, 'ETIQUETA');
    if (body?.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new BadRequestException('IS_ACTIVE_INVALIDO');
      data.isActive = body.isActive;
    }
    if (!Object.keys(data).length) throw new BadRequestException('NADA_QUE_EDITAR');
    return this.orders.editar(orderId, data);
  }

  /**
   * Borrado real, a diferencia de los maestros: una orden creada por error no es
   * historia que preservar. El servicio se niega si tiene bitacora o dias vendidos.
   */
  @Delete(':orderId')
  eliminar(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.orders.eliminar(orderId);
  }

  /**
   * UNA celda de la matriz. El autoguardado al salir del campo necesita un endpoint
   * pequeno y aislado: un `PATCH /:id` generico que ademas tocase dias vendidos es el
   * anti-patron declarado del research.
   *
   * Cuelga de la ORDEN y no del proyecto desde la Fase 2.1: cada maquina contratada se
   * cotiza por separado (JAV tiene tres bloques vendido/ejecutado distintos).
   */
  @Put(':orderId/sold-days')
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
