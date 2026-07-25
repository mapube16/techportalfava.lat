import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';

/**
 * Sin prefijo /api a proposito: Railway apunta su healthcheck a /health.
 * ponytail: sin indicadores. Un check de BD aqui haria que Railway reiniciase el
 * contenedor cada vez que Postgres hipa; el liveness de la BD lo cubre el smoke.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  // Unico endpoint sin token: el healthcheck de Railway no tiene credenciales.
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
