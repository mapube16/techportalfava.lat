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
   * Rate limit igual que POST /api/access-requests (el ThrottlerGuard no es
   * global), pero con techo mas alto: detras del proxy de Railway todas las
   * peticiones llegan con la MISMA ip, asi que el limite es de hecho global. Con
   * 5/hora el cuarto miembro del equipo se quedaria fuera; 30 intentos/hora
   * siguen sin servirle de nada a una fuerza bruta contra >=12 caracteres.
   */
  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() body: DevLoginBody) {
    return this.service.login(body ?? {});
  }
}
