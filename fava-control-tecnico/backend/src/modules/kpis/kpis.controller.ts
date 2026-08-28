import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator';
import { KpisService } from './kpis.service';

/**
 * Los tableros son capacidad de Admin. RLS no los protege: `de_read` aisla la bitacora
 * por tecnico, pero esta agregacion la sirve el mismo rol de aplicacion para todos los
 * proyectos, asi que el reparto es por @Roles y tiene que estar aqui.
 */
@Controller('api/kpis')
@Roles('A', 'S')
export class KpisController {
  constructor(private readonly service: KpisService) {}

  @Get('years')
  anios() {
    return this.service.anios();
  }

  /** KPI-07. */
  @Get('day-grid')
  cuadricula(@Query('year') year?: string) {
    return this.service.cuadricula(anio(year));
  }

  /** KPI-01 y KPI-08: vendido contra ejecutado, por proyecto. */
  @Get('sold-vs-executed')
  vendidoEjecutado(@Query('year') year?: string) {
    return this.service.soldVsExecuted(anio(year));
  }

  /** KPI-02. Mismo criterio de `year` que la cuadrícula. */
  @Get('utilization')
  utilizacion(@Query('year') year?: string) {
    return this.service.utilizacion(anio(year));
  }
}

/**
 * `year` opcional: ausente = todo el histórico junto.
 *
 * Se valida a mano en vez de con un ParseIntPipe para poder distinguir «ausente»
 * (todos los años) de «basura» (400): el pipe convierte las dos cosas en NaN.
 */
function anio(year?: string): number | null {
  if (year === undefined || year === '') return null;
  const n = Number(year);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new BadRequestException('ANIO_INVALIDO');
  return n;
}
