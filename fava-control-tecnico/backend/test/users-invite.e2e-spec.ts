/**
 * CAT-05, las dos piezas que la Fase 1 no dejo hechas: invitar un usuario y
 * vincularlo a un tecnico.
 *
 * La escalada de roles NO se reprueba aqui en todas sus formas (eso es
 * `users-roles.e2e-spec.ts`, AUTH-02): lo que se prueba es que POST /api/users
 * pasa por la MISMA regla y no por una copia relajada.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { signTestToken } from './helpers/tokens';

const OID_SUPER = 'oid-inv-super';
const OID_ADMIN = 'oid-inv-admin';
const OID_TEC = 'oid-inv-tec';

describe('users: invitacion (CAT-05)', () => {
  let app: INestApplication;
  let tokenSuper: string;
  let tokenAdmin: string;
  let tokenTec: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    tokenSuper = await signTestToken({ oid: OID_SUPER, email: 'super@fava.local' });
    tokenAdmin = await signTestToken({ oid: OID_ADMIN, email: 'admin@fava.local' });
    tokenTec = await signTestToken({ oid: OID_TEC, email: 'tec@fava.local' });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    await Promise.all([
      crearUsuario({ email: 'super@fava.local', entraOid: OID_SUPER, roles: ['T', 'A', 'S'] }),
      crearUsuario({ email: 'admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
  });

  const enBd = (email: string) => ownerClient.user.findUnique({ where: { email } });

  it('un Admin invita a un tecnico → 201 con entra_oid null y activo', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'nuevo@fava.local', displayName: 'Tecnico Nuevo', roles: ['T'] })
      .expect(201);

    expect(res.body).toMatchObject({
      email: 'nuevo@fava.local',
      displayName: 'Tecnico Nuevo',
      roles: ['T'],
      isActive: true,
    });

    // entra_oid null a proposito: la identidad definitiva la fija el primer login
    // real por coincidencia de email (EntraGuard.vincular, patron de 01-03).
    const fila = await enBd('nuevo@fava.local');
    expect(fila?.entraOid).toBeNull();
    expect(fila?.isActive).toBe(true);
  });

  it('el email se guarda normalizado (trim + minusculas), igual que en seed.ts', async () => {
    await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: '  Nombre@Fava.Local ', displayName: 'Con Mayusculas' })
      .expect(201);

    // Sin esta normalizacion el invitado nunca vincula su login: el guard
    // normaliza el claim `email` del token antes de buscar la fila.
    expect(await enBd('nombre@fava.local')).not.toBeNull();
  });

  it('sin roles en el body, el invitado queda como Tecnico', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'pordefecto@fava.local', displayName: 'Por Defecto' })
      .expect(201);

    expect(res.body.roles).toEqual(['T']);
  });

  it('un Admin que invita a un Admin → 403 (misma regla que PATCH /:id/roles)', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'escalada@fava.local', displayName: 'Escalada', roles: ['T', 'A'] })
      .expect(403);

    expect(res.body.message).toBe('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');
    expect(await enBd('escalada@fava.local')).toBeNull();
  });

  it('un Super Admin invita a un Admin → 201', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenSuper))
      .send({ email: 'otroadmin@fava.local', displayName: 'Otro Admin', roles: ['T', 'A'] })
      .expect(201);

    expect(res.body.roles).toEqual(['T', 'A']);
  });

  it('email ya registrado → 409, no un 500 del constraint unico', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'admin@fava.local', displayName: 'Duplicado' })
      .expect(409);

    expect(res.body.message).toBe('EMAIL_YA_REGISTRADO');
  });

  it.each([
    ['email sin arroba', { email: 'no-es-un-email', displayName: 'Malo' }],
    ['email vacio', { email: '   ', displayName: 'Malo' }],
    ['sin email', { displayName: 'Malo' }],
    ['displayName vacio', { email: 'ok@fava.local', displayName: '  ' }],
    ['sin displayName', { email: 'ok@fava.local' }],
    ['roles invalidos', { email: 'ok@fava.local', displayName: 'Malo', roles: ['X'] }],
    ['roles vacios', { email: 'ok@fava.local', displayName: 'Malo', roles: [] }],
  ])('body invalido (%s) → 400', async (_caso, body) => {
    await http().post('/api/users').set(auth(tokenAdmin)).send(body).expect(400);
  });

  it('un tecnico raso no invita a nadie → 403', async () => {
    await http()
      .post('/api/users')
      .set(auth(tokenTec))
      .send({ email: 'colado@fava.local', displayName: 'Colado' })
      .expect(403);

    expect(await enBd('colado@fava.local')).toBeNull();
  });

  it('el invitado vincula su cuenta en el primer login por coincidencia de email', async () => {
    await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'invitado@fava.local', displayName: 'Invitado' })
      .expect(201);

    // Token de un OID que la app no ha visto nunca, con el email de la invitacion.
    const tokenInvitado = await signTestToken({
      oid: 'oid-recien-llegado',
      email: 'invitado@fava.local',
    });

    const yo = await http().get('/api/me').set(auth(tokenInvitado)).expect(200);
    expect(yo.body.status).toBe('ok');
    expect(yo.body.user.email).toBe('invitado@fava.local');

    // La invitacion no fija identidad; el login si, y ya es definitiva.
    expect((await enBd('invitado@fava.local'))?.entraOid).toBe('oid-recien-llegado');
  });
});
