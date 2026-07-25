import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

/**
 * Sin prefijo /api a proposito: Railway apunta su healthcheck a /health.
 * ponytail: sin indicadores. Un check de BD aqui haria que Railway reiniciase el
 * contenedor cada vez que Postgres hipa; el liveness de la BD lo cubre el smoke.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
