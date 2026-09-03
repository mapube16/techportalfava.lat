/**
 * «Mi resumen» — los KPIs OPERATIVOS del propio tecnico (`GET /api/me/kpis`).
 *
 * Lo que se prueba aqui es lo que puede romperse EN SILENCIO, que es la unica razon
 * para escribir un test de una pantalla de solo lectura:
 *
 *  1. El AISLAMIENTO. Es lo unico con consecuencia grave: si la consulta se deja el
 *     `technician_id`, un tecnico ve la operacion de sus companeros y nadie se entera
 *     —los numeros siguen pareciendo plausibles—. Se comprueba ademas con una cuenta
 *     ADMIN+TECNICO, que es el caso que rompe el aislamiento por RLS: lleva
 *     `app.is_admin = 'on'` y la politica la deja leerlo todo, asi que el filtro
 *     explicito del servicio es lo unico que la contiene.
 *  2. El CONTEO POR MAQUINA con varias maquinas el mismo dia (BIT-10). Contar solo
 *     `order_id` repetiria el problema que BIT-10 vino a resolver, y el sintoma seria
 *     un numero mas bajo de lo real: creible, y por eso invisible.
 *  3. Que NO se filtre nada comercial. El contrato de la respuesta es la frontera.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ventana } from '../src/modules/daily-entries/fecha';
import { createTestApp, crearUsuario } from './helpers/app';
import { TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearOrden, crearProyecto } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_A = 'oid-miskpis-a';
const OID_B = 'oid-miskpis-b';
const OID_ADMIN = 'oid-miskpis-admin';

const { min: MIN } = ventana();
/** Tres dias consecutivos dentro de la ventana del servidor. */
const dia = (n: number) => new Date(Date.parse(MIN) + (10 + n) * 86_400_000).toISOString().slice(0, 10);
const ANIO = Number(dia(0).slice(0, 4));

