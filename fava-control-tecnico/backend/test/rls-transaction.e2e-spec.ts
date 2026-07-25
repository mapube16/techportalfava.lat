/**
 * Criterio 5 del roadmap: el prototipo que STATE.md exige ANTES de que las Fases 3-4
 * construyan encima. Prisma 7 + RLS + $transaction() interactivo es una tension
 * documentada por Prisma; aqui se mide, no se supone.
 *
 * Lo que se ejercita es el codigo real, no una imitacion: `new PrismaService()` (pool
 * max 10, transactionOptions 10s/5s) y `RlsInterceptor` invocado con un ExecutionContext
 * minimo. Los "servicios" solo llaman a `prisma.client` y reciben el tx de su peticion
 * sin saber que existe.
 *
 * Si esto falla, NO se sube el timeout: se documenta que combinacion falla.
 */
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RlsInterceptor } from '../src/common/prisma/rls.interceptor';
import { TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';

const prisma = new PrismaService();
const interceptor = new RlsInterceptor(prisma);

const USUARIOS = {
  A: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', technicianId: TEC_A, roles: ['T'] },
  B: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', technicianId: TEC_B, roles: ['T'] },
} as const;

type Usuario = (typeof USUARIOS)[keyof typeof USUARIOS] | null;

/** Una peticion HTTP autenticada, reducida a lo que el interceptor mira. */
function comoPeticion<T>(user: Usuario, handler: () => Promise<T>): Promise<T> {
  const ctx = {
    switchToHttp: () => ({ getRequest: () => (user ? { user } : {}) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => from(handler()) };
  return lastValueFrom(interceptor.intercept(ctx, next)) as Promise<T>;
}

const SEMANA = new Date(Date.UTC(2026, 0, 5));
const DIAS = [5, 6, 7, 8, 9, 10, 11].map((n) => new Date(Date.UTC(2026, 0, n)));

/**
 * La transicion multi-tabla de la Fase 4 (approve toca nota + 7 entradas + auditoria),
 * en su forma minima: dos tablas y una lectura de verificacion, todo en la tx de la
 * peticion. El sufijo por tecnico deja rastro de quien escribio cada fila.
 */
async function transicion(technicianId: string, estado: string) {
  const db = prisma.client;

  // findFirstOrThrow sin where: RLS ya garantiza que la unica nota visible es la suya.
  // Ademas serializa las tx del mismo tecnico en la fila de la nota (raiz del agregado),
  // que es justo lo que hara el approve de la Fase 4.
  const propia = await db.weeklyNote.findFirstOrThrow();
  const nota = await db.weeklyNote.update({
    where: { id: propia.id },
    data: { status: estado },
  });
  const { count } = await db.dailyEntry.updateMany({
    where: { date: { in: DIAS } },
    data: { status: estado },
  });

  // Lectura de verificacion DENTRO de la tx: si el contexto RLS se hubiera filtrado
  // desde otra conexion del pool, `ajenas` seria > 0 y esta peticion fallaria.
  const vistas = await db.dailyEntry.findMany();

  return {
    estado: nota.status,
    actualizadas: count,
    propias: vistas.filter((e) => e.technicianId === technicianId).length,
    ajenas: vistas.filter((e) => e.technicianId !== technicianId).length,
  };
}

async function sembrar(): Promise<void> {
  await truncateAll();
  await ownerClient.weeklyNote.createMany({
    data: [
      { technicianId: TEC_A, weekStart: SEMANA },
      { technicianId: TEC_B, weekStart: SEMANA },
    ],
  });
  await ownerClient.dailyEntry.createMany({
    data: [TEC_A, TEC_B].flatMap((technicianId) => DIAS.map((date) => ({ technicianId, date }))),
  });
}

describe('RLS + $transaction: transicion multi-tabla y concurrencia', () => {
  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await disconnectAll();
  });

  describe('la tx-por-peticion', () => {
    beforeEach(sembrar);

    it('sin req.user no abre transaccion: el handler ve el cliente base usable', async () => {
      const dentro = await comoPeticion(null, async () => ({
        esBase: prisma.client === prisma.base,
        // Sin contexto RLS el count es 0, pero el delegado tiene que existir: el
        // guard de auth consulta users por aqui, fuera de toda transaccion.
        filas: await prisma.client.dailyEntry.count(),
      }));

      expect(dentro).toEqual({ esBase: true, filas: 0 });
    });

    it('con req.user abre UNA sola transaccion para todo el handler', async () => {
      // xid8 no lo sabe deserializar el cliente: se pide como texto.
      const xid = async () => {
        const [f] = await prisma.client.$queryRaw<
          { id: string }[]
        >`SELECT pg_current_xact_id()::text AS id`;
        return f.id;
      };

      const { esTx, primero, segundo } = await comoPeticion(USUARIOS.A, async () => ({
        esTx: prisma.client !== prisma.base,
        primero: await xid(),
        segundo: await xid(),
      }));

      expect(esTx).toBe(true);
      expect(segundo).toBe(primero); // mismo xid = misma transaccion

      const otra = await comoPeticion(USUARIOS.A, xid);
      expect(otra).not.toBe(primero); // peticion distinta = transaccion distinta
    });

    it('mueve nota + 7 entradas de draft a submitted en la misma tx, con RLS activo', async () => {
      const r = await comoPeticion(USUARIOS.A, () => transicion(TEC_A, 'submitted-A'));

      expect(r).toEqual({ estado: 'submitted-A', actualizadas: 7, propias: 7, ajenas: 0 });
      // Persistio de verdad (la lectura de control la hace el owner, fuera de RLS):
      const deA = await ownerClient.dailyEntry.findMany({ where: { technicianId: TEC_A } });
      expect(deA.every((e) => e.status === 'submitted-A')).toBe(true);
      const deB = await ownerClient.dailyEntry.findMany({ where: { technicianId: TEC_B } });
      expect(deB.every((e) => e.status === 'draft')).toBe(true);
    });
  });

  describe('tormenta: 2 tecnicos x 100 transiciones intercaladas', () => {
    const LOTES = 10;
    const POR_LOTE = 20; // el pool es max 10: la mitad del lote espera conexion a proposito

    beforeAll(sembrar);

    it(
      'cero P2028, cero espera de conexion agotada, cero fuga de contexto',
      async () => {
        const resultados: PromiseSettledResult<Awaited<ReturnType<typeof transicion>>>[] = [];

        for (let lote = 0; lote < LOTES; lote++) {
          const peticiones = Array.from({ length: POR_LOTE }, (_, i) => {
            const esA = i % 2 === 0;
            const user = esA ? USUARIOS.A : USUARIOS.B;
            const accion = Math.floor(i / 2) % 2 === 0 ? 'submitted' : 'returned';
            const estado = `${accion}-${esA ? 'A' : 'B'}`;
            return comoPeticion(user, () => transicion(user.technicianId, estado));
          });
          resultados.push(...(await Promise.allSettled(peticiones)));
        }

        const errores = resultados
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => String(r.reason).replace(/\s+/g, ' ').slice(0, 300));

        expect(errores).toEqual([]);
        expect(resultados).toHaveLength(LOTES * POR_LOTE);

        // Ninguna peticion vio una fila ajena, ni bajo contencion de pool.
        const filtradas = resultados.flatMap((r) =>
          r.status === 'fulfilled' && (r.value.ajenas > 0 || r.value.propias !== 7) ? [r.value] : [],
        );
        expect(filtradas).toEqual([]);
      },
      120_000,
    );

    it('el contexto no sobrevivio al release(): ninguna conexion del pool lo conserva', async () => {
      // 30 consultas en paralelo sobre un pool de 10: cada conexion se toca al menos
      // una vez. Sin el tercer argumento TRUE de set_config, alguna traeria el
      // technician_id de la tormenta y sus filas.
      const sondas = await Promise.all(
        Array.from({ length: 30 }, async () => {
          const [ctx] = await prisma.base.$queryRaw<
            { tec: string | null; admin: string | null }[]
          >`SELECT current_setting('app.technician_id', TRUE) AS tec,
                   current_setting('app.is_admin', TRUE) AS admin`;
          return { ...ctx, filas: await prisma.base.dailyEntry.count() };
        }),
      );

      for (const s of sondas) {
        expect(s.tec ?? '').toBe('');
        expect(s.admin ?? '').toBe('');
        expect(s.filas).toBe(0);
      }
    });

    it('integridad cruzada: ninguna fila de A quedo con el sufijo de B', async () => {
      const [deA, deB, notas] = await Promise.all([
        ownerClient.dailyEntry.findMany({ where: { technicianId: TEC_A } }),
        ownerClient.dailyEntry.findMany({ where: { technicianId: TEC_B } }),
        ownerClient.weeklyNote.findMany(),
      ]);

      expect(deA).toHaveLength(7);
      expect(deB).toHaveLength(7);
      expect(deA.every((e) => e.status.endsWith('-A'))).toBe(true);
      expect(deB.every((e) => e.status.endsWith('-B'))).toBe(true);
      for (const nota of notas) {
        expect(nota.status.endsWith(nota.technicianId === TEC_A ? '-A' : '-B')).toBe(true);
      }
    });
  });
});
