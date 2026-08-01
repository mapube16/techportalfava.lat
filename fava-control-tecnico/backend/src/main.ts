import 'reflect-metadata';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

const AAD = 'https://login.microsoftonline.com';

// La CSP por defecto de helmet es default-src 'self': connect-src y frame-src
// heredan 'self' y bloquean las llamadas de MSAL a Entra.
const contentSecurityPolicy = {
  useDefaults: true,
  directives: {
    'connect-src': ["'self'", AAD],
    'frame-src': ["'self'", AAD],
    'form-action': ["'self'", AAD],
  },
} as const;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Railway pone el proceso detrás de un proxy: sin esto, `req.ip` en la firma
  // (NOTA-04, evidencia de quién firmó) guardaría la IP interna del proxy, no la del
  // cliente. Un solo salto porque solo hay un proxy delante, no una cadena.
  app.set('trust proxy', 1);

  const base = helmet({ contentSecurityPolicy });
  // El puente de redireccion de MSAL v5 NO puede llevar Cross-Origin-Opener-Policy:
  // el browsing context group swap corta el canal de vuelta a la app principal.
  const bridge = helmet({ contentSecurityPolicy, crossOriginOpenerPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path === '/redirect.html' ? bridge : base)(req, res, next),
  );

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