describe('mis KPIs (Mi resumen)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;
  let proyectoId: string;
  let ordenUno: string;
  let ordenDos: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const mios = (token: string, year?: number) =>
    http()
      .get(`/api/me/kpis${year ? `?year=${year}` : ''}`)
      .set(auth(token));

  beforeAll(async () => {
    app = await createTestApp();
    [tokenA, tokenB, tokenAdmin] = await Promise.all([
      signTestToken({ oid: OID_A, email: 'miskpis-a@fava.local' }),
      signTestToken({ oid: OID_B, email: 'miskpis-b@fava.local' }),
      signTestToken({ oid: OID_ADMIN, email: 'miskpis-admin@fava.local' }),
    ]);
  });

  afterAll(async () => {
    await app.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();

    const proyecto = await crearProyecto({ name: 'Obra Mi Resumen', clientName: 'Cliente MR' });
    proyectoId = proyecto.id;
    const [o1, o2] = await Promise.all([
      crearOrden(proyectoId, { label: 'PL 6000 KG - A', commessaShort: '3428' }),
      crearOrden(proyectoId, { label: 'CTA 1000 - B', commessaShort: '3512' }),
    ]);
    ordenUno = o1.id;
    ordenDos = o2.id;

    await Promise.all([
      crearUsuario({ email: 'miskpis-a@fava.local', entraOid: OID_A, roles: ['T'], technicianId: TEC_A }),
      crearUsuario({ email: 'miskpis-b@fava.local', entraOid: OID_B, roles: ['T'], technicianId: TEC_B }),
      // La cuenta peligrosa: es tecnico Y admin, como la del seed. RLS la deja leerlo
      // todo, asi que aqui es el filtro del servicio el que tiene que sujetarla.
      crearUsuario({
        email: 'miskpis-admin@fava.local',
        entraOid: OID_ADMIN,
        roles: ['T', 'A'],
        technicianId: TEC_A,
      }),
    ]);
  });

  /** Siembra directa: la bitacora del test no es el sujeto, lo es la agregacion. */
  const sembrarDia = async (
    technicianId: string,
    fecha: string,
    orderId: string | null,
    extras: string[] = [],
  ) => {
    const entry = await ownerClient.dailyEntry.create({
      data: {
        technicianId,
        date: new Date(`${fecha}T00:00:00Z`),
        projectId: orderId ? proyectoId : null,
        orderId,
        conceptCode: orderId ? 'DC' : 'LR',
        description: 'Montaje bancada',
        status: 'approved',
      },
    });
    for (const extra of extras)
      await ownerClient.dailyEntryOrder.create({
        data: { dailyEntryId: entry.id, orderId: extra },
      });
    return entry;
  };

  it('cuenta los dias de CADA maquina del dia, no solo la principal (BIT-10)', async () => {
    // Un dia con DOS maquinas y otro con una sola. La primera suma 2, la segunda 1.
    await sembrarDia(TEC_A, dia(0), ordenUno, [ordenDos]);
    await sembrarDia(TEC_A, dia(1), ordenUno);

    const res = await mios(tokenA).expect(200);

    const porOrden = new Map<string, number>(
      res.body.machines.map((m: { orderId: string; days: number }) => [m.orderId, m.days]),
    );
    expect(porOrden.get(ordenUno)).toBe(2);
    // La que solo aparecio como ADICIONAL tambien cuenta su dia: sin el UNION ALL
    // esta maquina no saldria en la lista.
    expect(porOrden.get(ordenDos)).toBe(1);
    expect(res.body.machineCount).toBe(2);
  });

  it('el total de dias sale de los CONCEPTOS: incluye la jornada sin proyecto', async () => {
    await sembrarDia(TEC_A, dia(0), ordenUno);
    // Un libre remunerado: sin proyecto ni maquina. Es el 63% de las filas del Excel,
    // y contando por maquina desapareceria del total.
    await sembrarDia(TEC_A, dia(1), null);

    const res = await mios(tokenA).expect(200);

    expect(res.body.totalDays).toBe(2);
    expect(res.body.machineCount).toBe(1);
    expect(res.body.projectCount).toBe(1);
  });

  it('NO ve la operacion de otro tecnico', async () => {
    await sembrarDia(TEC_A, dia(0), ordenUno);
    await sembrarDia(TEC_B, dia(0), ordenDos);
    await sembrarDia(TEC_B, dia(1), ordenDos);

    const res = await mios(tokenA).expect(200);

    expect(res.body.totalDays).toBe(1);
    const ordenes = res.body.machines.map((m: { orderId: string }) => m.orderId);
    expect(ordenes).toEqual([ordenUno]);
  });

  it('una cuenta ADMIN+TECNICO sigue viendo SOLO lo suyo', async () => {
    // El caso que RLS no sujeta: `is_admin = 'on'` deja leer la bitacora entera.
    await sembrarDia(TEC_A, dia(0), ordenUno);
    await sembrarDia(TEC_B, dia(0), ordenDos);
    await sembrarDia(TEC_B, dia(1), ordenDos);

    const res = await mios(tokenAdmin).expect(200);

    // Su ficha es TEC_A: un solo dia, no los tres de la casa.
    expect(res.body.totalDays).toBe(1);
    expect(res.body.machines.map((m: { orderId: string }) => m.orderId)).toEqual([ordenUno]);
  });

  it('no devuelve NADA comercial', async () => {
    await sembrarDia(TEC_A, dia(0), ordenUno);

    const res = await mios(tokenA).expect(200);

    const texto = JSON.stringify(res.body);
    for (const prohibido of ['contractValue', 'normalHours', 'soldDays', 'currencyCode'])
      expect(texto).not.toContain(prohibido);
    // Y ningun nombre de otro tecnico: la respuesta no habla de personas.
    expect(texto).not.toContain('Tecnico B');
  });

  it('filtra por anio y ofrece los anios QUE TIENE', async () => {
    await sembrarDia(TEC_A, dia(0), ordenUno);

    const res = await mios(tokenA, ANIO).expect(200);
    expect(res.body.year).toBe(ANIO);
    expect(res.body.totalDays).toBe(1);
    expect(res.body.years).toContain(ANIO);

    // Un anio sin jornadas responde vacio, no 404: la pantalla lo dice con su propio
    // texto en vez de tratarlo como un error.
    const vacio = await mios(tokenA, 2001).expect(200);
    expect(vacio.body.totalDays).toBe(0);
    expect(vacio.body.machines).toEqual([]);
  });

  it('rechaza un anio con basura', async () => {
    await http().get('/api/me/kpis?year=abc').set(auth(tokenA)).expect(400);
  });

  it('exige autenticacion', async () => {
    await http().get('/api/me/kpis').expect(401);
  });
});
