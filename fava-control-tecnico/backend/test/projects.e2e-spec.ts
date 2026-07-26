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
import { CUR_TEST, MAQ_TEST, TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearJornadaAprobada, crearProyecto } from './helpers/fixtures';
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

  // ── Seleccion de maquinas: recurso aparte, y quitar una NUNCA toca la bitacora ──

  describe('PUT /api/projects/:id/machines', () => {
    /** Un segundo modelo del catalogo de arranque: la seleccion es de dos o mas. */
    let otra: { id: string; code: string };

    beforeEach(async () => {
      otra = await ownerClient.machineModel.findFirstOrThrow({
        where: { NOT: { id: MAQ_TEST } },
        select: { id: true, code: true },
      });
    });

    const fijar = async (id: string, machineModelIds: string[], token = tokenAdmin) =>
      (
        await http()
          .put(`/api/projects/${id}/machines`)
          .set(auth(token))
          .send({ machineModelIds })
          .expect(200)
      ).body;

    const maquinasDe = async (id: string) => (await detalle(id)).machines;

    it('reemplaza la seleccion completa, y repetir el mismo PUT deja el mismo estado', async () => {
      const p = await crearProyecto();

      const primera = await fijar(p.id, [MAQ_TEST, otra.id]);
      expect(primera.map((m: { machineModelId: string }) => m.machineModelId).sort()).toEqual(
        [MAQ_TEST, otra.id].sort(),
      );

      // Idempotente: el mismo PUT otra vez no duplica ni pierde nada.
      const segunda = await fijar(p.id, [MAQ_TEST, otra.id]);
      expect(segunda).toEqual(primera);

      // «Reemplaza», no «añade»: la que no viene en el body se va.
      const tercera = await fijar(p.id, [otra.id]);
      expect(tercera).toHaveLength(1);
      expect(tercera[0].machineModelId).toBe(otra.id);
    });

    it('el contrato de cada maquina seleccionada es machineModelId, code, description y entryCount', async () => {
      const p = await crearProyecto();
      await fijar(p.id, [MAQ_TEST]);

      const [m] = await maquinasDe(p.id);
      expect(Object.keys(m).sort()).toEqual([
        'code',
        'description',
        'entryCount',
        'machineModelId',
      ]);
      expect(m).toMatchObject({ machineModelId: MAQ_TEST, code: 'TEST-MAQ', entryCount: 0 });
    });

    it('entryCount cuenta las jornadas de ESE proyecto con ese modelo, no las de otro', async () => {
      const p = await crearProyecto();
      const otroProyecto = await crearProyecto();

      // Dos jornadas del proyecto (tecnicos distintos: @@unique(tecnico, fecha)).
      await crearJornadaAprobada({
        technicianId: TEC_A,
        projectId: p.id,
        date: new Date('2026-03-02T00:00:00Z'),
      });
      await crearJornadaAprobada({
        technicianId: TEC_B,
        projectId: p.id,
        date: new Date('2026-03-02T00:00:00Z'),
      });
      // Y una del OTRO proyecto con la misma maquina: no debe sumar aqui.
      await crearJornadaAprobada({
        technicianId: TEC_A,
        projectId: otroProyecto.id,
        date: new Date('2026-03-03T00:00:00Z'),
      });

      await fijar(p.id, [MAQ_TEST, otra.id]);
      const maquinas = await maquinasDe(p.id);
      const buscar = (idMaquina: string) =>
        maquinas.find((m: { machineModelId: string }) => m.machineModelId === idMaquina);

      expect(buscar(MAQ_TEST).entryCount).toBe(2);
      expect(buscar(otra.id).entryCount).toBe(0);
    });

    it('quitar una maquina con jornadas → 200, y la jornada CONSERVA su modelo', async () => {
      const p = await crearProyecto();
      await fijar(p.id, [MAQ_TEST]);
      const jornada = await crearJornadaAprobada({
        technicianId: TEC_A,
        projectId: p.id,
        date: new Date('2026-03-04T00:00:00Z'),
      });

      // Decision bloqueada: «se avisa y se permite». El aviso lo da la UI con el
      // entryCount; el servidor permite. La jornada apunta al modelo GLOBAL.
      expect(await fijar(p.id, [])).toEqual([]);

      const relectura = await ownerClient.dailyEntry.findUniqueOrThrow({
        where: { id: jornada.id },
      });
      expect(relectura.machineModelId).toBe(MAQ_TEST);
      expect(relectura.projectId).toBe(p.id);
      expect(await ownerClient.machineModel.count({ where: { id: MAQ_TEST } })).toBe(1);
    });

    it('machineModelIds vacio → 200 y proyecto sin maquinas', async () => {
      const p = await crearProyecto();
      await fijar(p.id, [MAQ_TEST]);

      expect(await fijar(p.id, [])).toEqual([]);
      expect(await maquinasDe(p.id)).toEqual([]);
    });

    it('un machineModelId inexistente → 400 y la seleccion previa NO se toca', async () => {
      const p = await crearProyecto();
      await fijar(p.id, [MAQ_TEST]);

      const res = await http()
        .put(`/api/projects/${p.id}/machines`)
        .set(auth(tokenAdmin))
        .send({ machineModelIds: [otra.id, '77777777-7777-4777-8777-777777777777'] })
        .expect(400);

      expect(res.body.message).toBe('MAQUINA_INEXISTENTE');
      // Todo o nada: sigue exactamente la seleccion anterior.
      const maquinas = await maquinasDe(p.id);
      expect(maquinas.map((m: { machineModelId: string }) => m.machineModelId)).toEqual([MAQ_TEST]);
    });

    it('ids repetidos no revientan la clave primaria compuesta', async () => {
      const p = await crearProyecto();
      expect(await fijar(p.id, [MAQ_TEST, MAQ_TEST])).toHaveLength(1);
    });

    it.each([
      ['machineModelIds que no es un array', { machineModelIds: MAQ_TEST }],
      ['machineModelIds ausente', {}],
      ['un id que no es UUID', { machineModelIds: ['no-soy-uuid'] }],
    ])('%s → 400', async (_caso, body) => {
      const p = await crearProyecto();
      await http()
        .put(`/api/projects/${p.id}/machines`)
        .set(auth(tokenAdmin))
        .send(body)
        .expect(400);
    });

    it('PUT de maquinas sobre un proyecto que no existe → 404', async () => {
      await http()
        .put(`/api/projects/${FANTASMA}/machines`)
        .set(auth(tokenAdmin))
        .send({ machineModelIds: [] })
        .expect(404);
    });

    it('machineCodes del listado refleja la seleccion (son los chips de Projects.tsx)', async () => {
      const p = await crearProyecto();
      await fijar(p.id, [MAQ_TEST, otra.id]);

      const fila = (await listar()).find((f: { id: string }) => f.id === p.id);
      expect(fila.machineCodes).toEqual(['TEST-MAQ', otra.code].sort());
    });
  });

  /**
   * `['get', '/api/projects']` YA NO esta en esta lista: 03-03 relajo ese metodo a
   * `T` con una proyeccion propia (ver el describe de abajo). Las SEIS rutas que
   * quedan son la prueba de que se relajo UN metodo y no la clase: si alguien mueve
   * el `@Roles('T','A','S')` al `@Controller`, caen las seis y el mensaje nombra
   * cual quedo abierta.
   */
  it.each([
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

  /**
   * BIT-01: el selector de proyecto de la captura. Un Tecnico lista proyectos, pero
   * con una PROYECCION distinta: «solo nombre y maquinas» (decision bloqueada del
   * CONTEXT). El valor de contrato, el n.º de OA, el cliente y las horas normales son
   * informacion comercial que los ~15 tecnicos no necesitan.
   *
   * RLS no protege nada de esto: `proj_read` es `USING (TRUE)`, o sea que el motor le
   * dejaria leer todas las columnas de todos los proyectos. El aislamiento es de capa
   * de servicio y por eso se prueba aqui, con dos aserciones DISTINTAS:
   *  - el conjunto EXACTO de claves (un `contractValue` de mas lo tumba),
   *  - y una sonda sobre el JSON serializado (caza la fuga ANIDADA, dentro de
   *    `machines`, que el conjunto de claves de primer nivel no ve).
   */
  describe('GET /api/projects con token de Tecnico: solo nombre y maquinas (BIT-01)', () => {
    /**
     * Dos modelos con prefijo propio, sembrados en orden INVERSO al esperado: prueban
     * que la respuesta ordena por `code` y no por el orden de insercion. Los catalogos
     * NO se truncan (02-01), asi que se borran en afterAll o la segunda pasada de la
     * suite choca con el @unique de `machine_models.code`.
     */
    const MAQ_Z = '03030303-0303-4303-8303-000000000002';
    const MAQ_M = '03030303-0303-4303-8303-000000000001';

    /** Valores que NO pueden aparecer en la respuesta del tecnico, ni como valor ni como clave. */
    const SECRETOS = [
      '4150000',
      'OA-SECRETO',
      'CLIENTE-SECRETO',
      'contractValue',
      'soldDays',
      'currencyCode',
      'oaNumber',
      'normalHours',
      'clientName',
    ];

    beforeAll(async () => {
      await ownerClient.machineModel.create({
        data: { id: MAQ_Z, code: 'ZZZ-0303-Z', description: 'La segunda por codigo' },
      });
      await ownerClient.machineModel.create({
        data: { id: MAQ_M, code: 'MMM-0303-M', description: 'La primera por codigo' },
      });
    });

    afterAll(async () => {
      await ownerClient.machineModel.deleteMany({ where: { id: { in: [MAQ_M, MAQ_Z] } } });
    });

    beforeEach(async () => {
      // El tecnico de la captura esta VINCULADO a su ficha: de esa columna sale la
      // GUC `app.technician_id` que gobierna el resto de la Fase 3.
      await ownerClient.user.update({
        where: { email: 'tec@fava.local' },
        data: { technicianId: TEC_A },
      });
    });

    const listarTec = () => listar(tokenTec);

    const conMaquinas = (projectId: string, ids: string[]) =>
      ownerClient.projectMachine.createMany({
        data: ids.map((machineModelId) => ({ projectId, machineModelId })),
      });

    /** Proyecto con TODO el dato comercial relleno: si algo se filtra, se filtra aqui. */
    const crearSecreto = (name = 'Obra visible para el tecnico') =>
      crear({
        ...ENCABEZADO,
        name,
        clientName: 'CLIENTE-SECRETO',
        contractNumber: '345599',
        oaNumber: 'OA-SECRETO',
        contractValue: 4150000.5,
        currencyCode: CUR_TEST,
        normalHours: 9,
      });

    it('un Tecnico recibe 200 y EXACTAMENTE las claves id, machines y name', async () => {
      const p = await crearSecreto();
      await conMaquinas(p.id, [MAQ_TEST]);

      const filas = await listarTec();

      expect(filas).toHaveLength(1);
      // Conjunto EXACTO, no «contractValue es undefined»: una errata en el nombre del
      // campo pasaria esa comprobacion sin enterarse de que el dato viaja igual.
      expect(Object.keys(filas[0]).sort()).toEqual(['id', 'machines', 'name']);
      expect(filas[0]).toMatchObject({ id: p.id, name: 'Obra visible para el tecnico' });
    });

    it('ningun dato comercial aparece en el JSON serializado, ni anidado', async () => {
      const p = await crearSecreto();
      await conMaquinas(p.id, [MAQ_TEST]);

      const crudo = JSON.stringify(await listarTec());

      // Como LISTA de lo que se filtro, no como booleano: el mensaje del fallo tiene
      // que nombrar el campo (mismo criterio que la introspeccion de 02-02).
      expect(SECRETOS.filter((s) => crudo.includes(s))).toEqual([]);
    });

    it('cada maquina llega con machineModelId, code y description, y nada mas', async () => {
      const p = await crearSecreto();
      await conMaquinas(p.id, [MAQ_TEST]);

      const [fila] = await listarTec();
      expect(fila.machines).toHaveLength(1);
      // `machineModelId` es lo que la bitacora escribe en daily_entries.machine_model_id.
      expect(Object.keys(fila.machines[0]).sort()).toEqual([
        'code',
        'description',
        'machineModelId',
      ]);
      expect(fila.machines[0]).toEqual({
        machineModelId: MAQ_TEST,
        code: 'TEST-MAQ',
        description: 'Modelo de prueba',
      });
    });

    it('un proyecto DESACTIVADO no le llega al tecnico, y si al admin', async () => {
      const activo = await crearProyecto({ name: 'AAA sigue abierta' });
      const cerrado = await crearProyecto({ name: 'BBB ya cerrada' });
      await ownerClient.project.update({ where: { id: cerrado.id }, data: { isActive: false } });

      // Las dos mitades en el mismo caso y contra el conteo del owner, no contra «> 0»:
      // un filtro que se llevara los dos por delante pasaria un `length >= 1`.
      const total = await ownerClient.project.count();
      expect(total).toBe(2);

      expect((await listarTec()).map((f: { id: string }) => f.id)).toEqual([activo.id]);
      // LISTA no filtra por diseno: «filtra el selector, no el endpoint» (02-05).
      expect(await listar(tokenAdmin)).toHaveLength(total);
    });

    it('un proyecto sin maquinas llega con machines vacio, no se omite ni revienta', async () => {
      const p = await crearProyecto({ name: 'Obra sin maquinas' });

      const filas = await listarTec();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toEqual({ id: p.id, name: 'Obra sin maquinas', machines: [] });
    });

    it('las maquinas llegan ordenadas por code, no por orden de insercion', async () => {
      const p = await crearProyecto({ name: 'Obra con dos maquinas' });
      // Sembradas al reves de como deben salir.
      await conMaquinas(p.id, [MAQ_Z, MAQ_M]);

      const [fila] = await listarTec();
      expect(fila.machines.map((m: { code: string }) => m.code)).toEqual([
        'MMM-0303-M',
        'ZZZ-0303-Z',
      ]);
    });

    it('los proyectos llegan ordenados por name ascendente', async () => {
      for (const name of ['Cordoba', 'Antioquia', 'Barranquilla']) await crearProyecto({ name });

      expect((await listarTec()).map((f: { name: string }) => f.name)).toEqual([
        'Antioquia',
        'Barranquilla',
        'Cordoba',
      ]);
    });

    it('un Admin y un Super Admin siguen recibiendo la forma ANTERIOR', async () => {
      const p = await crearSecreto();
      await conMaquinas(p.id, [MAQ_TEST]);

      for (const token of [tokenAdmin, tokenSuper]) {
        const [fila] = await listar(token);
        expect(fila).toMatchObject({
          id: p.id,
          clientName: 'CLIENTE-SECRETO',
          oaNumber: 'OA-SECRETO',
          machineCodes: ['TEST-MAQ'],
        });
        expect(typeof fila.contractValue).toBe('number');
      }
    });
  });
});
