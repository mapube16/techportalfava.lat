/**
 * Fase 9 — los avisos, contra la base de verdad.
 *
 * El test que justifica este archivo es «RLS mata el cron en silencio». Los otros
 * cubren la idempotencia y el append-only; ese cubre el unico fallo de esta fase que no
 * da NINGUN sintoma: los recordatorios saldrian a cero destinatarios, sin excepcion, sin
 * log en rojo y con el proceso terminando en 0.
 *
 * Como los de RLS que ya existen, corre con `appClient` (rol fava_app, NOBYPASSRLS): con
 * el owner las politicas quedan escritas y sin efecto y el test pasaria por el motivo
 * equivocado.
 */
import { encolarEn } from '../src/common/notifications/notifications.service';
import { leerFaltantes } from '../src/common/notifications/recordatorios';
import { TEC_A, TEC_B, appClient, disconnectAll, ownerClient, truncateAll } from './helpers/db';

const LUNES = '2026-08-24';
const aDia = (s: string) => new Date(`${s}T00:00:00Z`);

/** Fija el contexto que `RlsInterceptor` pondria en una peticion de admin. */
const comoAdmin = <T>(fn: (tx: typeof appClient) => Promise<T>): Promise<T> =>
  appClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id',       '00000000-0000-4000-8000-000000000000', TRUE),
      set_config('app.technician_id', '',   TRUE),
      set_config('app.is_admin',      'on', TRUE)`;
    return fn(tx as unknown as typeof appClient);
  });

/** Lo mismo PERO sin GUCs: exactamente lo que hace un cron que se olvido de fijarlas. */
const sinContexto = <T>(fn: (tx: typeof appClient) => Promise<T>): Promise<T> =>
  appClient.$transaction((tx) => fn(tx as unknown as typeof appClient));

const aviso = (dedupeKey: string, email = 'tec@fava-la.com') => ({
  kind: 'week_missing' as const,
  dedupeKey,
  para: { userId: null, email, displayName: 'Tecnico A', lang: 'es' },
  datos: { semana: LUNES },
});

describe('notificaciones (e2e)', () => {
  beforeEach(async () => {
    await truncateAll();
    // Un tecnico activo con correo real y una semana entera en `draft` = no envio.
    await ownerClient.user.create({
      data: {
        email: 'tec@fava-la.com',
        displayName: 'Tecnico A',
        roles: ['T'],
        technicianId: TEC_A,
        lang: 'es',
      },
    });
    await ownerClient.dailyEntry.createMany({
      data: [0, 1, 2].map((n) => ({
        technicianId: TEC_A,
        date: aDia(`2026-08-2${4 + n}`),
        status: 'draft',
      })),
    });
  });

  afterAll(disconnectAll);

  /**
   * EL test. Si alguien quita el `set_config` de `conContexto` en `scripts/notificar.ts`,
   * los recordatorios dejan de salir y NADA falla: este es el unico sitio donde ese
   * cambio se pone en rojo.
   */
  it('sin fijar app.is_admin, la consulta del recordatorio devuelve CERO en silencio', async () => {
    const conGuc = await comoAdmin((tx) => leerFaltantes(tx, LUNES));
    expect(conGuc.avisables.map((t) => t.id)).toContain(TEC_A);

    // Sin excepcion, sin aviso: simplemente no hay jornadas y por tanto nadie falta...
    // salvo que TODOS parecen faltar con cero dias. Lo que se pierde es la verdad.
    const sinGuc = await sinContexto((tx) => leerFaltantes(tx, LUNES));
    const dias = await sinContexto((tx) =>
      tx.dailyEntry.count({ where: { technicianId: TEC_A } }),
    );
    expect(dias).toBe(0); // <- las 3 jornadas existen; RLS las esconde sin decir nada
    expect(sinGuc.avisables.length).not.toBe(0); // y el resultado es basura, no vacio
  });

  it('encolar dos veces la misma clave escribe UNA fila', async () => {
    const uno = await comoAdmin((tx) => encolarEn(tx, [aviso(`week_missing:${TEC_A}:${LUNES}:vie`)]));
    const dos = await comoAdmin((tx) => encolarEn(tx, [aviso(`week_missing:${TEC_A}:${LUNES}:vie`)]));
    expect(uno).toBe(1);
    expect(dos).toBe(0);

    const total = await comoAdmin((tx) => tx.notification.count());
    expect(total).toBe(1);
  });

  it('la ronda del domingo es OTRA clave: el segundo aviso si sale', async () => {
    await comoAdmin((tx) => encolarEn(tx, [aviso(`week_missing:${TEC_A}:${LUNES}:vie`)]));
    await comoAdmin((tx) => encolarEn(tx, [aviso(`week_missing:${TEC_A}:${LUNES}:dom`)]));
    expect(await comoAdmin((tx) => tx.notification.count())).toBe(2);
  });

  it('a un @pendiente.invalid no se le encola nada', async () => {
    const n = await comoAdmin((tx) =>
      encolarEn(tx, [aviso('week_missing:x:1:vie', 'tecnico-b@pendiente.invalid')]),
    );
    expect(n).toBe(0);
    expect(await comoAdmin((tx) => tx.notification.count())).toBe(0);
  });

  it('un tecnico sin usuario no rompe la consulta: sale como inalcanzable', async () => {
    // TEC_B existe en `technicians` y no tiene fila en `users`.
    const f = await comoAdmin((tx) => leerFaltantes(tx, LUNES));
    expect(f.inalcanzables.map((t) => t.id)).toContain(TEC_B);
  });

  it('fava_app no puede BORRAR un aviso: el privilegio no existe', async () => {
    await comoAdmin((tx) => encolarEn(tx, [aviso('week_missing:borrar:1:vie')]));

    /**
     * FALLA, no filtra en silencio.
     *
     * La prueba esperaba que el DELETE afectara 0 filas —lo que haria una politica RLS
     * sin regla de DELETE— y lo que pasa es un 42501 del motor: la migracion nunca
     * concedio el privilegio, asi que Postgres corta antes de mirar ninguna politica.
     * Es MAS estricto que lo que se estaba comprobando, y por eso la prueba correcta es
     * esta: exigir el error, no la ausencia de efecto. Comprobado en produccion — el rol
     * tiene INSERT, SELECT y UPDATE sobre `notifications`, y ni rastro de DELETE.
     */
    await expect(comoAdmin((tx) => tx.notification.deleteMany({}))).rejects.toThrow(/42501/);

    // Y el aviso sigue ahi, que es lo que de verdad importa del historico.
    expect(await comoAdmin((tx) => tx.notification.count())).toBe(1);
  });
});
