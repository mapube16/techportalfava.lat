/**
 * CAT-01 por API: quien lee, quien escribe, y la garantia de que la lista de
 * conceptos no puede crecer ni encoger desde HTTP.
 *
 * `GET /api/catalogs` es la primera pieza que consume la Fase 3, asi que su
 * contrato (nombres de las 4 listas y de sus campos) se afirma aqui campo a campo:
 * cambiar uno mas adelante deja la pantalla de captura en blanco.
 *
 * OJO: los catalogos NO se truncan (test/helpers/db.ts explica por que), asi que
 * esta suite limpia lo que ella misma crea y restaura la etiqueta que edita. Sin
 * eso la segunda pasada choca con los @unique de la primera.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { signTestToken } from './helpers/tokens';

const OID_SUPER = 'oid-cat-super';
const OID_ADMIN = 'oid-cat-admin';
const OID_TEC = 'oid-cat-tec';

const ROL_NUEVO = 'Rol e2e nuevo';
const ROL_INACTIVO = 'Rol e2e inactivo';
const CUR_NUEVA = 'ZZZ';
const MAQ_NUEVA = 'E2E-MAQ';

/** Los 8 codigos en el orden que fija `sort_order` en la migracion. */
const CONCEPTOS = ['DC', 'MD', 'DFD', 'DVSF', 'DVRC', 'LR', 'NR', 'IL'];

