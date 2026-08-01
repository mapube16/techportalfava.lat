/**
 * CAT-04: la matriz vendido / ejecutado / delta.
 *
 * Aqui se fija la convencion del delta PARA SIEMPRE: **delta = sold − executed**, la
 * del Excel (`Resoconto` fila 39: `20 | 332 | -312`). El prototipo
 * (`ProjectDetail.tsx:35`) hace `dn - s` y con eso pasarse de lo vendido saldria
 * positivo y verde — exactamente lo contrario de la decision bloqueada. La correccion
 * del frontend es de 02-06; el servidor es quien manda y quien tiene el test.
 *
 * Los dos casos que mas facil se cuelan verdes por accidente son el delta negativo y
 * la idempotencia, asi que van con valores concretos y, el de idempotencia, con un
 * control que demuestra que el test SI detecta una escritura.
 *
 * Que no exista ninguna columna `delta` ni `executed` en la base lo prueba
 * `no-free-text.e2e-spec.ts` por introspeccion (02-02); aqui se prueba que la API
 * tampoco las acepta.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { MAQ_TEST, ROL_TEST, TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearJornadaAprobada, crearOrden, crearProyecto, crearTecnico } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_ADMIN = 'oid-sold-admin';
const OID_TEC = 'oid-sold-tec';

/** Prefijo de los roles que crea esta suite: los catalogos NO se truncan (02-01). */
const PREFIJO = 'ZZ e2e sold-days';
const ROL_FANTASMA = '88888888-8888-4888-8888-888888888888';

interface Fila {
  roleTypeId: string;
  roleTypeName: string;
  roleTypeActive: boolean;
  phase: 'MONTAJE' | 'COLLAUDO' | null;
  sold: number;
  executed: number;
  delta: number;
}

