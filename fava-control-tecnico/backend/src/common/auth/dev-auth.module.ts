import { Logger, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { DevAuthController } from './dev-auth.controller';
import { DevAuthService } from './dev-auth.service';

/**
 * Modulo del login de desarrollo temporal (Plan 01-07).
 *
 * app.module lo importa SOLO con DEV_AUTH_ENABLED=true. Apagado no deja rastro:
 * ni ruta, ni provider, ni par de claves local en el resolver JWKS.
 */
@Module({ controllers: [DevAuthController], providers: [DevAuthService] })
export class DevAuthModule implements OnModuleInit {
  onModuleInit(): void {
    // En warn a proposito: quien mire los logs de arranque tiene que ver que
    // esta app NO esta asegurada por Microsoft ahora mismo.
    new Logger('DevAuth').warn(
      'DEV_AUTH_ENABLED=true — POST /api/dev-auth/login activo con contraseña compartida. ' +
        'Esta instancia NO esta asegurada por Microsoft Entra. ' +
        'Retirar DEV_AUTH_ENABLED y DEV_AUTH_PASSWORD al llegar el tenant real (docs/ENV.md).',
    );
  }
}
