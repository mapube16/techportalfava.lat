/**
 * App de test con la identidad falsificable pero verificada de verdad.
 *
 * Dos sustituciones y ninguna mas:
 *  - JWKS      → claves locales (test/helpers/tokens.ts): firma real, cero red.
 *  - EnvService → tenant y audiencia de prueba, que es exactamente lo que el
 *    swap dev→FAVA cambia en produccion (AUTH-01: solo variables, nunca codigo).
 */
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { JWKS } from '../../src/common/auth/jwks.provider';
import { EnvService, env } from '../../src/config/env';
import { LIMITE_CUERPO_JSON } from '../../src/config/limites';
import type { Role } from '../../src/generated/prisma/enums';
import { API_AUDIENCE, SCOPE, TENANT_A, localJwks } from './tokens';
import { ownerClient } from './db';

export async function createTestApp(tenantId: string = TENANT_A): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JWKS)
    .useValue(await localJwks())
    .overrideProvider(EnvService)
    .useValue({
      ...env,
      ENTRA_TENANT_ID: tenantId,
      ENTRA_API_CLIENT_ID: API_AUDIENCE,
      ENTRA_REQUIRED_SCOPE: SCOPE,
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  // MISMO limite de cuerpo que main.ts. Sin esto la app de test y la real difieren en
  // algo que se ve desde fuera, y ninguna prueba puede cazarlo: el 2026-08-29 los
  // comprobantes estuvieron rotos en produccion con la suite en verde.
  app.useBodyParser('json', { limit: LIMITE_CUERPO_JSON });
  await app.init();
  return app;
}

/** Siembra como owner (salta RLS): los fixtures no son el sujeto del test. */
export function crearUsuario(datos: {
  email: string;
  displayName?: string;
  entraOid?: string | null;
  roles?: Role[];
  isActive?: boolean;
  technicianId?: string | null;
}) {
  return ownerClient.user.create({
    data: {
      email: datos.email,
      displayName: datos.displayName ?? datos.email,
      entraOid: datos.entraOid ?? null,
      roles: datos.roles ?? ['T'],
      isActive: datos.isActive ?? true,
      technicianId: datos.technicianId ?? null,
    },
  });
}
