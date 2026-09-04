/**
 * BIT-01 / BIT-02 / BIT-04 por API: los tres endpoints de la bitacora.
 *
 * Las fechas de la suite NO son literales: salen de `ventana()`, que es la misma
 * funcion que usa el servidor. Con `'2026-07-14'` cableado la suite caducaria el 1 de
 * septiembre —cuando el suelo pasa a agosto— y el fallo diria «FECHA_DEMASIADO_ANTIGUA»
 * en vez de nombrar el bug que hubiera.
 *
 * La idempotencia del criterio 4 se prueba EN PARALELO (`Promise.all`): 8 peticiones
 * secuenciales pasarian trivialmente y no probarian nada. La carrera solo existe cuando
 * las 8 llegan con la fila todavia inexistente.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ventana } from '../src/modules/daily-entries/fecha';
import { createTestApp, crearUsuario } from './helpers/app';
import { MAQ_TEST, ROL_TEST, TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearOrden, crearProyecto } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_A = 'oid-bitacora-tec-a';
const OID_B = 'oid-bitacora-tec-b';
const OID_HUERFANO = 'oid-bitacora-huerfano';
const OID_ADMIN = 'oid-bitacora-admin';

/** La ventana REAL del servidor en el momento de correr la suite. */
const { min: MIN, max: MAX } = ventana();

/** Aritmetica de dias sobre el suelo de la ventana, en UTC (nunca getters locales). */
const dia = (n: number): string =>
  new Date(Date.parse(MIN) + n * 86_400_000).toISOString().slice(0, 10);

/** El 14 del mes anterior: dentro de la ventana y lejos de sus dos fronteras. */
const DIA = dia(13);
const SEMANA = { from: dia(7), to: dia(13) };

/**
 * El SQLSTATE del motor, por CODIGO y nunca por texto: este cluster responde en
 * espanol. Prisma 7 con driver adapter no rellena `meta.target`; el codigo original
 * viaja en `meta.driverAdapterError.cause.originalCode` (verificado contra el motor).
 */
const sqlstate = (e: unknown): string =>
  String(
    (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })?.meta
      ?.driverAdapterError?.cause?.originalCode ?? '',
  );

/** INSERT directo saltandose la app: `updated_at` es NOT NULL sin default (@updatedAt). */
const insertarCrudo = (fecha: string, tecnico: string, concepto: string) =>
  ownerClient.$executeRawUnsafe(
    `INSERT INTO daily_entries (id, technician_id, date, status, created_at, updated_at, concept_code)
     VALUES (gen_random_uuid(), '${tecnico}'::uuid, DATE '${fecha}', 'draft', now(), now(), ${concepto})`,
  );

