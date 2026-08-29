/**
 * La cadena de identidad de punta a punta contra la BD real.
 * Cubre AUTH-01 (token → identidad) y el criterio 3 del roadmap (AUTH-04:
 * desactivar corta en la peticion INMEDIATAMENTE siguiente, con el mismo token).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { signTestToken } from './helpers/tokens';

const OID_INVITADO = 'oid-invitado';
const OID_DESCONOCIDO = 'oid-desconocido';
const EMAIL = 'tecnico@fava.local';

describe('auth (AUTH-01, AUTH-04)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('sin token: cualquier ruta /api responde 401', async () => {
    await http().get('/api/me').expect(401);
    await http().get('/api/access-requests').expect(401);
  });

  it('usuario activo → status ok con los roles de la BD', async () => {
    await crearUsuario({
      email: EMAIL,
      displayName: 'Tecnico Uno',
      entraOid: OID_INVITADO,
      roles: ['T', 'A'],
    });
    const token = await signTestToken({ oid: OID_INVITADO, email: EMAIL, name: 'Tecnico Uno' });

    const res = await http().get('/api/me').set('authorization', `Bearer ${token}`).expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      displayName: 'Tecnico Uno',
      email: EMAIL,
      roles: ['T', 'A'],
      technicianId: null,
      // Fase 9: el idioma de SUS correos. El contrato se quedo atras cuando se añadio.
      lang: 'es',
    });
  });

  it('primer login de un invitado: vincula el OID y el email deja de importar', async () => {
    await crearUsuario({ email: EMAIL, displayName: 'Invitada', entraOid: null });
    const token = await signTestToken({ oid: OID_INVITADO, email: EMAIL.toUpperCase() });

    await http().get('/api/me').set('authorization', `Bearer ${token}`).expect(200);

    const fila = await ownerClient.user.findUnique({ where: { email: EMAIL } });
    expect(fila?.entraOid).toBe(OID_INVITADO);
  });

  it('cuenta valida pero no invitada → not_invited, y la solicitud la marca pendiente', async () => {
    const token = await signTestToken({
      oid: OID_DESCONOCIDO,
      email: 'nadie@fava.local',
      name: 'Nadie',
    });

    const antes = await http().get('/api/me').set('authorization', `Bearer ${token}`).expect(200);
    expect(antes.body).toEqual({
      status: 'not_invited',
      entra: { displayName: 'Nadie', email: 'nadie@fava.local' },
      requestPending: false,
    });

    const creada = await http()
      .post('/api/access-requests')
      .set('authorization', `Bearer ${token}`)
      .expect(201);
    expect(creada.body).toEqual({ id: expect.any(String), status: 'pending' });

    const despues = await http().get('/api/me').set('authorization', `Bearer ${token}`).expect(200);
    expect(despues.body.requestPending).toBe(true);
  });

  it('solicitar acceso dos veces no duplica: upsert por entra_oid', async () => {
    const token = await signTestToken({ oid: OID_DESCONOCIDO, email: 'nadie@fava.local' });
    const enviar = () =>
      http().post('/api/access-requests').set('authorization', `Bearer ${token}`).expect(201);

    const primera = await enviar();
    const segunda = await enviar();

    expect(segunda.body.id).toBe(primera.body.id);
    expect(await ownerClient.accessRequest.count()).toBe(1);
  });

  it('un usuario que ya tiene acceso no puede solicitarlo → 409', async () => {
    await crearUsuario({ email: EMAIL, entraOid: OID_INVITADO });
    const token = await signTestToken({ oid: OID_INVITADO, email: EMAIL });

    await http()
      .post('/api/access-requests')
      .set('authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('cuenta desactivada → status deactivated, distinto de not_invited', async () => {
    await crearUsuario({
      email: EMAIL,
      displayName: 'Baja',
      entraOid: OID_INVITADO,
      isActive: false,
    });
    const token = await signTestToken({ oid: OID_INVITADO, email: EMAIL, name: 'Baja' });

    const res = await http().get('/api/me').set('authorization', `Bearer ${token}`).expect(200);

    expect(res.body).toEqual({
      status: 'deactivated',
      entra: { displayName: 'Baja', email: EMAIL },
    });
  });

  it('oid desconocido en un endpoint normal → 403 (el tenant entero no entra a la app)', async () => {
    const token = await signTestToken({ oid: OID_DESCONOCIDO, email: 'nadie@fava.local' });
    await http().get('/api/access-requests').set('authorization', `Bearer ${token}`).expect(403);
  });

  it('AUTH-04: desactivar corta el acceso en la peticion siguiente con el MISMO token', async () => {
    const admin = await crearUsuario({
      email: 'admin@fava.local',
      entraOid: OID_INVITADO,
      roles: ['A'],
    });
    const token = await signTestToken({ oid: OID_INVITADO, email: 'admin@fava.local' });
    const auth = `Bearer ${token}`;

    await http().get('/api/access-requests').set('authorization', auth).expect(200);

    await ownerClient.user.update({ where: { id: admin.id }, data: { isActive: false } });

    // Mismo token, sin esperar a que expire y sin cache que invalidar.
    await http().get('/api/access-requests').set('authorization', auth).expect(403);
    const yo = await http().get('/api/me').set('authorization', auth).expect(200);
    expect(yo.body.status).toBe('deactivated');
  });
});

describe('rate limit de solicitudes de acceso', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // App propia: el contador del throttler vive en el proceso de cada app.
    app = await createTestApp();
    await truncateAll();
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  it('la sexta solicitud en la misma hora → 429', async () => {
    const token = await signTestToken({ oid: 'oid-insistente', email: 'insistente@fava.local' });
    const enviar = () =>
      request(app.getHttpServer()).post('/api/access-requests').set('authorization', `Bearer ${token}`);

    for (let i = 0; i < 5; i++) await enviar().expect(201);
    await enviar().expect(429);
  });
});
