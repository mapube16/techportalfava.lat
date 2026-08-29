import 'reflect-metadata';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { LIMITE_CUERPO_JSON } from './config/limites';
import { AppModule } from './app.module';
import { env } from './config/env';

const AAD = 'https://login.microsoftonline.com';

// La CSP por defecto de helmet es default-src 'self': connect-src y frame-src
// heredan 'self' y bloquean las llamadas de MSAL a Entra.
const contentSecurityPolicy = {
  useDefaults: true,
  directives: {
    'connect-src': ["'self'", AAD],
    // `blob:` es el visor de PDF: el servidor manda los bytes, el cliente hace
    // `URL.createObjectURL` y lo pinta en un `<iframe>`. Sin esto el navegador tapa el
    // marco con «este contenido está bloqueado» y no dice por qué en la pantalla.
    // No abre nada: un blob solo existe dentro de esta pestaña y de este origen.
    'frame-src': ["'self'", 'blob:', AAD],
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

  // Sin esto Express usa su defecto de 100 KB y NOTA-08b no funciona. El porque
  // entero, y de donde sale la cifra, en config/limites.ts.
  app.useBodyParser('json', { limit: LIMITE_CUERPO_JSON });

  const base = helmet({ contentSecurityPolicy });
  // El puente de redireccion de MSAL v5 NO puede llevar Cross-Origin-Opener-Policy:
  // el browsing context group swap corta el canal de vuelta a la app principal.
  const bridge = helmet({ contentSecurityPolicy, crossOriginOpenerPolicy: false });

  /**
   * Las imagenes de los correos, y SOLO ellas, se sirven a cualquier origen.
   *
   * Helmet pone `Cross-Origin-Resource-Policy: same-origin` en todo, que significa
   * literalmente «ningun origen distinto puede usar esto». Un correo se abre en
   * outlook.office.com o en mail.google.com y pide la imagen aqui: el navegador la
   * rechaza obedeciendo ese encabezado. Por eso `curl` las baja perfectamente y el
   * correo llegaba con el logotipo roto — el recurso estaba bien, el permiso no.
   *
   * Las imagenes de un correo son, por definicion, de otro origen.
   *
   * Acotado a `/email/`: el resto del sitio conserva el mismo-origen, que es lo que
   * evita que otra pagina incruste el PDF de una nota o el logotipo de la aplicacion.
   * Y con cache larga, que son dos ficheros que no cambian y los proxys de correo
   * vuelven a pedirlos por cada destinatario.
   */
  const correo = helmet({
    contentSecurityPolicy,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/email/')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return correo(req, res, next);
    }
    return (req.path === '/redirect.html' ? bridge : base)(req, res, next);
  });

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
