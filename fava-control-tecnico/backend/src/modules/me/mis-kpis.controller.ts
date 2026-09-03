import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { UserModel } from '../../generated/prisma/models';
import { MisKpisService } from './mis-kpis.service';

/**
 * Los KPIs del PROPIO técnico. `@Roles('T')`, igual que la bitácora y los gastos.
 *
 * Deliberadamente NO cuelga de `/api/kpis`: ese controller entero es `@Roles('A','S')`
 * y añadir aquí una excepción habría dejado el reparto de permisos repartido entre dos
 * decoradores que se leen por separado. Bajo `/api/me` la regla se lee de un vistazo —
 * todo lo que hay aquí es del que pregunta.
 *
 * El `technicianId` NUNCA viaja por parámetro: sale del token vía `tecnicoDe`. Un
 * `?technicianId=` aquí sería la vía para leer la operación de un compañero.
 */
@Controller('api/me/kpis')
@Roles('T')
export class MisKpisController {
  constructor(private readonly service: MisKpisService) {}

  @Get()
  mios(@CurrentUser() actor: UserModel, @Query('year') year?: string) {
    return this.service.resumen(this.service.tecnicoDe(actor), anio(year));
  }
}

/**
 * `year` opcional: ausente = todo su histórico. Mismo criterio y mismos límites que
 * `kpis.controller.ts` — se valida a mano para distinguir «ausente» de «basura», que
 * es lo que un ParseIntPipe funde en un NaN.
 */
function anio(year?: string): number | null {
  if (year === undefined || year === '') return null;
  const n = Number(year);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new BadRequestException('ANIO_INVALIDO');
  return n;
}
