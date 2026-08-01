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
import { CUR_TEST, MAQ_TEST,
  ROL_TEST, TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearJornadaAprobada, crearOrden, crearProyecto } from './helpers/fixtures';
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

/**
 * Desde la Fase 2.1 lo unico comercial que queda EN EL PROYECTO es `normalHours`. El
 * OA, el importe y la moneda viven en la orden: JAV tiene tres importes distintos, uno
 * por maquina, y J Macedo ninguno a nivel de proyecto.
 */
const COMERCIAL = {
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

  it('clientNit y normalHours son opcionales', async () => {
    const p = await crear({ ...ENCABEZADO, clientNit: undefined });
    const leido = await detalle(p.id);

    expect(leido).toMatchObject({ clientNit: null, normalHours: null });
  });

  // ── Decimal (Pitfall 5) ──

  it('contractValue es un number en la orden, no el string de Decimal.toJSON', async () => {
    const p = await crear({ ...ENCABEZADO });
    const o = await crearOrden(p.id, { contractValue: 4150000.75 });
    const [leida] = (await detalle(p.id)).orders;

    expect(leida.id).toBe(o.id);
    expect(typeof leida.contractValue).toBe('number');
    expect(leida.contractValue).toBe(4150000.75);
  });

  it('el importe del listado es la SUMA de las ordenes, no una columna del proyecto', async () => {
    const p = await crear({ ...ENCABEZADO });
    // Es el caso de JAV: tres maquinas, tres importes.
    await crearOrden(p.id, { contractValue: 182500 });
    await crearOrden(p.id, { contractValue: 130000 });
    const [fila] = await listar();

    expect(typeof fila.contractValue).toBe('number');
    expect(fila.contractValue).toBe(312500);
    expect(fila.currencyCode).toBe(CUR_TEST);
  });

  it('con ordenes en monedas distintas el listado no inventa una: currencyCode null', async () => {
    const p = await crear({ ...ENCABEZADO });
    await ownerClient.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', symbol: 'US$' },
    });
    await crearOrden(p.id, { contractValue: 100, currencyCode: CUR_TEST });
    await crearOrden(p.id, { contractValue: 200, currencyCode: 'USD' });
    const [fila] = await listar();

    // Sumar dos monedas y ponerle una etiqueta seria una cifra falsa.
    expect(fila.contractValue).toBe(300);
    expect(fila.currencyCode).toBeNull();
  });

  it('un proyecto sin ordenes vale 0 y no null: el total es una suma, no un dato ausente', async () => {
    await crear({ ...ENCABEZADO });
    const [fila] = await listar();

    expect(fila.contractValue).toBe(0);
    expect(fila.currencyCode).toBeNull();
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

  it('la moneda ya no se acepta en el proyecto: es un recurso aparte → 400', async () => {
    const res = await http()
      .post('/api/projects')
      .set(auth(tokenAdmin))
      .send({ ...ENCABEZADO, currencyCode: 'ZZZ' })
      .expect(400);

    // 400 explicito y no un descarte en silencio: aceptarlo dejaria creer al cliente
    // que la moneda quedo guardada en algun sitio.
    expect(res.body.message).toBe('RECURSO_APARTE');
    expect(await ownerClient.project.count({ where: { name: ENCABEZADO.name } })).toBe(0);
  });

  it('una moneda inexistente en la ORDEN → 400 con codigo propio, nunca un 500 de FK', async () => {
    const p = await crear({ ...ENCABEZADO });
    const res = await http()
      .post(`/api/projects/${p.id}/orders`)
      .set(auth(tokenAdmin))
      .send({ label: 'PL 6000 KG - 1-3428', currencyCode: 'ZZZ' })
      .expect(400);

    expect(res.body.message).toBe('MAQUINA_O_MONEDA_INEXISTENTE');
    expect(await ownerClient.order.count({ where: { projectId: p.id } })).toBe(0);
  });

  // ── PATCH: encabezado y comercial, nada mas ──

  it('un Admin edita el encabezado y el comercial', async () => {
    const p = await crearProyecto();

    const res = await http()
      .patch(`/api/projects/${p.id}`)
      .set(auth(tokenAdmin))
      .send({ clientName: 'OTRO CLIENTE', normalHours: 10 })
      .expect(200);

    expect(res.body).toMatchObject({ clientName: 'OTRO CLIENTE', normalHours: 10 });
  });

  it.each(['orders', 'oaNumber', 'contractValue', 'currencyCode', 'machineModelIds', 'soldDays'])(
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

  // ── Las ordenes: la maquina contratada, con su commessa y su importe ──

  describe('CRUD de ordenes', () => {
    /** Un segundo modelo del catalogo de arranque: un proyecto tiene varias maquinas. */
    let otra: { id: string; code: string };

    beforeEach(async () => {
      otra = await ownerClient.machineModel.findFirstOrThrow({
        where: { NOT: { id: MAQ_TEST } },
        select: { id: true, code: true },
      });
    });

    const crearOrdenApi = async (projectId: string, body: object, esperado = 201) =>
      (
        await http()
          .post(`/api/projects/${projectId}/orders`)
          .set(auth(tokenAdmin))
          .send(body)
          .expect(esperado)
      ).body;

    const ordenesDe = async (id: string) => (await detalle(id)).orders;

    it('dos maquinas del MISMO modelo conviven si su commessa las distingue', async () => {
      const p = await crearProyecto();
      // El caso literal de JAV Marata: dos `PL 6000 KG` que solo se diferencian por la
      // commessa. Con la PK (proyecto, modelo) de `project_machines` esto era imposible.
      await crearOrdenApi(p.id, {
        label: 'PL 6000 KG - 1-3428',
        machineModelId: MAQ_TEST,
        commessa: '342898',
        commessaShort: '3428',
        contractValue: 182500,
      });
      await crearOrdenApi(p.id, {
        label: 'PL 6000 KG - 2-3429',
        machineModelId: MAQ_TEST,
        commessa: '342998',
        commessaShort: '3429',
        contractValue: 182500,
      });

      const ordenes = await ordenesDe(p.id);
      expect(ordenes).toHaveLength(2);
      expect(ordenes.map((o: { commessaShort: string }) => o.commessaShort)).toEqual([
        '3428',
        '3429',
      ]);
      // Y cada una con su propia matriz vendido/ejecutado, como las hojas del Excel.
      expect(ordenes.every((o: { matrix: unknown[] }) => Array.isArray(o.matrix))).toBe(true);
    });

    it('el contrato de una orden es label, commessa, OA, importe, moneda, modelo y matriz', async () => {
      const p = await crearProyecto();
      await crearOrdenApi(p.id, { label: 'PC 4000 -3430 + 4 SILOS', machineModelId: MAQ_TEST });

      const [o] = await ordenesDe(p.id);
      expect(Object.keys(o).sort()).toEqual([
        'commessa',
        'commessaShort',
        'contractValue',
        'currencyCode',
        'id',
        'isActive',
        'label',
        'machineModelId',
        'matrix',
        'oaNumber',
      ]);
      expect(o).toMatchObject({ label: 'PC 4000 -3430 + 4 SILOS', machineModelId: MAQ_TEST });
    });

    it('la etiqueta es lo unico obligatorio: la commessa llega cuando se firma', async () => {
      const p = await crearProyecto();
      const o = await crearOrdenApi(p.id, { label: 'Por definir' });

      expect(o).toMatchObject({ commessa: null, oaNumber: null, contractValue: null });
    });

    it('sin etiqueta → 400', async () => {
      const p = await crearProyecto();
      await crearOrdenApi(p.id, { machineModelId: MAQ_TEST }, 400);
    });

    it('una orden sin modelo de maquina es valida: hay alcances que no son un modelo', async () => {
      const p = await crearProyecto();
      // «PC 4000 -3430 + 4 SILOS» no es un modelo del catalogo, es alcance contratado.
      const o = await crearOrdenApi(p.id, { label: 'PC 4000 + 4 SILOS', machineModelId: null });

      expect(o.machineModelId).toBeNull();
    });

    it('la commessa es unica en TODO el sistema, no por proyecto → 400', async () => {
      const a = await crearProyecto();
      const b = await crearProyecto();
      await crearOrdenApi(a.id, { label: 'PL 6000', commessa: '342898' });

      // Identifica la maquina en la casa matriz: dos proyectos no pueden reclamarla.
      const res = await crearOrdenApi(b.id, { label: 'Otra', commessa: '342898' }, 400);
      expect(res.message).toBe('COMMESSA_DUPLICADA');
    });

    it('un modelo de maquina inexistente → 400, no un 500 de FK', async () => {
      const p = await crearProyecto();
      const res = await crearOrdenApi(p.id, { label: 'X', machineModelId: FANTASMA }, 400);
      expect(res.message).toBe('MAQUINA_O_MONEDA_INEXISTENTE');
    });

    it('POST sobre un proyecto que no existe → 404', async () => {
      await crearOrdenApi(FANTASMA, { label: 'X' }, 404);
    });

    it('el PATCH edita la orden sin tocar lo que no viene en el body', async () => {
      const p = await crearProyecto();
      const o = await crearOrdenApi(p.id, { label: 'PL 6000', commessa: '342898' });

      const res = await http()
        .patch(`/api/orders/${o.id}`)
        .set(auth(tokenAdmin))
        .send({ oaNumber: 'OA0159105' })
        .expect(200);

      expect(res.body).toMatchObject({
        oaNumber: 'OA0159105',
        label: 'PL 6000',
        commessa: '342898',
      });
    });

    it('un PATCH sin ningun campo reconocido → 400 (no mover updated_at por nada)', async () => {
      const p = await crearProyecto();
      const o = await crearOrdenApi(p.id, { label: 'PL 6000' });

      await http().patch(`/api/orders/${o.id}`).set(auth(tokenAdmin)).send({ foo: 1 }).expect(400);
    });

    it('se borra si nadie la referencia', async () => {
      const p = await crearProyecto();
      const o = await crearOrdenApi(p.id, { label: 'Creada por error' });

      await http().delete(`/api/orders/${o.id}`).set(auth(tokenAdmin)).expect(200);
      expect(await ordenesDe(p.id)).toEqual([]);
    });

    it('NO se borra si tiene bitacora: el dia registrado manda sobre el borrado', async () => {
      const p = await crearProyecto();
      const o = await crearOrden(p.id);
      await crearJornadaAprobada({
        technicianId: TEC_A,
        projectId: p.id,
        orderId: o.id,
        date: new Date('2026-03-02T00:00:00Z'),
      });

      const res = await http().delete(`/api/orders/${o.id}`).set(auth(tokenAdmin)).expect(400);
      expect(res.body.message).toBe('ORDEN_CON_BITACORA');
      expect(await ordenesDe(p.id)).toHaveLength(1);
    });

    it('NO se borra si tiene dias vendidos', async () => {
      const p = await crearProyecto();
      const o = await crearOrden(p.id);
      await http()
        .put(`/api/orders/${o.id}/sold-days`)
        .set(auth(tokenAdmin))
        .send({ roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 })
        .expect(200);

      const res = await http().delete(`/api/orders/${o.id}`).set(auth(tokenAdmin)).expect(400);
      expect(res.body.message).toBe('ORDEN_CON_DIAS_VENDIDOS');
    });

    it('machineCodes del listado son las etiquetas de las ordenes (los chips de Projects.tsx)', async () => {
      const p = await crearProyecto();
      await crearOrden(p.id, { label: 'PL 6000 KG - 1-3428', machineModelId: MAQ_TEST });
      await crearOrden(p.id, { label: 'PC 4000 -3430', machineModelId: otra.id });

      const fila = (await listar()).find((f: { id: string }) => f.id === p.id);
      expect(fila.machineCodes).toEqual(['PC 4000 -3430', 'PL 6000 KG - 1-3428']);
    });
  });

  /**
   * `['get', '/api/projects']` YA NO esta en esta lista: 03-03 relajo ese metodo a
   * `T` con una proyeccion propia (ver el describe de abajo). Las rutas que quedan
   * son la prueba de que se relajo UN metodo y no la clase: si alguien mueve el
   * `@Roles('T','A','S')` al `@Controller`, caen todas y el mensaje nombra cual
   * quedo abierta. Incluye las de `/api/orders`, que es otro controlador con su
   * propio `@Roles` y podria quedarse suelto sin que se notase.
   */
  it.each([
    ['post', '/api/projects'],
    ['get', `/api/projects/${FANTASMA}`],
    ['patch', `/api/projects/${FANTASMA}`],
    ['patch', `/api/projects/${FANTASMA}/active`],
    ['post', `/api/projects/${FANTASMA}/orders`],
    ['patch', `/api/orders/${FANTASMA}`],
    ['delete', `/api/orders/${FANTASMA}`],
    ['put', `/api/orders/${FANTASMA}/sold-days`],
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

    /** Una orden por maquina: es lo que el tecnico ve al registrar el dia. */
    const conMaquinas = async (projectId: string, ids: string[]) => {
      for (const machineModelId of ids)
        await crearOrden(projectId, { machineModelId, label: `Orden ${machineModelId.slice(-4)}` });
    };

    /**
     * Proyecto con TODO el dato comercial relleno: si algo se filtra, se filtra aqui.
     * Desde la Fase 2.1 el importe y el OA viven en la ORDEN, que es justo lo que el
     * tecnico SI recibe (necesita elegirla), asi que la fuga es ahora mas facil.
     */
    const crearSecreto = async (name = 'Obra visible para el tecnico') => {
      const p = await crear({
        ...ENCABEZADO,
        name,
        clientName: 'CLIENTE-SECRETO',
        contractNumber: '345599',
        normalHours: 9,
      });
      await crearOrden(p.id, {
        label: 'PL 6000 KG - 1-3428',
        machineModelId: MAQ_TEST,
        commessaShort: '3428',
        oaNumber: 'OA-SECRETO',
        contractValue: 4150000.5,
        currencyCode: CUR_TEST,
      });
      return p;
    };

    it('un Tecnico recibe 200 y EXACTAMENTE las claves id, name y orders', async () => {
      const p = await crearSecreto();

      const filas = await listarTec();

      expect(filas).toHaveLength(1);
      // Conjunto EXACTO, no «contractValue es undefined»: una errata en el nombre del
      // campo pasaria esa comprobacion sin enterarse de que el dato viaja igual.
      expect(Object.keys(filas[0]).sort()).toEqual(['id', 'name', 'orders']);
      expect(filas[0]).toMatchObject({ id: p.id, name: 'Obra visible para el tecnico' });
    });

    it('ningun dato comercial aparece en el JSON serializado, ni anidado en orders', async () => {
      await crearSecreto();

      const crudo = JSON.stringify(await listarTec());

      // Como LISTA de lo que se filtro, no como booleano: el mensaje del fallo tiene
      // que nombrar el campo (mismo criterio que la introspeccion de 02-02).
      expect(SECRETOS.filter((s) => crudo.includes(s))).toEqual([]);
    });

    it('cada orden llega con id, label, commessaShort y machineModelId, y nada mas', async () => {
      await crearSecreto();

      const [fila] = await listarTec();
      expect(fila.orders).toHaveLength(1);
      // `id` es lo que la bitacora escribe en daily_entries.order_id; `commessaShort`
      // es como la maquina se nombra en obra y lo que distingue dos PL 6000 iguales.
      expect(Object.keys(fila.orders[0]).sort()).toEqual([
        'commessaShort',
        'id',
        'label',
        'machineModelId',
      ]);
      expect(fila.orders[0]).toMatchObject({
        machineModelId: MAQ_TEST,
        label: 'PL 6000 KG - 1-3428',
        commessaShort: '3428',
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

    it('un proyecto sin ordenes llega con orders vacio, no se omite ni revienta', async () => {
      const p = await crearProyecto({ name: 'Obra sin maquinas' });

      const filas = await listarTec();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toEqual({ id: p.id, name: 'Obra sin maquinas', orders: [] });
    });

    it('las ordenes llegan ordenadas por label, no por orden de insercion', async () => {
      const p = await crearProyecto({ name: 'Obra con dos maquinas' });
      // Sembradas al reves de como deben salir.
      await crearOrden(p.id, { label: 'ZZZ ultima', machineModelId: MAQ_Z });
      await crearOrden(p.id, { label: 'AAA primera', machineModelId: MAQ_M });

      const [fila] = await listarTec();
      expect(fila.orders.map((o: { label: string }) => o.label)).toEqual([
        'AAA primera',
        'ZZZ ultima',
      ]);
    });

    it('una orden DESACTIVADA no se le ofrece al tecnico', async () => {
      const p = await crearProyecto({ name: 'Obra con una orden cerrada' });
      await crearOrden(p.id, { label: 'Viva', machineModelId: MAQ_M });
      await crearOrden(p.id, { label: 'Cerrada', machineModelId: MAQ_Z, isActive: false });

      const [fila] = await listarTec();
      expect(fila.orders.map((o: { label: string }) => o.label)).toEqual(['Viva']);
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

      for (const token of [tokenAdmin, tokenSuper]) {
        const [fila] = await listar(token);
        // El OA ya no esta en el listado: vive en la orden. Lo que si sigue viendo el
        // admin es el cliente, los chips y el importe total sumado de sus ordenes.
        expect(fila).toMatchObject({
          id: p.id,
          clientName: 'CLIENTE-SECRETO',
          machineCodes: ['PL 6000 KG - 1-3428'],
        });
        expect(fila.contractValue).toBe(4150000.5);
      }
    });
  });
});
