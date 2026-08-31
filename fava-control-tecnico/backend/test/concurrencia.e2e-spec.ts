/**
 * Varios usuarios a la vez, POR HTTP.
 *
 * Ya existe `rls-transaction.e2e-spec.ts` y prueba lo mismo mucho mas a fondo — pero
 * por DENTRO: llama a los servicios simulando la peticion. Esta entra por donde entra
 * una persona: HTTP, guard de Entra, interceptor de RLS, servicio, Postgres. La capa
 * de autenticacion y el enrutado quedaban fuera de aquella, y son justo donde vive el
 * fallo que mas asusta de un pool compartido: que la peticion de Ana acabe leyendo la
 * conexion que dejo caliente la de Bruno, con su `app.technician_id` dentro.
 *
 * QUE SE COMPRUEBA, y por que cada cosa:
 *
 *   1. Nadie ve datos ajenos bajo contencion. Es el unico fallo de esta lista que no
 *      se nota: no rompe nada, solo enseña la bitacora de otro.
 *   2. Cero 500 y cero P2028. El pool son 10 conexiones y la transaccion-por-peticion
 *      retiene una entera; con 40 peticiones simultaneas, 30 esperan. Si el timeout de
 *      10 s se quedara corto, esto se pondria rojo.
 *   3. Un admin y varios tecnicos mezclados. El admin NO esta acotado por RLS
 *      (`app.is_admin`), asi que su peticion es la que podria contaminar a las demas
 *      si el contexto se filtrara entre conexiones.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { ROL_TEST, TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearProyecto } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_A = '0a0a0a0a-0000-4000-8000-00000000000a';
const OID_B = '0b0b0b0b-0000-4000-8000-00000000000b';
const OID_ADMIN = '0c0c0c0c-0000-4000-8000-00000000000c';

/** 40 a la vez sobre un pool de 10: tres cuartas partes esperan conexion a proposito. */
const SIMULTANEAS = 40;

