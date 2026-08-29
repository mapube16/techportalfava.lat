/**
 * AUTH-02 y criterio 4 del roadmap: quien puede asignar QUE rol.
 * La regla vive en users.service, no en decoradores por endpoint: un @Roles('S')
 * impediria que un Admin asigne el rol Tecnico, que si puede (matriz §6).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { signTestToken } from './helpers/tokens';

const OID_SUPER = 'oid-super';
const OID_ADMIN = 'oid-admin';
const OID_TEC = 'oid-tec';

describe('users: escalada de roles y anti-lockout (AUTH-02)', () => {
  let app: INestApplication;
  let tokenSuper: string;
  let tokenAdmin: string;
  let tokenTec: string;
  let ids: { super: string; admin: string; tec: string };

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
    const [s, a, t] = await Promise.all([
      crearUsuario({ email: 'super@fava.local', entraOid: OID_SUPER, roles: ['T', 'A', 'S'] }),
      crearUsuario({ email: 'admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
    ids = { super: s.id, admin: a.id, tec: t.id };
  });

  const rolesDe = async (id: string) => (await ownerClient.user.findUnique({ where: { id } }))?.roles;

  it('un tecnico raso no entra a /api/users', async () => {
    await http().get('/api/users').set(auth(tokenTec)).expect(403);
  });

  it('un Admin asigna el rol Tecnico → 200', async () => {
    await http()
      .patch(`/api/users/${ids.tec}/roles`)
      .set(auth(tokenAdmin))
      .send({ roles: ['T'] })
      .expect(200);

    expect(await rolesDe(ids.tec)).toEqual(['T']);
  });

  it('un Admin que asigna el rol Admin → 403 (criterio 4)', async () => {
    const res = await http()
      .patch(`/api/users/${ids.tec}/roles`)
      .set(auth(tokenAdmin))
      .send({ roles: ['T', 'A'] })
      .expect(403);

    expect(res.body.message).toBe('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');
    expect(await rolesDe(ids.tec)).toEqual(['T']);
  });

  it('un Super Admin que asigna el rol Admin → 200 (criterio 4)', async () => {
    await http()
      .patch(`/api/users/${ids.tec}/roles`)
      .set(auth(tokenSuper))
      .send({ roles: ['T', 'A'] })
      .expect(200);

    expect(await rolesDe(ids.tec)).toEqual(['T', 'A']);
  });

  it('un Admin no toca los roles de otro Admin → 403', async () => {
    const res = await http()
      .patch(`/api/users/${ids.admin}/roles`)
      .set(auth(tokenAdmin))
      .send({ roles: ['T'] })
      .expect(403);

    expect(res.body.message).toBe('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');
  });

  it('anti-lockout: un Super Admin no puede quitarse su propio rol S → 400', async () => {
    const res = await http()
      .patch(`/api/users/${ids.super}/roles`)
      .set(auth(tokenSuper))
      .send({ roles: ['T', 'A'] })
      .expect(400);

    expect(res.body.message).toBe('NO_PUEDES_QUITARTE_SUPER_ADMIN');
    expect(await rolesDe(ids.super)).toEqual(['T', 'A', 'S']);
  });

  it('anti-lockout: quitar el rol S al ultimo Super Admin activo → 400', async () => {
    const res = await http()
      .patch(`/api/users/${ids.super}/roles`)
      .set(auth(tokenAdmin))
      .send({ roles: ['T'] })
      .expect(400);

    expect(res.body.message).toBe('DEBE_QUEDAR_UN_SUPER_ADMIN');
    expect(await rolesDe(ids.super)).toEqual(['T', 'A', 'S']);
  });

  it('anti-lockout: desactivar al ultimo Super Admin activo → 400', async () => {
    const res = await http()
      .patch(`/api/users/${ids.super}/active`)
      .set(auth(tokenSuper))
      .send({ isActive: false })
      .expect(400);

    expect(res.body.message).toBe('DEBE_QUEDAR_UN_SUPER_ADMIN');
  });

  it('desactivar a un usuario le corta el acceso en su siguiente peticion (AUTH-04)', async () => {
    await http().get('/api/me').set(auth(tokenTec)).expect(200);

    await http()
      .patch(`/api/users/${ids.tec}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: false })
      .expect(200);

    const yo = await http().get('/api/me').set(auth(tokenTec)).expect(200);
    expect(yo.body.status).toBe('deactivated');
  });

  it('GET /api/users devuelve lo minimo que la pantalla Usuarios necesita', async () => {
    const res = await http().get('/api/users').set(auth(tokenAdmin)).expect(200);

    expect(res.body).toHaveLength(3);
    // `technicianId` es la expansion anunciada por el comentario de CAMPOS (Fase 2,
    // CAT-05): la pantalla Usuarios tiene que poder mostrar el vinculo con el tecnico.
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'displayName',
      'email',
      'id',
      'isActive',
      // Fase 9: la pantalla Usuarios lo muestra para saber en que idioma escribirle.
      'lang',
      'roles',
      'technicianId',
    ]);
  });
});
