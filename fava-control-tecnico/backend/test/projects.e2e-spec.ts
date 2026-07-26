/**
 * CAT-03 por API: los 7 campos del encabezado de la Nota Semanal se capturan y se
 * recuperan IDENTICOS, y `contractValue` viaja como **number**.
 *
 * Lo de `contractValue` no es paranoia: verificado contra el motor en este repo,
 * `JSON.stringify(project)` emite `{"contractValue":"4150000.5"}` — string, y de
 * paso pierde el decimal fijo. `money()` del frontend hace `v.toLocaleString()`
 * sobre eso. La conversion explicita del controlador es lo unico que lo evita.
 *
 * Las maquinas y los dias vendidos son recursos APARTE: este archivo prueba
 * tambien que el PATCH generico los rechaza.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { CUR_TEST, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearProyecto } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_SUPER = 'oid-proj-super';
const OID_ADMIN = 'oid-proj-admin';
const OID_TEC = 'oid-proj-tec';

/** UUID valido que no es de ningun proyecto. */
const FANTASMA = '99999999-9999-4999-8999-999999999999';

/** Los 7 campos que imprime la Nota (el 7.º, `clientNit`, es de CAT-03 y NO va al PDF). */
const ENCABEZADO = {
  name: 'Cibao — Rep. Dominicana',
  clientName: 'MOLINOS DEL VALLE DEL CIBAO',
  clientNit: '130-98765-4',
  locality: 'Santiago de los Caballeros',
  country: 'República Dominicana',
  supply: 'Instalación Eléctrica',
  contractNumber: '345500',
};

const COMERCIAL = {
  oaNumber: 'OA0163864',
  contractValue: 4150000.75,
  currencyCode: CUR_TEST,
  normalHours: 8,
};

