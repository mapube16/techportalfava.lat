/**
 * Criterio 2 del roadmap (AUTH-03): un tecnico no lee registros de otro.
 *
 * Todo lo que se afirma aqui se afirma conectado como `fava_app` (appClient), el rol
 * real de la app: NOBYPASSRLS y no dueno de las tablas. Con el owner las politicas
 * quedan escritas y sin ningun efecto y la suite pasaria por el motivo equivocado.
 *
 * `ownerClient` solo siembra, limpia y hace de control anti-mentira.
 */
import { TEC_A, TEC_B, appClient, disconnectAll, ownerClient, truncateAll } from './helpers/db';

/** Lo que hace RlsInterceptor en cada peticion, reducido a lo esencial. */
function comoTecnico<T>(technicianId: string, fn: (tx: typeof appClient) => Promise<T>): Promise<T> {
  return appClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.is_admin', 'off', TRUE),
      set_config('app.technician_id', ${technicianId}, TRUE)`;
    return fn(tx as typeof appClient);
  });
}

/** Admin: is_admin='on' y technician_id VACIO — el caso que revienta sin NULLIF. */
function comoAdmin<T>(fn: (tx: typeof appClient) => Promise<T>): Promise<T> {
  return appClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.is_admin', 'on', TRUE),
      set_config('app.technician_id', '', TRUE)`;
    return fn(tx as typeof appClient);
  });
}

const dia = (n: number) => new Date(Date.UTC(2026, 0, n));

describe('RLS: aislamiento por tecnico con el rol de aplicacion', () => {
  beforeEach(async () => {
    await truncateAll();
    await ownerClient.dailyEntry.createMany({
      data: [
        ...[1, 2, 3, 4, 5].map((n) => ({ technicianId: TEC_A, date: dia(n) })),
        ...[1, 2, 3].map((n) => ({ technicianId: TEC_B, date: dia(n) })),
      ],
    });
    await ownerClient.weeklyNote.createMany({
      data: [
        { technicianId: TEC_A, weekStart: dia(5) },
        { technicianId: TEC_A, weekStart: dia(12) },
        { technicianId: TEC_B, weekStart: dia(5) },
      ],
    });
  });

  afterAll(async () => {
    await disconnectAll();
  });

  describe('control anti-mentira (sin esto, RLS apagado seria indistinguible de RLS funcionando)', () => {
    it('las 8+3 filas existen de verdad: el owner las cuenta todas', async () => {
      expect(await ownerClient.dailyEntry.count()).toBe(8);
      expect(await ownerClient.weeklyNote.count()).toBe(3);
    });

    it('daily_entries y weekly_notes tienen RLS habilitado Y forzado', async () => {
      const filas = await appClient.$queryRaw<
        { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >`SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
         WHERE relkind = 'r' AND relname IN ('daily_entries', 'weekly_notes')
         ORDER BY relname`;

      expect(filas).toEqual([
        { relname: 'daily_entries', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'weekly_notes', relrowsecurity: true, relforcerowsecurity: true },
      ]);
    });

    it('el rol de la suite es fava_app, no el owner', async () => {
      const [{ usuario }] = await appClient.$queryRaw<
        { usuario: string }[]
      >`SELECT current_user AS usuario`;
      expect(usuario).toBe('fava_app');
    });
  });

  describe('daily_entries', () => {
    it('el tecnico A ve exactamente sus 5 filas', async () => {
      const visto = await comoTecnico(TEC_A, (tx) => tx.dailyEntry.findMany());

      expect(visto).toHaveLength(5);
      expect(visto.every((e) => e.technicianId === TEC_A)).toBe(true);
    });

    it('el tecnico A pidiendo explicitamente las filas de B recibe 0', async () => {
      const visto = await comoTecnico(TEC_A, (tx) =>
        tx.dailyEntry.findMany({ where: { technicianId: TEC_B } }),
      );

      expect(visto).toEqual([]);
    });

    it('un UPDATE cruzado no toca ninguna fila (la politica es FOR ALL, no solo SELECT)', async () => {
      const { count } = await comoTecnico(TEC_A, (tx) =>
        tx.dailyEntry.updateMany({
          where: { technicianId: TEC_B },
          data: { status: 'approved' },
        }),
      );

      expect(count).toBe(0);
      const deB = await ownerClient.dailyEntry.findMany({ where: { technicianId: TEC_B } });
      expect(deB.every((e) => e.status === 'draft')).toBe(true);
    });

    it('un DELETE cruzado no borra nada', async () => {
      const { count } = await comoTecnico(TEC_A, (tx) =>
        tx.dailyEntry.deleteMany({ where: { technicianId: TEC_B } }),
      );

      expect(count).toBe(0);
      expect(await ownerClient.dailyEntry.count()).toBe(8);
    });

    it('el tecnico A no puede INSERTAR una fila a nombre de B (USING vale como WITH CHECK)', async () => {
      await expect(
        comoTecnico(TEC_A, (tx) =>
          tx.dailyEntry.create({ data: { technicianId: TEC_B, date: dia(20) } }),
        ),
        // 42501 = insufficient_privilege. Se afirma el SQLSTATE y no el texto: el
        // mensaje de Postgres viene traducido al idioma del cluster.
      ).rejects.toThrow(/42501/);

      expect(await ownerClient.dailyEntry.count()).toBe(8);
    });

    it('el admin ve las 8 sin "invalid input syntax for type uuid" (prueba del NULLIF)', async () => {
      const visto = await comoAdmin((tx) => tx.dailyEntry.findMany());

      expect(visto).toHaveLength(8);
    });
  });

  describe('weekly_notes', () => {
    it('el tecnico A ve sus 2 notas y ninguna de B', async () => {
      const visto = await comoTecnico(TEC_A, (tx) => tx.weeklyNote.findMany());

      expect(visto).toHaveLength(2);
      expect(visto.every((n) => n.technicianId === TEC_A)).toBe(true);
    });

    it('el tecnico B ve 1 nota y no puede aprobar la de A', async () => {
      const visto = await comoTecnico(TEC_B, (tx) => tx.weeklyNote.findMany());
      expect(visto).toHaveLength(1);

      const { count } = await comoTecnico(TEC_B, (tx) =>
        tx.weeklyNote.updateMany({ where: { technicianId: TEC_A }, data: { status: 'approved' } }),
      );
      expect(count).toBe(0);
    });

    it('el admin ve las 3 notas', async () => {
      const visto = await comoAdmin((tx) => tx.weeklyNote.findMany());

      expect(visto).toHaveLength(3);
    });
  });

  describe('sin contexto fijado', () => {
    it('una conexion sin set_config no ve ninguna fila (la GUC no existe -> NULL -> falso)', async () => {
      expect(await appClient.dailyEntry.findMany()).toEqual([]);
      expect(await appClient.weeklyNote.findMany()).toEqual([]);
    });
  });
});
