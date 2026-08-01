/**
 * KPI-07 — la cuadrícula de días por concepto.
 *
 * Los números de este archivo NO son inventados: son los del screenshot de la tabla
 * dinámica que mantiene Andrea (JAV Marata 2026: DC 439, DFD 73, DVRC 8, DVSF 16,
 * total 536, repartidos 75 / 151 / 132 / 91 / 87 entre cinco técnicos). Se reproducen
 * aquí con fixtures para que el día que alguien toque la agregación se entere de que
 * dejó de cuadrar con la fuente.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { ROL_TEST, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearProyecto, crearTecnico } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_ADMIN = 'oid-kpis-admin';
const OID_TEC = 'oid-kpis-tec';

describe('kpis: cuadrícula de días por concepto (KPI-07)', () => {
  let app: INestApplication;
  let tokenAdmin: string;
  let tokenTec: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    [tokenAdmin, tokenTec] = await Promise.all([
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
      crearUsuario({ email: 'admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
  });

  const grid = async (year?: number, token = tokenAdmin) =>
    (
      await http()
        .get(`/api/kpis/day-grid${year ? `?year=${year}` : ''}`)
        .set(auth(token))
        .expect(200)
    ).body;

  /** Siembra `n` jornadas aprobadas consecutivas desde `desde`, del mismo concepto. */
  const jornadas = async (d: {
    technicianId: string;
    projectId: string | null;
    conceptCode: string;
    desde: string;
    n: number;
  }) => {
    const base = new Date(`${d.desde}T00:00:00Z`);
    const filas = Array.from({ length: d.n }, (_, i) => ({
      technicianId: d.technicianId,
      projectId: d.projectId,
      conceptCode: d.conceptCode as never,
      // UTC, como la migración: `new Date(a, m-1, dia)` desplaza el DATE un día en
      // media Europa y el bug no se ve desde Bogotá.
      date: new Date(base.getTime() + i * 86_400_000),
      status: 'approved',
      roleTypeId: ROL_TEST,
    }));
    await ownerClient.dailyEntry.createMany({ data: filas });
  };

  it('agrupa proyecto → técnico → mes y suma los totales en los tres niveles', async () => {
    const p = await crearProyecto({ name: 'JAV Marata - Brasil' });
    const tec = await crearTecnico({ fullName: 'Andrea Scapin' });
    // 3 días de enero y 2 de febrero: los meses tienen que salir separados.
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2026-01-10', n: 3 });
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2026-02-10', n: 2 });

    const g = await grid(2026);
    const proy = g.projects.find((x: { projectName: string }) => x.projectName === 'JAV Marata - Brasil');

    expect(proy.total).toBe(5);
    expect(proy.counts).toEqual({ DC: 5 });
    expect(proy.technicians).toHaveLength(1);
    expect(proy.technicians[0]).toMatchObject({ technicianName: 'Andrea Scapin', total: 5 });
    expect(proy.technicians[0].months.map((m: { month: number; total: number }) => [m.month, m.total])).toEqual([
      [1, 3],
      [2, 2],
    ]);
    expect(g.total).toBe(5);
  });

  it('los cuatro conceptos de JAV dan 439/73/8/16 y el total 536, como la hoja', async () => {
    const p = await crearProyecto({ name: 'JAV Marata - Brasil' });
    const tec = await crearTecnico({ fullName: 'Camilo Cruz' });
    // Fechas separadas por concepto: @@unique(técnico, fecha) impide solaparlas.
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2025-01-01', n: 439 });
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DFD', desde: '2026-04-01', n: 73 });
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DVRC', desde: '2026-07-01', n: 8 });
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DVSF', desde: '2026-08-01', n: 16 });

    const g = await grid();
    const proy = g.projects.find((x: { projectName: string }) => x.projectName === 'JAV Marata - Brasil');

    expect(proy.counts).toEqual({ DC: 439, DFD: 73, DVRC: 8, DVSF: 16 });
    expect(proy.total).toBe(536);
  });

  it('las jornadas SIN proyecto salen como «Sin Proyecto» y al final, no se descartan', async () => {
    const p = await crearProyecto({ name: 'AAA primera por nombre' });
    const tec = await crearTecnico({ fullName: 'Ivan Cortes' });
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2026-01-01', n: 2 });
    // 63% del Excel son días sin proyecto (libres y no remunerados): esconderlos
    // falsearía el total de días de la persona.
    await jornadas({ technicianId: tec.id, projectId: null, conceptCode: 'LR', desde: '2026-03-01', n: 5 });

    const g = await grid(2026);
    expect(g.projects.map((x: { projectName: string }) => x.projectName)).toEqual([
      'AAA primera por nombre',
      'Sin Proyecto',
    ]);
    expect(g.projects[1].projectId).toBeNull();
    expect(g.total).toBe(7);
  });

  it('un borrador NO cuenta: sólo lo aprobado es un día ejecutado', async () => {
    const p = await crearProyecto();
    const tec = await crearTecnico();
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2026-01-01', n: 3 });
    await ownerClient.dailyEntry.create({
      data: {
        technicianId: tec.id,
        projectId: p.id,
        date: new Date(Date.UTC(2026, 5, 1)),
        conceptCode: 'DC',
        status: 'draft',
        roleTypeId: ROL_TEST,
      },
    });

    expect((await grid(2026)).total).toBe(3);
  });

  it('el filtro de año separa 2025 de 2026, y sin año van los dos juntos', async () => {
    const p = await crearProyecto();
    const tec = await crearTecnico();
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2025-06-01', n: 4 });
    await jornadas({ technicianId: tec.id, projectId: p.id, conceptCode: 'DC', desde: '2026-06-01', n: 6 });

    expect((await grid(2025)).total).toBe(4);
    expect((await grid(2026)).total).toBe(6);
    expect((await grid()).total).toBe(10);
    expect((await http().get('/api/kpis/years').set(auth(tokenAdmin)).expect(200)).body).toEqual([2026, 2025]);
  });

  it('un año que no es un año → 400, no un 500 ni una cuadrícula vacía', async () => {
    const res = await http().get('/api/kpis/day-grid?year=ayer').set(auth(tokenAdmin)).expect(400);
    expect(res.body.message).toBe('ANIO_INVALIDO');
  });

  it.each([
    ['get', '/api/kpis/day-grid'],
    ['get', '/api/kpis/years'],
  ])('un Técnico raso en %s %s → 403: el tablero es de Admin', async (metodo, ruta) => {
    await (http() as unknown as Record<string, (r: string) => request.Test>)
      [metodo](ruta)
      .set(auth(tokenTec))
      .expect(403);
  });
});