describe('projects: encabezado de la Nota, Decimal como number y RBAC (CAT-03)', () => {
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

  const crear = async (body: object, token = tokenAdmin) =>
    (await http().post('/api/projects').set(auth(token)).send(body).expect(201)).body;

  const detalle = async (id: string, token = tokenAdmin) =>
    (await http().get(`/api/projects/${id}`).set(auth(token)).expect(200)).body;

  const listar = async (token = tokenAdmin) =>
    (await http().get('/api/projects').set(auth(token)).expect(200)).body;

  // ── El encabezado literal de la Nota, ida y vuelta ──

  it('los 7 campos del encabezado se recuperan identicos campo por campo', async () => {
    const creado = await crear({ ...ENCABEZADO, ...COMERCIAL });
    const leido = await detalle(creado.id);

    // Campo por campo y no con un toEqual del objeto entero: si uno se cae por el
    // camino (un `select` incompleto) el mensaje tiene que nombrarlo.
    for (const [campo, valor] of Object.entries(ENCABEZADO)) {
      expect(leido[campo]).toBe(valor);
    }
    expect(leido).toMatchObject({ ...COMERCIAL, isActive: true });
  });

  it('locality y country son dos campos independientes (KPI-04 agrupa por pais)', async () => {
    const p = await crear({ ...ENCABEZADO });
    const leido = await detalle(p.id);

    expect(leido.locality).toBe('Santiago de los Caballeros');
    expect(leido.country).toBe('República Dominicana');
    // La Nota los imprime unidos, pero eso es de la Fase 5: aqui viajan separados.
    expect(leido.locality).not.toContain('República');
  });

  it('createdById queda con el id del actor que lo creo', async () => {
    const p = await crear({ ...ENCABEZADO });
    const actor = await ownerClient.user.findUniqueOrThrow({ where: { email: 'admin@fava.local' } });

    const fila = await ownerClient.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(fila.createdById).toBe(actor.id);
  });

  it('clientNit, oaNumber, contractValue, currencyCode y normalHours son opcionales', async () => {
    const p = await crear({ ...ENCABEZADO, clientNit: undefined });
    const leido = await detalle(p.id);

    expect(leido).toMatchObject({
      clientNit: null,
      oaNumber: null,
      contractValue: null,
      currencyCode: null,
      normalHours: null,
    });
  });

  // ── Decimal (Pitfall 5) ──

  it('contractValue es un number en el detalle, no el string de Decimal.toJSON', async () => {
    const p = await crear({ ...ENCABEZADO, ...COMERCIAL });
    const leido = await detalle(p.id);

    expect(typeof leido.contractValue).toBe('number');
    expect(leido.contractValue).toBe(4150000.75);
  });

  it('contractValue es un number tambien en el listado', async () => {
    await crear({ ...ENCABEZADO, ...COMERCIAL });
    const [fila] = await listar();

    expect(typeof fila.contractValue).toBe('number');
    expect(fila.contractValue).toBe(4150000.75);
  });

  it('contractValue nulo viaja como null, no como "null" ni como 0', async () => {
    const p = await crear({ ...ENCABEZADO });
    const leido = await detalle(p.id);
    const [fila] = await listar();

    expect(leido.contractValue).toBeNull();
    expect(fila.contractValue).toBeNull();
  });

  it('un contractValue que no es numero → 400', async () => {
    await http()
      .post('/api/projects')
      .set(auth(tokenAdmin))
      .send({ ...ENCABEZADO, contractValue: '4.150.000' })
      .expect(400);
  });

  // ── Contrato del listado ──

  it('el listado devuelve exactamente los campos que consume Projects.tsx', async () => {
    await crear({ ...ENCABEZADO, ...COMERCIAL });
    const [fila] = await listar();

    expect(Object.keys(fila).sort()).toEqual([
      'clientName',
      'contractNumber',
      'contractValue',
      'country',
      'currencyCode',
      'id',
      'isActive',
      'machineCodes',
      'name',
      'normalHours',
      'oaNumber',
    ]);
    expect(fila.machineCodes).toEqual([]);
  });

  // ── Campos obligatorios: sin ellos el PDF sale mutilado ──

  it.each(['clientName', 'locality', 'country', 'supply', 'contractNumber', 'name'])(
    'POST sin %s → 400',
    async (campo) => {
      const body: Record<string, unknown> = { ...ENCABEZADO };
      delete body[campo];
      await http().post('/api/projects').set(auth(tokenAdmin)).send(body).expect(400);
    },
  );

  it('una moneda inexistente → 400 con codigo propio, nunca un 500 de FK', async () => {
    const res = await http()
      .post('/api/projects')
      .set(auth(tokenAdmin))
      .send({ ...ENCABEZADO, currencyCode: 'ZZZ' })
      .expect(400);

    expect(res.body.message).toBe('MONEDA_INEXISTENTE');
    expect(await ownerClient.project.count({ where: { name: ENCABEZADO.name } })).toBe(0);
  });

  // ── PATCH: encabezado y comercial, nada mas ──

  it('un Admin edita el encabezado y el comercial', async () => {
    const p = await crearProyecto();

    const res = await http()
      .patch(`/api/projects/${p.id}`)
      .set(auth(tokenAdmin))
      .send({ clientName: 'OTRO CLIENTE', contractValue: 999.99, normalHours: 10 })
      .expect(200);

    expect(res.body).toMatchObject({ clientName: 'OTRO CLIENTE', normalHours: 10 });
    expect(typeof res.body.contractValue).toBe('number');
    expect(res.body.contractValue).toBe(999.99);
  });

  it.each(['machines', 'machineModelIds', 'soldDays'])(
    'PATCH con %s en el body → 400: son recursos aparte',
    async (campo) => {
      const p = await crearProyecto();
      const res = await http()
        .patch(`/api/projects/${p.id}`)
        .set(auth(tokenAdmin))
        .send({ clientName: 'Da igual', [campo]: [] })
        .expect(400);

      expect(res.body.message).toBe('RECURSO_APARTE');
    },
  );

  it('PATCH sin ningun campo reconocido → 400 (no mover updated_at por nada)', async () => {
    const p = await crearProyecto();
    await http().patch(`/api/projects/${p.id}`).set(auth(tokenAdmin)).send({}).expect(400);
  });

  it('PATCH y GET de un proyecto que no existe → 404, no 500', async () => {
    await http().get(`/api/projects/${FANTASMA}`).set(auth(tokenAdmin)).expect(404);
    await http()
      .patch(`/api/projects/${FANTASMA}`)
      .set(auth(tokenAdmin))
      .send({ clientName: 'Fantasma' })
      .expect(404);
  });

  // ── Desactivar, nunca borrar ──

  it('desactivar un proyecto lo deja en el listado con isActive false', async () => {
    const p = await crearProyecto({ name: 'Se desactiva' });

    await http()
      .patch(`/api/projects/${p.id}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: false })
      .expect(200);

    const fila = (await listar()).find((f: { id: string }) => f.id === p.id);
    expect(fila).toMatchObject({ name: 'Se desactiva', isActive: false });
  });

  it('no existe DELETE de proyectos → 404 y el proyecto sigue ahi', async () => {
    const p = await crearProyecto();

    await http().delete(`/api/projects/${p.id}`).set(auth(tokenSuper)).expect(404);

    expect(await ownerClient.project.count({ where: { id: p.id } })).toBe(1);
  });

  it('isActive que no es booleano → 400', async () => {
    const p = await crearProyecto();
    await http()
      .patch(`/api/projects/${p.id}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: 'no' })
      .expect(400);
  });

  // ── RBAC: proyectos y dias vendidos son cosa de A y S ──

  it('un Super Admin tambien crea proyectos', async () => {
    await crear({ ...ENCABEZADO, contractNumber: '345501' }, tokenSuper);
  });

  it.each([
    ['get', '/api/projects'],
    ['post', '/api/projects'],
    ['get', `/api/projects/${FANTASMA}`],
    ['patch', `/api/projects/${FANTASMA}`],
    ['patch', `/api/projects/${FANTASMA}/active`],
    ['put', `/api/projects/${FANTASMA}/machines`],
    ['put', `/api/projects/${FANTASMA}/sold-days`],
  ])('un Tecnico raso en %s %s → 403', async (metodo, ruta) => {
    await (http() as unknown as Record<string, (r: string) => request.Test>)
      [metodo](ruta)
      .set(auth(tokenTec))
      .send({})
      .expect(403);
  });
});
