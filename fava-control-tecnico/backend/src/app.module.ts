import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { EnvModule } from './config/env.module';
import { env } from './config/env';
import { DevAuthModule } from './common/auth/dev-auth.module';
import { EntraGuard } from './common/auth/entra.guard';
import { jwksProvider } from './common/auth/jwks.provider';
import { RolesGuard } from './common/auth/roles.guard';
import { HealthModule } from './common/health/health.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RlsInterceptor } from './common/prisma/rls.interceptor';
import { AccessRequestsModule } from './modules/access-requests/access-requests.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { MeModule } from './modules/me/me.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { UsersModule } from './modules/users/users.module';

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
    MeModule,
    AccessRequestsModule,
    UsersModule,
    CatalogsModule,
    TechniciansModule,
    ProjectsModule,
    // Login de desarrollo temporal: se REGISTRA o no. Sin el flag la ruta no
    // existe (404, no 401) y el keyset local no se carga (jwks.provider.ts).
    ...(env.DEV_AUTH_ENABLED ? [DevAuthModule] : []),
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