describe('daily-entries: la semana, el dia y su idempotencia (BIT-01, BIT-02, BIT-04)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let tokenHuerfano: string;
  let tokenAdmin: string;
  let proyectoId: string;
  let ordenId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  /** Los 5 campos que BIT-01 captura. Se afirman UNO A UNO, nunca con un toEqual. */
  const datos = () => ({
    projectId: proyectoId,
    // La maquina se elige por ORDEN desde la Fase 2.1: `machineModelId` ya no se
    // captura, solo lo trae el historico migrado del Excel.
    orderId: ordenId,
    conceptCode: 'DC',
    phase: 'MONTAJE',
    description: 'Montaje bancada linea 3',
  });

  const guardar = (fecha: string, body: object, token = tokenA) =>
    http().put(`/api/daily-entries/${fecha}`).set(auth(token)).send(body);

  const semana = (rango = SEMANA, token = tokenA) =>
    http()
      .get(`/api/daily-entries?from=${rango.from}&to=${rango.to}`)
      .set(auth(token));

  /**
   * Proyecto con su ORDEN. Desde la Fase 2.1 el tecnico no elige un modelo de maquina
   * sino la maquina contratada, que es lo unico que distingue dos PL 6000 del mismo
   * proyecto. Se devuelven las dos porque el PUT del dia manda projectId y orderId.
   */
  const proyectoConMaquina = async (d: Parameters<typeof crearProyecto>[0] = {}) => {
    const p = await crearProyecto(d);
    const orden = await crearOrden(p.id, { machineModelId: MAQ_TEST });
    return Object.assign(p, { orderId: orden.id });
  };

  const filas = () => ownerClient.dailyEntry.count();

  beforeAll(async () => {
    app = await createTestApp();
    // El servidor escucha UNA vez. Sin esto, supertest abre y cierra un listener por
    // peticion y las 8 del caso de concurrencia salen escalonadas ~50 ms: MEDIDO, con
    // ese escalon una implementacion con carrera (findUnique + create) pasa el caso.
    // Con el servidor ya escuchando, las 8 llegan juntas y la carrera aparece.
    await new Promise<void>((listo) => {
      (app.getHttpServer() as { listen: (p: number, cb: () => void) => void }).listen(0, listo);
    });

    [tokenA, tokenB, tokenHuerfano, tokenAdmin] = await Promise.all([
      signTestToken({ oid: OID_A, email: 'tec-a@fava.local' }),
      signTestToken({ oid: OID_B, email: 'tec-b@fava.local' }),
      signTestToken({ oid: OID_HUERFANO, email: 'huerfano@fava.local' }),
      signTestToken({ oid: OID_ADMIN, email: 'admin-bitacora@fava.local' }),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    await Promise.all([
      crearUsuario({ email: 'tec-a@fava.local', entraOid: OID_A, roles: ['T'], technicianId: TEC_A }),
      crearUsuario({ email: 'tec-b@fava.local', entraOid: OID_B, roles: ['T'], technicianId: TEC_B }),
      // Rol T y SIN vinculo: la GUC vale '' y la politica de_self filtra en silencio.
      crearUsuario({ email: 'huerfano@fava.local', entraOid: OID_HUERFANO, roles: ['T'] }),
      crearUsuario({ email: 'admin-bitacora@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
    ]);
    const proyecto = await proyectoConMaquina();
    proyectoId = proyecto.id;
    ordenId = proyecto.orderId;
  });

  // ── BIT-01: el dia entra y sale identico ──

  it('el PUT devuelve la fila con los 5 campos de la captura identicos a lo enviado', async () => {
    const enviado = datos();
    const { body } = await guardar(DIA, enviado).expect(200);

    // Campo por campo: si un `select` incompleto se come `description`, el mensaje
    // del fallo tiene que nombrarla.
    expect(body.date).toBe(DIA);
    expect(body.projectId).toBe(enviado.projectId);
    expect(body.orderId).toBe(enviado.orderId);
    expect(body.conceptCode).toBe(enviado.conceptCode);
    expect(body.phase).toBe(enviado.phase);
    expect(body.description).toBe(enviado.description);
    expect(body.status).toBe('draft');
  });

  it('el GET de la semana devuelve ese dia con los 5 campos identicos, description incluida', async () => {
    const enviado = datos();
    await guardar(DIA, enviado).expect(200);

    const { body } = await semana().expect(200);
    expect(body.entries).toHaveLength(1);
    const fila = body.entries[0];

    expect(fila.date).toBe(DIA);
    expect(fila.projectId).toBe(enviado.projectId);
    expect(fila.orderId).toBe(enviado.orderId);
    expect(fila.conceptCode).toBe(enviado.conceptCode);
    expect(fila.phase).toBe(enviado.phase);
    expect(fila.description).toBe(enviado.description);
  });

  it('el PUT y el GET devuelven EXACTAMENTE la misma forma (la grilla sustituye la fila sin refetch)', async () => {
    const { body: escrita } = await guardar(DIA, datos()).expect(200);
    const { body } = await semana().expect(200);

    expect(Object.keys(body.entries[0]).sort()).toEqual(Object.keys(escrita).sort());
    expect(body.entries[0]).toEqual(escrita);
  });

  it('cada fila lleva projectName y machineCode denormalizados', async () => {
    const p = await proyectoConMaquina({ name: 'Obra Cibao 2026' });
    await guardar(DIA, { ...datos(), projectId: p.id, orderId: p.orderId }).expect(200);

    const { body } = await semana().expect(200);
    expect(body.entries[0].projectName).toBe('Obra Cibao 2026');
    // La etiqueta de la ORDEN, que es lo que distingue dos PL 6000 del mismo proyecto.
    expect(body.entries[0].machineCode).toBe(body.entries[0].orderLabel);
    expect(body.entries[0].orderLabel).toEqual(expect.any(String));
  });

  it('una orden de OTRO proyecto → 400: el FK solo dice que existe, no que sea de aqui', async () => {
    const ajeno = await proyectoConMaquina({ name: 'Obra ajena' });
    const { body } = await guardar(DIA, { ...datos(), orderId: ajeno.orderId }).expect(400);
    expect(body.message).toBe('ORDEN_DE_OTRO_PROYECTO');
  });

  it('un dia contra un proyecto CERRADO se sigue viendo con su nombre (para eso esta denormalizado)', async () => {
    const p = await proyectoConMaquina({ name: 'Obra Cerrada' });
    await guardar(DIA, { ...datos(), projectId: p.id, orderId: p.orderId }).expect(200);
    await ownerClient.project.update({ where: { id: p.id }, data: { isActive: false } });

    const { body } = await semana().expect(200);
    // El proyecto ya no sale del selector (GET /api/projects filtra activos), pero el
    // dia registrado se pinta con su nombre y no en blanco.
    expect(body.entries[0].projectName).toBe('Obra Cerrada');
  });

  it('cada fila lleva updatedAt y avanza al reescribir el dia (lo consume enConflicto del borrador)', async () => {
    const { body: primera } = await guardar(DIA, datos()).expect(200);
    expect(typeof primera.updatedAt).toBe('string');
    expect(Date.parse(primera.updatedAt)).not.toBeNaN();

    const { body: segunda } = await guardar(DIA, { ...datos(), description: 'otra cosa' }).expect(200);
    expect(Date.parse(segunda.updatedAt)).toBeGreaterThanOrEqual(Date.parse(primera.updatedAt));
  });

  it('el GET devuelve minDate y maxDate iguales a los de ventana()', async () => {
    const { body } = await semana().expect(200);
    expect(body.minDate).toBe(MIN);
    expect(body.maxDate).toBe(MAX);
  });

  // ── BIT-02: una fila por tecnico y dia ──

  it('dos PUT a la misma fecha dejan UNA fila con los datos nuevos', async () => {
    await guardar(DIA, datos()).expect(200);
    await guardar(DIA, { ...datos(), conceptCode: 'MD', description: 'Segunda escritura' }).expect(200);

    // Contra la tabla con el owner, no contra el GET: el GET podria estar filtrando.
    expect(await filas()).toBe(1);
    const fila = await ownerClient.dailyEntry.findFirstOrThrow();
    expect(fila.conceptCode).toBe('MD');
    expect(fila.description).toBe('Segunda escritura');
  });

  /**
   * La otra mitad de BIT-02 (doctrina de 02-02): el caso de arriba prueba que ESTE
   * endpoint no duplica hoy; este prueba que NINGUN camino puede — venga de un script
   * de migracion, de un seed o de la consola de la base.
   */
  it('una segunda fila para el mismo tecnico y dia es imposible en el MOTOR (23505)', async () => {
    await guardar(DIA, datos()).expect(200);

    const error = await insertarCrudo(DIA, TEC_A, 'NULL').catch((e: unknown) => e);
    expect(sqlstate(error)).toBe('23505');
    expect(await filas()).toBe(1);
  });

  // ── BIT-04: idempotencia por clave natural ──

  it('8 PUT identicos y SIMULTANEOS dan 8x200, una sola fila y cero errores', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 8 }, () => guardar(DIA, datos())),
    );

    // La lista de codigos, no un `every`: si uno sale 500 el mensaje lo enseña.
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
    expect(await filas()).toBe(1);
  });

  // ── RLS: la semana es la del propio tecnico ──

  it('el GET de otro tecnico no devuelve ni una fila del primero', async () => {
    await guardar(DIA, datos(), tokenA).expect(200);

    const { body } = await semana(SEMANA, tokenB).expect(200);
    expect(body.entries).toEqual([]);
    // Y la fila existe de verdad: sin esto el caso pasaria con la tabla vacia.
    expect(await filas()).toBe(1);
  });

  it('cada tecnico ve SOLO las suyas cuando los dos tienen dias en la misma semana', async () => {
    await guardar(DIA, datos(), tokenA).expect(200);
    await guardar(dia(8), { conceptCode: 'NR' }, tokenB).expect(200);

    const [a, b] = await Promise.all([
      semana(SEMANA, tokenA).expect(200),
      semana(SEMANA, tokenB).expect(200),
    ]);
    expect(a.body.entries.map((e: { date: string }) => e.date)).toEqual([DIA]);
    expect(b.body.entries.map((e: { date: string }) => e.date)).toEqual([dia(8)]);
    expect(await filas()).toBe(2);
  });

  // ── El rango del GET ──

  it.each([
    ['sin from ni to', ''],
    ['solo con from', `?from=${SEMANA.from}`],
    ['con to anterior a from', `?from=${SEMANA.to}&to=${SEMANA.from}`],
    ['con un rango de mas de 43 dias', `?from=${dia(-50)}&to=${dia(0)}`],
  ])('el GET %s responde 400 RANGO_INVALIDO', async (_caso, query) => {
    const { body } = await http()
      .get(`/api/daily-entries${query}`)
      .set(auth(tokenA))
      .expect(400);
    expect(body.message).toBe('RANGO_INVALIDO');
  });

  // 43 dias inclusive = RANGO_MAX_DIAS (42) de diferencia: la rejilla de la bitacora
  // mensual, que son 6 semanas de 7 dias. Con el tope anterior de 31 no cabia.
  it('un rango de 43 dias exactos se acepta (la rejilla del mes)', async () => {
    await http()
      .get(`/api/daily-entries?from=${dia(0)}&to=${dia(42)}`)
      .set(auth(tokenA))
      .expect(200);
  });

  // ── Las tres reglas del contrato de escritura ──

  it('un body con `date` es 400 FECHA_EN_EL_CUERPO (la fecha viaja SOLO en la URL)', async () => {
    const { body } = await guardar(DIA, { ...datos(), date: dia(1) }).expect(400);
    expect(body.message).toBe('FECHA_EN_EL_CUERPO');
  });

  it.each(['technicianId', 'status'])(
    'un body con `%s` es 400 CAMPO_NO_ADMITIDO',
    async (campo) => {
      const { body } = await guardar(DIA, { ...datos(), [campo]: TEC_B }).expect(400);
      expect(body.message).toBe('CAMPO_NO_ADMITIDO');
    },
  );

  /**
   * DECISION: NO existe `?technicianId=` para administradores. La bitacora es del
   * tecnico y su lectura por un admin es la pantalla de aprobacion (Fase 4), que
   * llega con su propia autorizacion. Un parametro aqui seria una regla de permisos
   * sin pantalla que la use y sin test que la defienda. La clase esta en @Roles('T').
   */
  it('un Admin sin rol T recibe 403 al leer y al escribir (no existe ?technicianId=)', async () => {
    await http().get('/api/daily-entries').set(auth(tokenAdmin)).expect(403);
    await guardar(DIA, datos(), tokenAdmin).expect(403);
  });

  // ── BIT-09: el libre remunerado es SOLO de internos (regla de Andrea, 2026-08-30) ──

  it('a un tecnico EXTERNO el LR se le rechaza con su motivo; el NR le vale', async () => {
    // TEC_B nace EXTERNO en los fixtures: exactamente el caso de la regla.
    const res = await guardar(DIA, { conceptCode: 'LR' }, tokenB).expect(400);
    expect(res.body.message).toBe('LIBRE_REMUNERADO_SOLO_INTERNOS');

    await guardar(DIA, { conceptCode: 'NR' }, tokenB).expect(200);
  });

  it('a un INTERNO (TEC_A en los fixtures) el LR se le acepta', async () => {
    await guardar(DIA, { conceptCode: 'LR' }, tokenA).expect(200);
  });

  // ── «Otro» (peticion de Andrea, 2026-08-31): el cajon residual, con explicacion ──

  it('un OTRO sin descripcion se rechaza: un comodin sin explicar no se puede leer', async () => {
    const res = await guardar(DIA, { conceptCode: 'OTRO' }).expect(400);
    expect(res.body.message).toBe('OTRO_SIN_DESCRIPCION');
  });

  /**
   * El rol de la jornada. Sin el, la consulta de vendido/ejecutado —que hace INNER JOIN
   * con `role_types`— dejaba FUERA del ejecutado todo lo que se registrara desde la app,
   * sin fallar: el tecnico veia su dia guardado y el KPI seguia en cero. Un test barato
   * para el fallo mas caro de la Fase 1.
   */
  it('la jornada se sella con el rol del tecnico: sin el, el KPI no la ve', async () => {
    const p = await proyectoConMaquina();
    await guardar(DIA, { ...datos(), projectId: p.id, orderId: p.orderId }).expect(200);

    const fila = await ownerClient.dailyEntry.findFirstOrThrow({
      where: { date: new Date(`${DIA}T00:00:00Z`) },
      select: { roleTypeId: true },
    });
    expect(fila.roleTypeId).toBe(ROL_TEST);
  });

  // ── BIT-10: varias maquinas en la MISMA jornada (Camilo Cruz, capacitacion 31-ago) ──

  it('un dia puede llevar TRES maquinas: la principal y dos mas', async () => {
    const p = await proyectoConMaquina();
    const segunda = await crearOrden(p.id, { label: 'PC 4500', machineModelId: MAQ_TEST });
    const tercera = await crearOrden(p.id, { label: 'CTA 1000', machineModelId: MAQ_TEST });

    const res = await guardar(DIA, {
      ...datos(),
      projectId: p.id,
      orderId: p.orderId,
      extraOrderIds: [segunda.id, tercera.id],
    }).expect(200);

    expect(res.body.orderId).toBe(p.orderId);
    expect(res.body.extraOrders.map((o: { id: string }) => o.id).sort()).toEqual(
      [segunda.id, tercera.id].sort(),
    );
    // Y se leen igual al releer la semana: no es solo lo que devolvio el PUT.
    const semana = await http()
      .get(`/api/daily-entries?from=${DIA}&to=${DIA}`)
      .set(auth(tokenA))
      .expect(200);
    expect(semana.body.entries[0].extraOrders).toHaveLength(2);
  });

  it('mandar la lista VACIA quita las maquinas de mas; omitirla las deja', async () => {
    const p = await proyectoConMaquina();
    const segunda = await crearOrden(p.id, { label: 'PC 4500', machineModelId: MAQ_TEST });
    const base = { ...datos(), projectId: p.id, orderId: p.orderId };

    await guardar(DIA, { ...base, extraOrderIds: [segunda.id] }).expect(200);

    // Sin el campo: lo que habia sigue ahi (es un guardado parcial, no un borrado).
    const sinCampo = await guardar(DIA, base).expect(200);
    expect(sinCampo.body.extraOrders).toHaveLength(1);

    // Con la lista vacia: se quitan de verdad.
    const vacia = await guardar(DIA, { ...base, extraOrderIds: [] }).expect(200);
    expect(vacia.body.extraOrders).toEqual([]);
  });

  it('una maquina extra de OTRO proyecto se rechaza, igual que la principal', async () => {
    const p = await proyectoConMaquina();
    const ajeno = await proyectoConMaquina({ name: 'Proyecto ajeno BIT-10' });

    const res = await guardar(DIA, {
      ...datos(),
      projectId: p.id,
      orderId: p.orderId,
      extraOrderIds: [ajeno.orderId],
    }).expect(400);
    expect(res.body.message).toBe('ORDEN_DE_OTRO_PROYECTO');
  });

  it('un OTRO con descripcion y SIN proyecto entra: el CHECK lo admite suelto', async () => {
    // Si la CHECK `de_proyecto_por_concepto` no conociera OTRO, esto seria un 23514.
    const res = await guardar(DIA, {
      conceptCode: 'OTRO',
      description: 'Capacitacion interna en la planta',
    }).expect(200);
    expect(res.body.conceptCode).toBe('OTRO');
    expect(res.body.projectId).toBeNull();
  });

});
