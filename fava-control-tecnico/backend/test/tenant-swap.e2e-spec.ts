/**
 * AUTH-01, la mitad que nadie prueba: cambiar de tenant es cambiar una variable.
 *
 * Dos apps identicas, construidas del MISMO codigo, con distinto ENTRA_TENANT_ID.
 * Cada una acepta los tokens de su tenant y rechaza los del otro. Si alguien
 * hardcodea un tenant en el codigo, este test se pone rojo por los dos lados.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { disconnectAll, truncateAll } from './helpers/db';
import { TENANT_A, TENANT_B, signTestToken } from './helpers/tokens';

const OID = 'oid-swap';
const EMAIL = 'swap@fava.local';

describe('swap de tenant (AUTH-01)', () => {
  let appA: INestApplication;
  let appB: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    appA = await createTestApp(TENANT_A);
    appB = await createTestApp(TENANT_B);
    tokenA = await signTestToken({ oid: OID, email: EMAIL, tid: TENANT_A });
    tokenB = await signTestToken({ oid: OID, email: EMAIL, tid: TENANT_B });
  });

  // Sembrar por test, no una vez: la BD local es compartida con las otras suites.
  beforeEach(async () => {
    await truncateAll();
    await crearUsuario({ email: EMAIL, displayName: 'Swap', entraOid: OID });
  });

  afterAll(async () => {
    await appA?.close();
    await appB?.close();
    await disconnectAll();
  });

  const me = (app: INestApplication, token: string) =>
    request(app.getHttpServer()).get('/api/me').set('authorization', `Bearer ${token}`);

  it('la app del tenant A acepta el token de A y rechaza el de B', async () => {
    const propio = await me(appA, tokenA).expect(200);
    expect(propio.body.status).toBe('ok');
    await me(appA, tokenB).expect(401);
  });

  it('la app del tenant B acepta el token de B y rechaza el de A', async () => {
    const propio = await me(appB, tokenB).expect(200);
    expect(propio.body.status).toBe('ok');
    await me(appB, tokenA).expect(401);
  });
});