describe('concurrencia: varios usuarios a la vez, por HTTP', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await createTestApp();
    // El servidor escucha UNA vez. Sin esto supertest abre un listener por peticion y
    // las 40 salen escalonadas: llegarian de una en una y no habria concurrencia que
    // medir. Mismo motivo que en daily-entries.e2e-spec.ts.
    await new Promise<void>((listo) => {
      (app.getHttpServer() as { listen: (p: number, cb: () => void) => void }).listen(0, listo);
    });

    [tokenA, tokenB, tokenAdmin] = await Promise.all([
      signTestToken({ oid: OID_A, email: 'conc-a@fava.local' }),
      signTestToken({ oid: OID_B, email: 'conc-b@fava.local' }),
      signTestToken({ oid: OID_ADMIN, email: 'conc-admin@fava.local' }),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    await Promise.all([
      crearUsuario({ email: 'conc-a@fava.local', entraOid: OID_A, roles: ['T'], technicianId: TEC_A }),
      crearUsuario({ email: 'conc-b@fava.local', entraOid: OID_B, roles: ['T'], technicianId: TEC_B }),
      crearUsuario({ email: 'conc-admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
    ]);

    const p = await crearProyecto({ name: 'Concurrencia' });
    // Cantidades DISTINTAS a proposito: si una peticion de A viera las filas de B, el
    // conteo lo delata sin tener que comparar fila por fila.
    await ownerClient.dailyEntry.createMany({
      data: [
        ...Array.from({ length: 3 }, (_, i) => ({
          technicianId: TEC_A,
          projectId: p.id,
          date: new Date(`2026-03-0${i + 2}T00:00:00Z`),
          conceptCode: 'DC' as const,
          status: 'draft' as const,
          roleTypeId: ROL_TEST,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          technicianId: TEC_B,
          projectId: p.id,
          date: new Date(`2026-03-0${i + 2}T00:00:00Z`),
          conceptCode: 'DC' as const,
          status: 'draft' as const,
          roleTypeId: ROL_TEST,
        })),
      ],
    });
  });

  it(
    'bajo contencion de pool nadie ve la bitácora de otro, y ninguna petición revienta',
    async () => {
      const semana = '?from=2026-03-02&to=2026-03-08';
      const esperado = { [tokenA]: 3, [tokenB]: 5 };

      const peticiones = Array.from({ length: SIMULTANEAS }, (_, i) => {
        // Un admin cada cuatro: es el que NO esta acotado por RLS, o sea el que podria
        // contaminar a los demas si el contexto sobreviviera al release() del pool.
        if (i % 4 === 3) {
          return http()
            .get('/api/weekly-notes')
            .set(auth(tokenAdmin))
            // `esperado: -1` para que las tres ramas tengan la misma forma: sin él
            // TypeScript infiere una union y el filtro de abajo no puede leer el campo.
            .then((r) => ({ quien: 'admin', status: r.status, n: -1, esperado: -1 }));
        }
        const t = i % 2 === 0 ? tokenA : tokenB;
        return http()
          .get(`/api/daily-entries${semana}`)
          .set(auth(t))
          .then((r) => ({
            quien: t === tokenA ? 'A' : 'B',
            status: r.status,
            // La semana llega como { entries, minDate, maxDate }, no como un array.
            n: Array.isArray(r.body?.entries) ? r.body.entries.length : -99,
            esperado: esperado[t],
          }));
      });

      const r = await Promise.all(peticiones);

      // 2. Ni un 500, ni un timeout de pool.
      expect(r.filter((x) => x.status !== 200)).toEqual([]);

      // 1. Y cada técnico vio EXACTAMENTE lo suyo. Un solo conteo distinto significa
      //    que una conexión del pool arrastró el contexto de la petición anterior.
      const contaminadas = r.filter((x) => x.quien !== 'admin' && x.n !== x.esperado);
      expect(contaminadas).toEqual([]);
    },
    60_000,
  );

  it(
    'escribir a la vez tampoco mezcla: cada uno escribe en SU bitácora',
    async () => {
      // La lectura concurrente puede pasar por casualidad si el pool no rota. Escribir
      // fuerza una transaccion de verdad por peticion y retiene la conexion mas rato.
      const cuerpo = (dia: number) => ({
        projectId: null,
        orderId: null,
        // NR y no LR: la mitad de las peticiones son de TEC_B, que es EXTERNO, y el
        // LR se le rechaza por regla de negocio (BIT-09) — aqui el sujeto es el pool,
        // no esa regla, asi que el relleno usa el concepto que vale para los dos.
        conceptCode: 'NR',
        phase: null,
        description: `concurrente ${dia}`,
      });

      const peticiones = Array.from({ length: 20 }, (_, i) => {
        const esA = i % 2 === 0;
        // Dias distintos por tecnico para que no compitan por la misma fila: lo que se
        // prueba aqui es el aislamiento entre usuarios, no el upsert de una jornada.
        const dia = 10 + Math.floor(i / 2);
        return http()
          .put(`/api/daily-entries/2026-03-${dia}`)
          .set(auth(esA ? tokenA : tokenB))
          .send(cuerpo(dia))
          .then((r) => ({ esA, status: r.status }));
      });

      const r = await Promise.all(peticiones);
      expect(r.filter((x) => x.status !== 200 && x.status !== 201)).toEqual([]);

      // Ni una sola jornada acabó bajo el técnico equivocado.
      const deA = await ownerClient.dailyEntry.count({
        where: { technicianId: TEC_A, description: { startsWith: 'concurrente' } },
      });
      const deB = await ownerClient.dailyEntry.count({
        where: { technicianId: TEC_B, description: { startsWith: 'concurrente' } },
      });
      expect(deA).toBe(10);
      expect(deB).toBe(10);
    },
    60_000,
  );
});
