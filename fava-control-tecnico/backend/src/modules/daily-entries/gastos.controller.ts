import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { RECIBO_MAX_BYTES } from '../../config/limites';
import { DailyEntriesService } from './daily-entries.service';
import { GastosService } from './gastos.service';

type Cuerpo = Record<string, unknown>;

/** Los mismos tres tipos que el comprobante de la nota: no hay dos listas que separar. */
const TIPOS = ['image/jpeg', 'image/png', 'application/pdf'];

/** El renglon de una tabla del PDF, no un parrafo. */
const DESCRIPCION_MAX = 120;
const VALOR_MAX = 40;

function texto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > max)
    throw new BadRequestException(`${campo}_INVALIDO`);
  return valor.trim();
}

/**
 * GASTO-01 — los gastos del dia, colgando de la FECHA de la bitacora.
 *
 * La ruta es `/api/daily-entries/:date/expenses` y no `/expenses/:id` porque el gasto no
 * tiene vida propia: es del dia, se bloquea con el dia y se borra con el dia. La fecha
 * en la ruta ademas evita que el cliente tenga que conocer el id de la jornada.
 *
 * `@Roles('T')` en la clase, igual que la bitacora: los gastos son del tecnico. Un admin
 * los ve dentro de la nota, que es donde toma la decision de aprobarlos.
 */
@Controller('api/daily-entries/:date/expenses')
@Roles('T')
export class GastosController {
  constructor(
    private readonly service: GastosService,
    private readonly entries: DailyEntriesService,
  ) {}

  @Get()
  listar(@CurrentUser() actor: UserModel, @Param('date') date: string) {
    return this.service.listar(this.entries.tecnicoDe(actor), date);
  }

  @Post()
  crear(@CurrentUser() actor: UserModel, @Param('date') date: string, @Body() body: Cuerpo) {
    const technicianId = this.entries.tecnicoDe(actor);
    const descripcion = texto(body?.descripcion, 'GASTO_DESCRIPCION', DESCRIPCION_MAX);
    const valor = texto(body?.valor, 'GASTO_VALOR', VALOR_MAX);

    // El comprobante es OPCIONAL: se anota el gasto en obra y la foto se sube despues.
    // Mismas comprobaciones que el recibo de la nota, en el mismo orden.
    const b64 = typeof body?.dataBase64 === 'string' ? body.dataBase64 : '';
    if (!b64) return this.service.crear(technicianId, date, { descripcion, valor });

    const mimeType = String(body?.mimeType ?? '');
    if (!TIPOS.includes(mimeType)) throw new BadRequestException('TIPO_NO_ADMITIDO');
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length) throw new BadRequestException('ARCHIVO_VACIO');
    if (bytes.length > RECIBO_MAX_BYTES) throw new BadRequestException('ARCHIVO_DEMASIADO_GRANDE');

    return this.service.crear(technicianId, date, { descripcion, valor, mimeType, bytes });
  }

  @Delete(':gastoId')
  eliminar(
    @CurrentUser() actor: UserModel,
    @Param('date') date: string,
    @Param('gastoId', ParseUUIDPipe) gastoId: string,
  ) {
    return this.service.eliminar(this.entries.tecnicoDe(actor), date, gastoId);
  }

  /** Los bytes del comprobante. Inline: es para mirarlo, no para descargarlo. */
  @Get(':gastoId/file')
  async ver(
    @CurrentUser() actor: UserModel,
    @Param('date') date: string,
    @Param('gastoId', ParseUUIDPipe) gastoId: string,
    @Res() res: Response,
  ) {
    const { mimeType, bytes } = await this.service.comprobante(
      this.entries.tecnicoDe(actor),
      date,
      gastoId,
    );
    res.setHeader('content-type', mimeType);
    res.setHeader('content-disposition', 'inline');
    res.send(bytes);
  }
}
