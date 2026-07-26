/**
 * CAT-02 por API: el tecnico existe SIN cuenta Entra (los 14 del Excel no la tienen)
 * y la baja es no destructiva — sus jornadas siguen siendo legibles despues.
 *
 * Las dos mitades que este archivo tiene que demostrar, porque son las dos que un
 * CRUD escrito por inercia rompe: `POST` no crea ninguna fila en `users`, y
 * `PATCH /:id/active` no borra nada (no existe `DELETE`).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { ROL_TEST, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearJornadaAprobada, crearTecnico } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_SUPER = 'oid-tec-super';
const OID_ADMIN = 'oid-tec-admin';
const OID_TEC = 'oid-tec-tec';

/** UUID valido que no es de ningun rol: el FK tiene que responder 400, no 500. */
const ROL_FANTASMA = '55555555-5555-4555-8555-555555555555';

describe('technicians: alta sin Entra y baja que conserva la historia (CAT-02)', () => {
  let app: INestApplication;
  let tokenSuper: string;
  let tokenAdmin: string;
  let tokenTec: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    [tokenSuper, tokenAdmin, tokenTec] = await Promise.all([
      signTestToken({ oid: OID_SUPER, email: 'super@fava.local' }),
      signTestToken({ oid: OID_ADMIN, email: 'admin@fava.local' }),
      signTestToken({ oid: OID_TEC, email: 'tec@fava.local' }),
    ]);
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

  const listar = async (token = tokenAdmin) =>
    (await http().get('/api/technicians').set(auth(token)).expect(200)).body;

  // ── Alta ──

  it('un Admin crea un tecnico externo y este existe SIN ninguna fila en users', async () => {
    const res = await http()
      .post('/api/technicians')
      .set(auth(tokenAdmin))
      .send({ fullName: 'Giuliano Lodi', roleTypeId: ROL_TEST, employmentType: 'EXTERNO' })
      .expect(201);

    expect(res.body).toMatchObject({
      fullName: 'Giuliano Lodi',
      roleTypeId: ROL_TEST,
      roleTypeName: 'Rol de prueba',
      employmentType: 'EXTERNO',
      isActive: true,
      userId: null,
    });
    expect(await ownerClient.user.count({ where: { technicianId: res.body.id } })).toBe(0);
  });

  it('el contrato del tecnico es exactamente el que consume el cliente', async () => {
    await crearTecnico({ fullName: 'Ivan Cortés' });
    const [t] = await listar();

    expect(Object.keys(t).sort()).toEqual([
      'employmentType',
      'fullName',
      'id',
      'isActive',
      'roleTypeId',
      'roleTypeName',
      'userId',
    ]);
  });

  it('un Super Admin tambien crea tecnicos', async () => {
    await http()
      .post('/api/technicians')
      .set(auth(tokenSuper))
      .send({ fullName: 'Felipe Sena', roleTypeId: ROL_TEST, employmentType: 'INTERNO' })
      .expect(201);
  });

  it('un roleTypeId inexistente → 400 con codigo propio, nunca un 500 de FK', async () => {
    const res = await http()
      .post('/api/technicians')
      .set(auth(tokenAdmin))
      .send({ fullName: 'Sin rol', roleTypeId: ROL_FANTASMA, employmentType: 'INTERNO' })
      .expect(400);

    expect(res.body.message).toBe('ROL_TECNICO_INEXISTENTE');
  });

  it('un roleTypeId que no es un UUID → 400', async () => {
    await http()
      .post('/api/technicians')
      .set(auth(tokenAdmin))
      .send({ fullName: 'Sin rol', roleTypeId: 'no-soy-uuid', employmentType: 'INTERNO' })
      .expect(400);
  });

  it('employmentType fuera del enum → 400 (nada de texto libre)', async () => {
    const res = await http()
      .post('/api/technicians')
      .set(auth(tokenAdmin))
      .send({ fullName: 'Freelance', roleTypeId: ROL_TEST, employmentType: 'FREELANCE' })
      .expect(400);

    expect(res.body.message).toBe('TIPO_CONTRATACION_INVALIDO');
    expect(await ownerClient.technician.count({ where: { fullName: 'Freelance' } })).toBe(0);
  });

  it('fullName vacio → 400', async () => {
    await http()
      .post('/api/technicians')
      .set(auth(tokenAdmin))
      .send({ fullName: '  ', roleTypeId: ROL_TEST, employmentType: 'INTERNO' })
      .expect(400);
  });

  // ── Listado: no filtra; filtran los selectores ──

  it('el listado devuelve activos e inactivos, ordenados por nombre', async () => {
    await crearTecnico({ fullName: 'Zacarias Vega' });
    await crearTecnico({ fullName: 'Alberto Ruiz', isActive: false });

    const nombres = (await listar()).map((t: { fullName: string }) => t.fullName);
    expect(nombres).toContain('Alberto Ruiz');
    expect(nombres).toEqual([...nombres].sort((a: string, b: string) => a.localeCompare(b, 'es')));
  });

  it('el listado resuelve roleTypeName y el userId del usuario vinculado', async () => {
    const conCuenta = await crearTecnico({ fullName: 'Con cuenta' });
    const user = await crearUsuario({ email: 'concuenta@fava.local', technicianId: conCuenta.id });
    await crearTecnico({ fullName: 'Sin cuenta' });

    const filas = await listar();
    const buscar = (n: string) => filas.find((t: { fullName: string }) => t.fullName === n);

    expect(buscar('Con cuenta')).toMatchObject({ roleTypeName: 'Rol de prueba', userId: user.id });
    expect(buscar('Sin cuenta').userId).toBeNull();
  });

  // ── Edicion ──

  it('un Admin edita nombre, rol y tipo de contratacion', async () => {
    const t = await crearTecnico({ fullName: 'Antes', employmentType: 'INTERNO' });
    const otroRol = await ownerClient.roleType.findFirstOrThrow({ where: { NOT: { id: ROL_TEST } } });

    const res = await http()
      .patch(`/api/technicians/${t.id}`)
      .set(auth(tokenAdmin))
      .send({ fullName: 'Despues', roleTypeId: otroRol.id, employmentType: 'EXTERNO' })
      .expect(200);

    expect(res.body).toMatchObject({
      fullName: 'Despues',
      roleTypeId: otroRol.id,
      roleTypeName: otroRol.name,
      employmentType: 'EXTERNO',
    });
  });

  it('PATCH de un tecnico que no existe → 404, no 500', async () => {
    await http()
      .patch('/api/technicians/66666666-6666-4666-8666-666666666666')
      .set(auth(tokenAdmin))
      .send({ fullName: 'Fantasma' })
      .expect(404);
  });

  it('PATCH a un roleTypeId inexistente → 400', async () => {
    const t = await crearTecnico();
    const res = await http()
      .patch(`/api/technicians/${t.id}`)
      .set(auth(tokenAdmin))
      .send({ roleTypeId: ROL_FANTASMA })
      .expect(400);

    expect(res.body.message).toBe('ROL_TECNICO_INEXISTENTE');
  });

  // ── Baja: desactivar, nunca borrar ──

  it('desactivar a un tecnico lo deja en la lista y sus jornadas siguen legibles', async () => {
    const t = await crearTecnico({ fullName: 'Se da de baja' });
    const jornada = await crearJornadaAprobada({
      technicianId: t.id,
      date: new Date('2026-03-02T00:00:00Z'),
    });

    await http()
      .patch(`/api/technicians/${t.id}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: false })
      .expect(200);

    expect((await listar()).find((f: { id: string }) => f.id === t.id)).toMatchObject({
      fullName: 'Se da de baja',
      isActive: false,
    });

    // La jornada sigue entera y sigue apuntando a su tecnico: la baja no la toca. Se
    // compara la fila ENTERA contra la que se creo, en vez de tres campos elegidos a
    // mano: dice mas («no cambio NADA») y no se acopla al concepto que use el fixture,
    // que desde el CHECK de 03-01 depende de si la jornada lleva proyecto o no.
    const relectura = await ownerClient.dailyEntry.findUnique({ where: { id: jornada.id } });
    expect(relectura).toEqual(jornada);
    expect(relectura?.technicianId).toBe(t.id);
  });

  it('reactivar a un tecnico → 200', async () => {
    const t = await crearTecnico({ isActive: false });
    const res = await http()
      .patch(`/api/technicians/${t.id}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: true })
      .expect(200);

    expect(res.body.isActive).toBe(true);
  });

  it('isActive que no es booleano → 400', async () => {
    const t = await crearTecnico();
    await http()
      .patch(`/api/technicians/${t.id}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: 'no' })
      .expect(400);
  });

  it('no existe DELETE de tecnicos → 404 y el tecnico sigue ahi', async () => {
    const t = await crearTecnico();

    await http().delete(`/api/technicians/${t.id}`).set(auth(tokenSuper)).expect(404);

    expect(await ownerClient.technician.count({ where: { id: t.id } })).toBe(1);
  });

  // ── RBAC: el maestro de tecnicos es cosa de A y S ──

  it.each([
    ['get', '/api/technicians'],
    ['post', '/api/technicians'],
    ['patch', '/api/technicians/66666666-6666-4666-8666-666666666666'],
    ['patch', '/api/technicians/66666666-6666-4666-8666-666666666666/active'],
  ])('un Tecnico raso en %s %s → 403', async (metodo, ruta) => {
    await (http() as unknown as Record<string, (r: string) => request.Test>)
      [metodo](ruta)
      .set(auth(tokenTec))
      .send({})
      .expect(403);
  });
});
