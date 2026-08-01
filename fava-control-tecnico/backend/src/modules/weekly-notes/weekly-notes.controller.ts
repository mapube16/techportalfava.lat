import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { ESTADOS } from '../../common/estados';
import { WeeklyNotesService } from './weekly-notes.service';

type Cuerpo = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/** El `updated_at` que el cliente leyo. Opcional, pero si viene tiene que ser un ISO. */
function esperado(body: Cuerpo): string | undefined {
  const v = body?.expectedUpdatedAt;
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v)))
    throw new BadRequestException('EXPECTED_UPDATED_AT_INVALIDO');
  return v;
}

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new BadRequestException(`${campo}_REQUERIDO`);
  return valor;
}

const quien = (u: UserModel) => ({ id: u.id, name: u.displayName });

/**
 * NOTA-02: una ruta POR TRANSICION. No hay `PATCH /:id { status }` a proposito — con
 * uno, la tabla de transiciones del servicio seria decorativa y cualquier cliente
 * podria saltar de `draft` a `approved`.
 *
 * Los roles se reparten POR METODO porque el flujo los mezcla: enviar es del tecnico,
 * aprobar y devolver del admin, reabrir del Super Admin. La clase se queda en el
 * conjunto mas amplio y cada metodo estrecha.
 */
@Controller('api/weekly-notes')
@Roles('T', 'A', 'S')
export class WeeklyNotesController {
  constructor(private readonly service: WeeklyNotesService) {}

  /**
   * La MISMA consulta sirve a la bandeja del admin y a la lista del tecnico: la
   * politica `wn_read` de RLS filtra por `app.technician_id` cuando no es admin, asi
   * que no hacen falta dos endpoints ni un filtro en el servicio.
   */
  @Get()
  listar(@Query('status') status?: string) {
    if (status !== undefined && !(ESTADOS as readonly string[]).includes(status))
      throw new BadRequestException('ESTADO_INVALIDO');
    return this.service.listar(status);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detalle(id);
  }

  /**
   * Fase 5 — la vista previa de antes de firmar. Se sirve inline (no como adjunto):
   * es para pintarla en la app, no para descargarla. `@Res()` porque Nest no sabe mandar
   * un `Buffer` como cuerpo por su cuenta.
   */
  @Get(':id/pdf/preview')
  async previsualizarPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const bytes = await this.service.previsualizarPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="nota-preview.pdf"');
    res.send(bytes);
  }

  /**
   * NOTA-01. El tecnico manda SU semana (el `technician_id` sale del token, nunca del
   * cuerpo) y recibe las notas ya derivadas, una por proyecto.
   */
  @Post('submit')
  @Roles('T')
  enviar(@CurrentUser() actor: UserModel, @Body() body: Cuerpo) {
    if (!actor.technicianId) throw new BadRequestException('USUARIO_SIN_TECNICO');
    return this.service.enviarSemana(quien(actor), actor.technicianId, texto(body?.weekStart, 'SEMANA'));
  }

  @Post(':id/approve')
  @Roles('A', 'S')
  aprobar(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    // CAT-06: aprobar en nombre de un tecnico dado de baja deja rastro de en nombre
    // de QUIEN, que es justo lo que el requisito pide poder auditar.
    const onBehalfOfId = body?.onBehalfOfId;
    if (onBehalfOfId !== undefined && onBehalfOfId !== null && (typeof onBehalfOfId !== 'string' || !UUID.test(onBehalfOfId)))
      throw new BadRequestException('ON_BEHALF_OF_INVALIDO');
    return this.service.approve(quien(actor), id, esperado(body), (onBehalfOfId as string) ?? null);
  }

  /** NOTA-03: sin comentario no se devuelve. Tambien lo impide un CHECK del motor. */
  @Post(':id/return')
  @Roles('A', 'S')
  devolver(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    return this.service.return_(quien(actor), id, texto(body?.reason, 'COMENTARIO'), esperado(body));
  }

  /** Deshacer una aprobacion no es rutina: Super Admin y con motivo. */
  @Post(':id/reopen')
  @Roles('S')
  reabrir(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    return this.service.reopen(quien(actor), id, texto(body?.reason, 'MOTIVO'), esperado(body));
  }

  /** NOTA-09: el cargo de ESA semana. Recurso aparte, como los dias vendidos. */
  @Put(':id/role')
  @Roles('A', 'S')
  fijarCargo(@CurrentUser() actor: UserModel, @Param('id', ParseUUIDPipe) id: string, @Body() body: Cuerpo) {
    const v = body?.roleTypeId;
    if (v !== null && (typeof v !== 'string' || !UUID.test(v)))
      throw new BadRequestException('ROL_TECNICO_INVALIDO');
    return this.service.fijarCargo(quien(actor), id, v as string | null);
  }
}
