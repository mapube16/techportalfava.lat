import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from './public.decorator';
import { DevAuthService } from './dev-auth.service';
import type { DevLoginBody } from './dev-auth.service';

/**
 * Esta ruta SOLO existe si DEV_AUTH_ENABLED=true: el modulo que la declara no se
 * registra en otro caso, asi que sin el flag responde 404 (no 401) — no hay
 * endpoint que sondear. Sin prefijo global: la ruta va completa (Plan 01-01).
 */
@Controller('api/dev-auth')
export class DevAuthController {
  constructor(private readonly service: DevAuthService) {}

  /**
   * @Public porque es el unico sitio donde todavia no hay token que validar.
   * Rate limit como en POST /api/access-requests (el ThrottlerGuard no es global):
   * 10/hora deja margen a un dedo torpe y no le sirve de nada a un ataque de
   * fuerza bruta contra una contraseña de 12 caracteres o mas.
   */
  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() body: DevLoginBody) {
    return this.service.login(body ?? {});
  }
}
