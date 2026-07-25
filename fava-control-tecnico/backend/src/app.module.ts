import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { EnvModule } from './config/env.module';
import { EntraGuard } from './common/auth/entra.guard';
import { jwksProvider } from './common/auth/jwks.provider';
import { RolesGuard } from './common/auth/roles.guard';
import { HealthModule } from './common/health/health.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RlsInterceptor } from './common/prisma/rls.interceptor';

/**
 * `npm -w backend run start:prod` deja cwd en backend/, pero Railway puede
 * arrancar desde la raiz del workspace. __dirname apunta a backend/dist tras
 * compilar. Probar las dos rutas cuesta 3 lineas y elimina la clase entera de bug.
 */
const staticRoot =
  [
    join(process.cwd(), 'frontend', 'dist'),
    join(__dirname, '..', '..', 'frontend', 'dist'),
  ].find(existsSync) ?? join(process.cwd(), 'frontend', 'dist');

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRoot({
      pinoHttp: {
        redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
      },
    }),
    // ponytail: registrado sin APP_GUARD. El unico endpoint que necesita limite es
    // POST /api/access-requests (Plan 01-03), que aplica @UseGuards(ThrottlerGuard).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    // Express 5: el comodin es {*path}, no *.
    ServeStaticModule.forRoot({ rootPath: staticRoot, exclude: ['/api/{*path}'] }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    jwksProvider,
    // Todo protegido por defecto; el opt-out es explicito (@Public, @AllowUnprovisioned).
    // El orden importa: Entra resuelve req.user y RolesGuard lo lee.
    { provide: APP_GUARD, useClass: EntraGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsInterceptor },
  ],
})
export class AppModule {}