describe('catalogs: catalogo cerrado y ABM de Super Admin (CAT-01)', () => {
  let app: INestApplication;
  let tokenSuper: string;
  let tokenAdmin: string;
  let tokenTec: string;
  let dcOriginal: { labelEs: string; labelIt: string };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  /** Lo que crea esta suite, fuera. Corre como owner: limpiar no es el sujeto del test. */
  const limpiarLoNuestro = async () => {
    await ownerClient.roleType.deleteMany({ where: { name: { in: [ROL_NUEVO, ROL_INACTIVO] } } });
    await ownerClient.currency.deleteMany({ where: { code: CUR_NUEVA } });
    await ownerClient.machineModel.deleteMany({ where: { code: MAQ_NUEVA } });
  };

  beforeAll(async () => {
    app = await createTestApp();
    [tokenSuper, tokenAdmin, tokenTec] = await Promise.all([
      signTestToken({ oid: OID_SUPER, email: 'super@fava.local' }),
      signTestToken({ oid: OID_ADMIN, email: 'admin@fava.local' }),
      signTestToken({ oid: OID_TEC, email: 'tec@fava.local' }),
    ]);
    dcOriginal = await ownerClient.concept.findUniqueOrThrow({
      where: { code: 'DC' },
      select: { labelEs: true, labelIt: true },
    });
  });

  afterAll(async () => {
    await ownerClient.concept.update({ where: { code: 'DC' }, data: dcOriginal });
    await limpiarLoNuestro();
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    await limpiarLoNuestro();
    await Promise.all([
      crearUsuario({ email: 'super@fava.local', entraOid: OID_SUPER, roles: ['T', 'A', 'S'] }),
      crearUsuario({ email: 'admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
  });

  const catalogos = async (token: string) =>
    (await http().get('/api/catalogs').set(auth(token)).expect(200)).body;

  // ── GET /api/catalogs: abierto a los tres roles (lo consume la Fase 3) ──

  it('un tecnico obtiene los 4 catalogos de un solo GET', async () => {
    const body = await catalogos(tokenTec);

    expect(Object.keys(body).sort()).toEqual([
      'concepts',
      'currencies',
      'machineModels',
      'roleTypes',
    ]);
    expect(body.concepts.map((c: { code: string }) => c.code)).toEqual(CONCEPTOS);
  });

  it('el Admin y el Super Admin tambien leen el catalogo', async () => {
    expect((await catalogos(tokenAdmin)).concepts).toHaveLength(8);
    expect((await catalogos(tokenSuper)).concepts).toHaveLength(8);
  });

  it('el contrato de las 4 listas es exactamente el que consume el cliente', async () => {
    const body = await catalogos(tokenTec);

    expect(Object.keys(body.concepts[0]).sort()).toEqual([
      'code',
      'labelEs',
      'labelIt',
      'sortOrder',
    ]);
    expect(Object.keys(body.roleTypes[0]).sort()).toEqual(['id', 'isActive', 'name']);
    expect(Object.keys(body.currencies[0]).sort()).toEqual(['code', 'isActive', 'symbol']);
    expect(Object.keys(body.machineModels[0]).sort()).toEqual([
      'code',
      'description',
      'id',
      'isActive',
    ]);
    // Etiquetas ES/IT sembradas por la migracion, no cadenas vacias.
    expect(body.concepts[0].labelEs).toBeTruthy();
    expect(body.concepts[0].labelIt).toBeTruthy();
  });

  it('los roles vienen ordenados por nombre', async () => {
    const nombres = (await catalogos(tokenTec)).roleTypes.map((r: { name: string }) => r.name);
    // localeCompare y no .sort(): el ORDER BY de Postgres usa la collation de la base
    // («Mecánico» antes de «Meccatronico»), mientras que .sort() compara unidades
    // UTF-16 y pone la á despues de la z. El orden del motor es el correcto para una
    // lista que ve un humano; el que estaria mal es el de JavaScript.
    expect(nombres).toEqual([...nombres].sort((a: string, b: string) => a.localeCompare(b, 'es')));
  });

  // ── Conceptos: solo etiquetas, solo Super Admin, y la lista no puede cambiar ──

  it('el Super Admin edita la etiqueta ES de un concepto y el GET lo refleja', async () => {
    const res = await http()
      .patch('/api/catalogs/concepts/DC')
      .set(auth(tokenSuper))
      .send({ labelEs: 'Jornada completa e2e' })
      .expect(200);

    expect(res.body).toMatchObject({ code: 'DC', labelEs: 'Jornada completa e2e' });
    expect(res.body.labelIt).toBe(dcOriginal.labelIt);

    const body = await catalogos(tokenTec);
    expect(body.concepts.find((c: { code: string }) => c.code === 'DC').labelEs).toBe(
      'Jornada completa e2e',
    );
  });

  it('un Admin no edita etiquetas de concepto → 403', async () => {
    await http()
      .patch('/api/catalogs/concepts/DC')
      .set(auth(tokenAdmin))
      .send({ labelEs: 'No deberia' })
      .expect(403);
  });

  it('un Tecnico no edita etiquetas de concepto → 403', async () => {
    await http()
      .patch('/api/catalogs/concepts/DC')
      .set(auth(tokenTec))
      .send({ labelEs: 'No deberia' })
      .expect(403);
  });

  it('un codigo que no es del enum → 400, no 500', async () => {
    const res = await http()
      .patch('/api/catalogs/concepts/XX')
      .set(auth(tokenSuper))
      .send({ labelEs: 'Inventado' })
      .expect(400);

    expect(res.body.message).toBe('CONCEPTO_INEXISTENTE');
  });

  it('mandar `code` en el body de un concepto → 400 (el codigo no es editable)', async () => {
    const res = await http()
      .patch('/api/catalogs/concepts/DC')
      .set(auth(tokenSuper))
      .send({ code: 'MD', labelEs: 'Renombrado' })
      .expect(400);

    expect(res.body.message).toBe('CODIGO_NO_EDITABLE');
  });

  it('cualquier otra clave del body se ignora en silencio', async () => {
    const res = await http()
      .patch('/api/catalogs/concepts/DC')
      .set(auth(tokenSuper))
      .send({ labelEs: 'Jornada completa e2e', sortOrder: 99, isActive: false })
      .expect(200);

    expect(res.body.sortOrder).toBe(1);
  });

  it('no existe endpoint para CREAR un concepto → 404', async () => {
    await http()
      .post('/api/catalogs/concepts')
      .set(auth(tokenSuper))
      .send({ code: 'ZZ', labelEs: 'Nuevo', labelIt: 'Nuovo', sortOrder: 9 })
      .expect(404);
  });

  it('no existe endpoint para BORRAR un concepto → 404', async () => {
    await http().delete('/api/catalogs/concepts/DC').set(auth(tokenSuper)).expect(404);
    expect(await ownerClient.concept.count()).toBe(8);
  });

  // ── Roles tecnicos: ABM completo del Super Admin, con desactivacion ──

  it('el Super Admin da de alta un rol tecnico y aparece en el catalogo', async () => {
    const res = await http()
      .post('/api/catalogs/role-types')
      .set(auth(tokenSuper))
      .send({ name: ROL_NUEVO })
      .expect(201);

    expect(res.body).toMatchObject({ name: ROL_NUEVO, isActive: true });
    expect(res.body.id).toEqual(expect.any(String));

    const body = await catalogos(tokenSuper);
    expect(body.roleTypes.map((r: { name: string }) => r.name)).toContain(ROL_NUEVO);
  });

  it('un Admin no da de alta roles tecnicos → 403', async () => {
    await http()
      .post('/api/catalogs/role-types')
      .set(auth(tokenAdmin))
      .send({ name: ROL_NUEVO })
      .expect(403);

    expect(await ownerClient.roleType.count({ where: { name: ROL_NUEVO } })).toBe(0);
  });

  it('nombre vacio → 400', async () => {
    await http()
      .post('/api/catalogs/role-types')
      .set(auth(tokenSuper))
      .send({ name: '   ' })
      .expect(400);
  });

  it('duplicar el nombre de un rol DESACTIVADO → 409 YA_EXISTE_INACTIVO con su id', async () => {
    const inactivo = await ownerClient.roleType.create({
      data: { name: ROL_INACTIVO, isActive: false },
    });

    const res = await http()
      .post('/api/catalogs/role-types')
      .set(auth(tokenSuper))
      .send({ name: ROL_INACTIVO })
      .expect(409);

    expect(res.body.message).toBe('YA_EXISTE_INACTIVO');
    expect(res.body.existente.id).toBe(inactivo.id);
  });

  it('duplicar el nombre de un rol ACTIVO → 409 YA_EXISTE', async () => {
    await ownerClient.roleType.create({ data: { name: ROL_NUEVO } });

    const res = await http()
      .post('/api/catalogs/role-types')
      .set(auth(tokenSuper))
      .send({ name: ROL_NUEVO })
      .expect(409);

    expect(res.body.message).toBe('YA_EXISTE');
  });

  it('desactivar un rol lo deja en el catalogo con isActive false (el listado no oculta)', async () => {
    const rol = await ownerClient.roleType.create({ data: { name: ROL_NUEVO } });

    await http()
      .patch(`/api/catalogs/role-types/${rol.id}`)
      .set(auth(tokenSuper))
      .send({ isActive: false })
      .expect(200);

    const body = await catalogos(tokenSuper);
    expect(body.roleTypes.find((r: { id: string }) => r.id === rol.id)).toMatchObject({
      name: ROL_NUEVO,
      isActive: false,
    });
  });

  it('PATCH de un rol que no existe → 404, no 500', async () => {
    await http()
      .patch('/api/catalogs/role-types/99999999-9999-4999-8999-999999999999')
      .set(auth(tokenSuper))
      .send({ isActive: false })
      .expect(404);
  });

  // ── Monedas ──

  it('el codigo de moneda se normaliza a mayusculas', async () => {
    const res = await http()
      .post('/api/catalogs/currencies')
      .set(auth(tokenSuper))
      .send({ code: CUR_NUEVA.toLowerCase(), symbol: 'Z$' })
      .expect(201);

    expect(res.body).toEqual({ code: CUR_NUEVA, symbol: 'Z$', isActive: true });
  });

  it.each(['ZZ', 'ZZZZ', 'Z1Z'])('un codigo de moneda invalido (%s) → 400', async (code) => {
    await http()
      .post('/api/catalogs/currencies')
      .set(auth(tokenSuper))
      .send({ code, symbol: 'Z$' })
      .expect(400);
  });

  it('desactivar una moneda la deja en el catalogo', async () => {
    await ownerClient.currency.create({ data: { code: CUR_NUEVA, symbol: 'Z$' } });

    await http()
      .patch(`/api/catalogs/currencies/${CUR_NUEVA}`)
      .set(auth(tokenSuper))
      .send({ isActive: false })
      .expect(200);

    const body = await catalogos(tokenSuper);
    expect(body.currencies.find((c: { code: string }) => c.code === CUR_NUEVA).isActive).toBe(false);
  });

  // ── Modelos de maquina ──

  it('el Super Admin da de alta un modelo de maquina con codigo y descripcion', async () => {
    const res = await http()
      .post('/api/catalogs/machine-models')
      .set(auth(tokenSuper))
      .send({ code: MAQ_NUEVA, description: 'Linea Pasta Larga 4500 Kg/h' })
      .expect(201);

    expect(res.body).toMatchObject({
      code: MAQ_NUEVA,
      description: 'Linea Pasta Larga 4500 Kg/h',
      isActive: true,
    });
  });

  it('un modelo sin descripcion es valido y la devuelve null', async () => {
    const res = await http()
      .post('/api/catalogs/machine-models')
      .set(auth(tokenSuper))
      .send({ code: MAQ_NUEVA })
      .expect(201);

    expect(res.body.description).toBeNull();
  });

  it('codigo de modelo duplicado → 409', async () => {
    await ownerClient.machineModel.create({ data: { code: MAQ_NUEVA } });

    const res = await http()
      .post('/api/catalogs/machine-models')
      .set(auth(tokenSuper))
      .send({ code: MAQ_NUEVA })
      .expect(409);

    expect(res.body.message).toBe('YA_EXISTE');
  });

  it('un Admin no da de alta modelos de maquina → 403', async () => {
    await http()
      .post('/api/catalogs/machine-models')
      .set(auth(tokenAdmin))
      .send({ code: MAQ_NUEVA })
      .expect(403);
  });

  // ── Desactivar, nunca borrar: no hay un solo DELETE en /api/catalogs ──

  it.each([
    ['/api/catalogs', 'catalogos'],
    ['/api/catalogs/concepts/DC', 'conceptos'],
    ['/api/catalogs/role-types/33333333-3333-4333-8333-333333333333', 'roles'],
    ['/api/catalogs/currencies/TST', 'monedas'],
    ['/api/catalogs/machine-models/44444444-4444-4444-8444-444444444444', 'modelos'],
  ])('DELETE %s no existe → 404 (%s: desactivar, nunca borrar)', async (ruta) => {
    await http().delete(ruta).set(auth(tokenSuper)).expect(404);
  });
});
