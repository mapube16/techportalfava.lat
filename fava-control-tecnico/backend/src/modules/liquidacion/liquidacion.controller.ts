import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { LiquidacionService, type Modo } from './liquidacion.service';

/**
 * La liquidación del mes: capacidad de administrador, como la cuadrícula y la
 * utilización. No cuelga de `/api/kpis` porque no es un indicador: es el cierre.
 */
@Controller('api/liquidacion')
@Roles('A', 'S')
export class LiquidacionController {
  constructor(private readonly service: LiquidacionService) {}

  @Get()
  liquidar(@Query('period') period?: string, @Query('mode') mode?: string) {
    return this.service.liquidar(periodo(period), modo(mode));
  }

  @Get('xlsx')
  async xlsx(
    @CurrentUser() actor: UserModel,
    @Res() res: Response,
    @Query('period') period?: string,
    @Query('mode') mode?: string,
  ) {
    const p = periodo(period);
    const buf = await this.service.xlsx(p, modo(mode), actor.lang);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${p}.xlsx"`);
    res.send(buf);
  }
}

/** 'YYYY-MM' obligatorio: sin periodo no hay liquidación que hacer. */
function periodo(p?: string): string {
  if (!p || !/^\d{4}-\d{2}$/.test(p)) throw new BadRequestException('PERIODO_INVALIDO');
  return p;
}

/** El corte es el modo por defecto: es el que usa Andrea. */
function modo(m?: string): Modo {
  if (m === undefined || m === '' || m === 'cut') return 'cut';
  if (m === 'calendar') return 'calendar';
  throw new BadRequestException('MODO_INVALIDO');
}