describe('sold-days: matriz vendido/ejecutado/delta (CAT-04)', () => {
  let app: INestApplication;
  let tokenAdmin: string;
  let tokenTec: string;
  /** Un segundo rol activo y uno desactivado, propios de esta suite. */
  let rolB: { id: string; name: string };
  let rolOff: { id: string; name: string };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    [tokenAdmin, tokenTec] = await Promise.all([
      signTestToken({ oid: OID_ADMIN, email: 'admin@fava.local' }),
      signTestToken({ oid: OID_TEC, email: 'tec@fava.local' }),
    ]);
    await ownerClient.roleType.deleteMany({ where: { name: { startsWith: PREFIJO } } });
    rolB = await ownerClient.roleType.create({ data: { name: `${PREFIJO} B` } });
    rolOff = await ownerClient.roleType.create({
      data: { name: `${PREFIJO} desactivado`, isActive: false },
    });
  });

  afterAll(async () => {
    // Los catalogos no se truncan: sin esto la segunda pasada choca con el @unique.
    await ownerClient.roleType.deleteMany({ where: { name: { startsWith: PREFIJO } } });
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    await Promise.all([
      crearUsuario({ email: 'admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
  });

  const detalle = async (id: string) =>
    (await http().get(`/api/projects/${id}`).set(auth(tokenAdmin)).expect(200)).body;

  /**
   * Proyecto CON su orden. Desde la Fase 2.1 los dias vendidos cuelgan de la maquina
   * contratada, asi que un proyecto sin orden no tiene donde vender: cada test que
   * mide vendido/ejecutado necesita las dos cosas.
   */
  const proyectoConOrden = async () => {
    const p = await crearProyecto();
    const o = await crearOrden(p.id);
    return { p, o };
  };

  /** La matriz de la PRIMERA orden, que es la unica que crean estos tests. */
  const matrizDe = async (id: string): Promise<Fila[]> => (await detalle(id)).orders[0].matrix;

  const celda = (matrix: Fila[], roleTypeId: string, phase: Fila['phase']) =>
    matrix.find((f) => f.roleTypeId === roleTypeId && f.phase === phase) as Fila;

  const vender = (
    orderId: string,
    body: Record<string, unknown>,
    esperado = 200,
    token = tokenAdmin,
  ) =>
    http()
      .put(`/api/orders/${orderId}/sold-days`)
      .set(auth(token))
      .send(body)
      .expect(esperado);

  /** Jornada a medida: el fixture cerrado no permite `roleTypeId` nulo ni `draft`. */
  const jornada = (d: {
    technicianId: string;
    projectId: string;
    /** Sin orden la jornada cae en el bucket «sin orden», que se prueba aparte. */
    orderId?: string | null;
    date: Date;
    phase?: 'MONTAJE' | 'COLLAUDO' | null;
    roleTypeId?: string | null;
    status?: string;
  }) =>
    ownerClient.dailyEntry.create({
      data: {
        technicianId: d.technicianId,
        projectId: d.projectId,
        orderId: d.orderId ?? null,
        date: d.date,
        phase: d.phase ?? null,
        roleTypeId: d.roleTypeId ?? null,
        status: d.status ?? 'approved',
        conceptCode: 'DC',
        machineModelId: MAQ_TEST,
      },
    });

  // ── Las filas salen del catalogo, nunca de una lista cableada ──

  it('crear un rol en el catalogo anade sus dos filas a la matriz sin tocar codigo', async () => {
    const { p, o } = await proyectoConOrden();
    const antes = await matrizDe(p.id);

    const nuevo = await ownerClient.roleType.create({ data: { name: `${PREFIJO} recien creado` } });
    const despues = await matrizDe(p.id);

    expect(despues).toHaveLength(antes.length + 2);
    expect(despues.filter((f) => f.roleTypeId === nuevo.id).map((f) => f.phase)).toEqual([
      'MONTAJE',
      'COLLAUDO',
    ]);
  });

  it('hay exactamente una fila por rol ACTIVO x fase, y las vacias valen 0', async () => {
    const { p, o } = await proyectoConOrden();
    const activos = await ownerClient.roleType.count({ where: { isActive: true } });

    const matrix = await matrizDe(p.id);

    expect(matrix).toHaveLength(activos * 2);
    expect(celda(matrix, ROL_TEST, 'MONTAJE')).toMatchObject({ sold: 0, executed: 0, delta: 0 });
    expect(celda(matrix, rolB.id, 'COLLAUDO')).toMatchObject({
      roleTypeName: rolB.name,
      roleTypeActive: true,
      sold: 0,
      executed: 0,
      delta: 0,
    });
  });

  it('el contrato de la fila es el que consume ProjectDetail.tsx', async () => {
    const { p, o } = await proyectoConOrden();
    const [fila] = await matrizDe(p.id);

    expect(Object.keys(fila).sort()).toEqual([
      'delta',
      'executed',
      'phase',
      'roleTypeActive',
      'roleTypeId',
      'roleTypeName',
      'sold',
    ]);
  });

  it('el contrato del detalle es encabezado + ordenes con su matriz + lo no atribuido', async () => {
    const { p } = await proyectoConOrden();

    // Sin `oaNumber`, `contractValue` ni `currencyCode`: se fueron a la orden en la
    // Fase 2.1 porque JAV tiene tres importes distintos y J Macedo ninguno.
    expect(Object.keys(await detalle(p.id)).sort()).toEqual([
      'clientName',
      'clientNit',
      'contractNumber',
      'country',
      'id',
      'isActive',
      'locality',
      'name',
      'normalHours',
      'orders',
      'supply',
      'unassigned',
    ]);
  });

  it('un rol desactivado no aparece... salvo que tenga vendido, y entonces con roleTypeActive false', async () => {
    const { p, o } = await proyectoConOrden();

    expect(celda(await matrizDe(p.id), rolOff.id, 'MONTAJE')).toBeUndefined();

    await vender(o.id, { roleTypeId: rolOff.id, phase: 'MONTAJE', soldDays: 30 });

    // Si desapareciera, el total del proyecto cambiaria solo y el KPI se
    // descuadraria en silencio.
    expect(celda(await matrizDe(p.id), rolOff.id, 'MONTAJE')).toMatchObject({
      roleTypeActive: false,
      sold: 30,
      delta: 30,
    });
  });

  it('un rol desactivado con solo EJECUTADO tambien aparece', async () => {
    const { p, o } = await proyectoConOrden();
    const tec = await crearTecnico({ roleTypeId: rolOff.id });
    await jornada({
      technicianId: tec.id,
      projectId: p.id,
      orderId: o.id,
      date: new Date('2026-03-09T00:00:00Z'),
      phase: 'COLLAUDO',
      roleTypeId: rolOff.id,
    });

    expect(celda(await matrizDe(p.id), rolOff.id, 'COLLAUDO')).toMatchObject({
      roleTypeActive: false,
      sold: 0,
      executed: 1,
      delta: -1,
    });
  });

  // ── El delta: sold − executed, en el servidor ──

  it('PUT de una celda → 200 y el GET devuelve sold', async () => {
    const { p, o } = await proyectoConOrden();

    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 });

    expect(celda(await matrizDe(p.id), ROL_TEST, 'MONTAJE')).toMatchObject({
      sold: 10,
      executed: 0,
      delta: 10,
    });
  });

  it('con sold 10 y UNA jornada aprobada de ese rol y fase: executed 1, delta 9', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 });
    await crearJornadaAprobada({
      technicianId: TEC_A,
      projectId: p.id,
      orderId: o.id,
      roleTypeId: ROL_TEST,
      phase: 'MONTAJE',
      date: new Date('2026-03-02T00:00:00Z'),
    });

    expect(celda(await matrizDe(p.id), ROL_TEST, 'MONTAJE')).toMatchObject({
      sold: 10,
      executed: 1,
      delta: 9,
    });
  });

  it('con sold 0 y esa misma jornada el delta sale NEGATIVO: -1 (no +1)', async () => {
    const { p, o } = await proyectoConOrden();
    await crearJornadaAprobada({
      technicianId: TEC_A,
      projectId: p.id,
      orderId: o.id,
      roleTypeId: ROL_TEST,
      phase: 'MONTAJE',
      date: new Date('2026-03-02T00:00:00Z'),
    });

    const fila = celda(await matrizDe(p.id), ROL_TEST, 'MONTAJE');
    expect(fila).toMatchObject({ sold: 0, executed: 1, delta: -1 });
    // La asercion que descarta la convencion invertida del prototipo (`dn - s`).
    expect(fila.delta).not.toBe(1);
  });

  it('bajar sold por debajo de executed esta PERMITIDO: 1 vendido, 3 ejecutados → -2', async () => {
    const { p, o } = await proyectoConOrden();
    const tecC = await crearTecnico();
    for (const [i, tec] of [TEC_A, TEC_B, tecC.id].entries()) {
      await crearJornadaAprobada({
        technicianId: tec,
        projectId: p.id,
      orderId: o.id,
        roleTypeId: ROL_TEST,
        phase: 'COLLAUDO',
        date: new Date(`2026-03-0${i + 1}T00:00:00Z`),
      });
    }

    // Nada de CHECK (sold >= executed): el negativo es un hecho real del negocio.
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'COLLAUDO', soldDays: 1 });

    expect(celda(await matrizDe(p.id), ROL_TEST, 'COLLAUDO')).toMatchObject({
      sold: 1,
      executed: 3,
      delta: -2,
    });
  });

  // ── Nada de campos calculados en el body ──

  it.each(['delta', 'executed'])('un body con %s → 400 CAMPO_CALCULADO_NO_ADMITIDO', async (campo) => {
    const { p, o } = await proyectoConOrden();
    const res = await vender(o.id, {
      roleTypeId: ROL_TEST,
      phase: 'MONTAJE',
      soldDays: 5,
      [campo]: 3,
    }, 400);

    expect(res.body.message).toBe('CAMPO_CALCULADO_NO_ADMITIDO');
    // Y no se ha escrito nada de paso.
    expect(await ownerClient.orderSoldDays.count({ where: { orderId: o.id } })).toBe(0);
  });

  it.each([
    ['negativo', -1],
    ['no entero', 2.5],
    ['mayor que 9999', 10_000],
    ['un string', '10'],
    ['nulo', null],
  ])('soldDays %s → 400', async (_caso, soldDays) => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays }, 400);
  });

  it('una phase fuera del enum → 400 (nada de texto libre)', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAGGIO', soldDays: 5 }, 400);
  });

  it('un roleTypeId inexistente → 400, nunca un 500 de FK', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_FANTASMA, phase: 'MONTAJE', soldDays: 5 }, 400);
  });

  it('un roleTypeId que no es UUID → 400', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: 'no-soy-uuid', phase: 'MONTAJE', soldDays: 5 }, 400);
  });

  // ── Idempotencia: no envenenar el audit_log que llega en la Fase 4 ──

  it('el segundo PUT con el MISMO valor no escribe: updated_at no se mueve', async () => {
    const { p, o } = await proyectoConOrden();
    const leer = async () =>
      ownerClient.orderSoldDays.findFirstOrThrow({ where: { orderId: o.id } });

    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 });
    const primera = await leer();

    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 });
    const segunda = await leer();
    expect(segunda.updatedAt).toEqual(primera.updatedAt);

    // Control: sin esto, la asercion de arriba podria pasar por resolucion del
    // reloj y no porque no se escriba. Un valor distinto SI mueve updated_at.
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 11 });
    const tercera = await leer();
    expect(tercera.soldDays).toBe(11);
    expect(tercera.updatedAt.getTime()).toBeGreaterThan(primera.updatedAt.getTime());
  });

  it('el PUT es un valor absoluto sobre la clave natural: una sola fila por celda', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 4 });
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 7 });

    expect(await ownerClient.orderSoldDays.count({ where: { orderId: o.id } })).toBe(1);
    expect(celda(await matrizDe(p.id), ROL_TEST, 'MONTAJE').sold).toBe(7);
  });

  // ── La agregacion de ejecutados ──

  it('las jornadas con phase NULL aparecen en un bucket «sin fase», no se pierden', async () => {
    const { p, o } = await proyectoConOrden();
    // Todo el historico del Excel entra asi: las hojas diarias no traen fase.
    await crearJornadaAprobada({
      technicianId: TEC_A,
      projectId: p.id,
      orderId: o.id,
      roleTypeId: ROL_TEST,
      phase: null,
      date: new Date('2026-03-02T00:00:00Z'),
    });

    const matrix = await matrizDe(p.id);
    expect(celda(matrix, ROL_TEST, null)).toMatchObject({ sold: 0, executed: 1, delta: -1 });
    // Y no se han colado en ninguna de las dos fases con nombre.
    expect(celda(matrix, ROL_TEST, 'MONTAJE').executed).toBe(0);
    expect(celda(matrix, ROL_TEST, 'COLLAUDO').executed).toBe(0);
  });

  it('una jornada en draft no mueve executed (solo cuentan las aprobadas, como KPI-01)', async () => {
    const { p, o } = await proyectoConOrden();
    await jornada({
      technicianId: TEC_A,
      projectId: p.id,
      orderId: o.id,
      date: new Date('2026-03-02T00:00:00Z'),
      phase: 'MONTAJE',
      roleTypeId: ROL_TEST,
      status: 'draft',
    });

    expect(celda(await matrizDe(p.id), ROL_TEST, 'MONTAJE').executed).toBe(0);
  });

  it('una jornada con role_type_id NULL cuenta bajo el rol del maestro del tecnico (COALESCE)', async () => {
    const { p, o } = await proyectoConOrden();
    const tec = await crearTecnico({ roleTypeId: rolB.id });
    await jornada({
      technicianId: tec.id,
      projectId: p.id,
      orderId: o.id,
      date: new Date('2026-03-02T00:00:00Z'),
      phase: 'MONTAJE',
      roleTypeId: null,
    });

    const matrix = await matrizDe(p.id);
    expect(celda(matrix, rolB.id, 'MONTAJE').executed).toBe(1);
    expect(celda(matrix, ROL_TEST, 'MONTAJE').executed).toBe(0);
  });

  it('el rol de la JORNADA manda sobre el del maestro', async () => {
    const { p, o } = await proyectoConOrden();
    // Ivan Cortes cuenta como Software unos dias y como Capo Elettricista otros.
    const tec = await crearTecnico({ roleTypeId: ROL_TEST });
    await jornada({
      technicianId: tec.id,
      projectId: p.id,
      orderId: o.id,
      date: new Date('2026-03-02T00:00:00Z'),
      phase: 'MONTAJE',
      roleTypeId: rolB.id,
    });

    const matrix = await matrizDe(p.id);
    expect(celda(matrix, rolB.id, 'MONTAJE').executed).toBe(1);
    expect(celda(matrix, ROL_TEST, 'MONTAJE').executed).toBe(0);
  });

  it('la matriz no cuenta las jornadas de otro proyecto ni las de ninguno', async () => {
    const { p } = await proyectoConOrden();
    const otro = await crearProyecto();
    const ordenOtra = await crearOrden(otro.id);
    await crearJornadaAprobada({
      technicianId: TEC_A,
      projectId: otro.id,
      orderId: ordenOtra.id,
      roleTypeId: ROL_TEST,
      phase: 'MONTAJE',
      date: new Date('2026-03-02T00:00:00Z'),
    });
    // Sin proyecto (BIT-03: `project_id` es nullable, sin centinelas).
    await crearJornadaAprobada({
      technicianId: TEC_B,
      projectId: undefined,
      roleTypeId: ROL_TEST,
      phase: 'MONTAJE',
      date: new Date('2026-03-02T00:00:00Z'),
    });

    expect(celda(await matrizDe(p.id), ROL_TEST, 'MONTAJE').executed).toBe(0);
    expect(celda(await matrizDe(otro.id), ROL_TEST, 'MONTAJE').executed).toBe(1);
  });

  // ── El bucket «sin orden»: el estado en el que entra TODO el historico del Excel ──

  it('una jornada aprobada SIN orden no se pierde ni se reparte: sale en unassigned', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 });
    // Es el caso real de JAV: 536 jornadas y cero dicen a que maquina fueron.
    await jornada({
      technicianId: TEC_A,
      projectId: p.id,
      orderId: null,
      phase: 'MONTAJE',
      roleTypeId: ROL_TEST,
      date: new Date('2026-03-02T00:00:00Z'),
    });

    const d = await detalle(p.id);
    // NO se atribuye a la unica orden del proyecto: adivinar el reparto es justo el
    // trabajo manual que la app existe para eliminar.
    expect(celda(d.orders[0].matrix, ROL_TEST, 'MONTAJE')).toMatchObject({
      sold: 10,
      executed: 0,
      delta: 10,
    });
    expect(d.unassigned).toEqual([
      { roleTypeId: ROL_TEST, roleTypeName: expect.any(String), phase: 'MONTAJE', executed: 1 },
    ]);
  });

  it('un proyecto sin jornadas huerfanas trae unassigned vacio, no ausente', async () => {
    const { p, o } = await proyectoConOrden();
    await jornada({
      technicianId: TEC_A,
      projectId: p.id,
      orderId: o.id,
      phase: 'MONTAJE',
      roleTypeId: ROL_TEST,
      date: new Date('2026-03-03T00:00:00Z'),
    });

    expect((await detalle(p.id)).unassigned).toEqual([]);
  });

  it('los dias vendidos son de A y S: un tecnico raso → 403', async () => {
    const { p, o } = await proyectoConOrden();
    await vender(o.id, { roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 5 }, 403, tokenTec);
  });
});
