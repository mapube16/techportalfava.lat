/**
 * Fase 4 — flujo de aprobación y auditoría.
 *
 * Los cuatro casos que más fácil se cuelan verdes por accidente van con valores
 * concretos: la derivación de DOS notas cuando hay dos proyectos, el bloqueo optimista
 * entre dos admins, la devolución sin comentario (que tiene que ser imposible en el
 * SERVICIO y en el MOTOR) y el append-only del audit_log, que se prueba intentando
 * reescribirlo con SQL suelto y no confiando en que no haya endpoint.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, crearUsuario } from './helpers/app';
import { ROL_TEST, TEC_A, TEC_B, appClient, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearProyecto, crearTecnico } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_ADMIN = 'oid-notes-admin';
const OID_ADMIN2 = 'oid-notes-admin2';
const OID_SUPER = 'oid-notes-super';
const OID_TEC = 'oid-notes-tec';

/** Lunes real: la derivación agrupa de lunes a domingo. */
const LUNES = '2026-03-02';
/** Un PNG real y > 100 caracteres en base64: el servidor rechaza trazos mas cortos. */
const PNG_FIRMA =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAC20lEQVR4nA3SMWgVOACA4eBykxIHoWiHoNCDThHFK3' +
    'RoBikdKpfhiYOHhE4WHIJDB8EScelQJOAiIlyGN7zJi4OCoJKh4Cbh4eBmNrE4ZFAo8uC/zN/6CSEEUgiUEGghMEJg' +
    'hcAJgReCMDwOT8Pz8DK8Dm/D+3AhpEDKP1DyDFqew8hlrLyEk6t4eZkg14hygyQ3yfIGRU6o8jZN7tDlLkIogVRnUG' +
    'oZrVYxag2rNnFqglc7BOWJap+kDsnqOUXNqOoNTR3R1RwhtEDqcyi9itYbGD3B6l2c3sfrpwQ9I+r3JD0n628UvaDq' +
    'szS9QtfrCGEE0iyjzBraTDDGY80hzszw5ohgGtEsSGaJbK5SjKWaezRzQDdThLACaS+h7Cba7mLsIdb+h7NzvP1FsE' +
    'tEu06yd8j2EcVOqfYjzR7T7WmEcALpVlFugnb7GDfDujnOLfBuheAs0T0guSnZfaK4E6q7SHPbdLeHEF4g/WWU30H7' +
    'pxh/hPW/cH4F728R/AHRvyX5Y7K/QPHbVP+Q5l/S/VeECONBWEMFjw4zTGjYsIQLFh8OCKEQwwkpaHK4SwmJGr7Qgq' +
    'SHrfEgjgdxAxX30fE9Ji6wcR0XH+DjW0I8Ica/SHGPHF9T4k9qvEKL9+nx1XiQxoO0iUqH6DTHpCVsuoNLU3w6JiRN' +
    'THuk9I6cTlHSFjU9oaXP9HR+PMjjQb6Bys/R+RsmX8XmR7j8CZ8vEPJdYn5NyqfI+W9KfkHN32n5Gj0/Hg/KeFAmqD' +
    'JDlwWmWGyZ4soJvmwTSiKWn6SyRS4vKKVTy3VaeUYvP8aDOh7U26j6Bl3PYuo9bP2Iqxfx9SGhfiHWK6T6hFy/U+p1' +
    'av2XVn/T683xoI0HbQfVjtBtBdMOsO0Y17bx7SWhSWK7T2qfye0apT2jtt+09g+9fRgP+njQd1F9ju7rmD7F9tO4vo' +
    'fvXwl9i9hfkfp5cn9M6T+o/Satf6D3P/kf+F5b31UXfdIAAAAASUVORK5CYII=';


describe('weekly-notes: envío, aprobación, devolución y auditoría (Fase 4)', () => {
  let app: INestApplication;
  let tokenAdmin: string;
  let tokenAdmin2: string;
  let tokenSuper: string;
  let tokenTec: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    [tokenAdmin, tokenAdmin2, tokenSuper, tokenTec] = await Promise.all([
      signTestToken({ oid: OID_ADMIN, email: 'admin@fava.local' }),
      signTestToken({ oid: OID_ADMIN2, email: 'admin2@fava.local' }),
      signTestToken({ oid: OID_SUPER, email: 'super@fava.local' }),
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
      crearUsuario({ email: 'admin2@fava.local', entraOid: OID_ADMIN2, roles: ['A'] }),
      crearUsuario({ email: 'super@fava.local', entraOid: OID_SUPER, roles: ['T', 'A', 'S'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
    // El técnico de la captura VINCULADO a su ficha: de ahí sale `app.technician_id`.
    await ownerClient.user.update({
      where: { email: 'tec@fava.local' },
      data: { technicianId: TEC_A },
    });
  });

  /** Siembra un día en borrador, que es como nacen todos. */
  const jornada = (d: { projectId: string | null; date: string; technicianId?: string }) =>
    ownerClient.dailyEntry.create({
      data: {
        technicianId: d.technicianId ?? TEC_A,
        projectId: d.projectId,
        date: new Date(`${d.date}T00:00:00Z`),
        conceptCode: d.projectId ? 'DC' : 'LR',
        status: 'draft',
        roleTypeId: ROL_TEST,
      },
    });

  const enviar = (esperado = 201, token = tokenTec) =>
    http().post('/api/weekly-notes/submit').set(auth(token)).send({ weekStart: LUNES }).expect(esperado);

  const notas = async (token = tokenAdmin) =>
    (await http().get('/api/weekly-notes').set(auth(token)).expect(200)).body;

  // ── NOTA-01: la derivación ──

  it('dos proyectos en la semana → DOS notas, y el técnico no elige ninguna', async () => {
    const a = await crearProyecto({ name: 'AAA Lucchetti' });
    const b = await crearProyecto({ name: 'BBB JAV Marata' });
    await jornada({ projectId: a.id, date: '2026-03-02' });
    await jornada({ projectId: a.id, date: '2026-03-03' });
    await jornada({ projectId: b.id, date: '2026-03-04' });

    const { body } = await enviar();

    expect(body).toHaveLength(2);
    expect(body.map((n: { projectName: string }) => n.projectName).sort()).toEqual([
      'AAA Lucchetti',
      'BBB JAV Marata',
    ]);
    expect(body.every((n: { status: string }) => n.status === 'submitted')).toBe(true);
  });

  it('la nota nace con el cargo del maestro del técnico (NOTA-09)', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });

    const { body } = await enviar();
    expect(body[0].roleTypeId).toBe(ROL_TEST);
    expect(body[0].roleTypeName).toEqual(expect.any(String));
  });

  it('reenviar la MISMA semana no duplica notas: la clave natural lo impide', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });

    const primera = (await enviar()).body;
    // Se devuelve para poder reenviar: enviar sobre `submitted` sería reabrir por detrás.
    await http()
      .post(`/api/weekly-notes/${primera[0].id}/return`)
      .set(auth(tokenAdmin))
      .send({ reason: 'Falta la descripción del martes' })
      .expect(201);
    const segunda = (await enviar()).body;

    expect(segunda[0].id).toBe(primera[0].id);
    expect(await ownerClient.weeklyNote.count()).toBe(1);
    // Reenviar limpia el comentario: ya no aplica a lo que se acaba de mandar.
    expect(segunda[0].returnComment).toBeNull();
  });

  it('los días SIN proyecto no generan nota y quedan aprobados con el envío', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    await jornada({ projectId: null, date: '2026-03-07' });

    const { body } = await enviar();
    expect(body).toHaveLength(1);

    const libre = await ownerClient.dailyEntry.findFirstOrThrow({ where: { projectId: null } });
    // Nadie firma un día libre: pedir que un admin lo apruebe lo dejaría fuera de los
    // tableros para siempre, porque sólo cuentan los `approved`.
    expect(libre.status).toBe('approved');
  });

  it('una semana sin jornadas → 400, no una nota vacía', async () => {
    const res = await enviar(400);
    expect(res.body.message).toBe('SEMANA_VACIA');
  });

  /**
   * El caso de la captura del 2026-08-29: la semana tenía Pasta Nova ya APROBADA y dos
   * días nuevos de OTROS proyectos. El guardia miraba la semana entera y devolvía
   * SEMANA_NO_EDITABLE, así que esos días no tenían ninguna forma de salir. Nunca.
   */
  it('un proyecto ya aprobado NO bloquea los días nuevos de otro proyecto', async () => {
    const viejo = await crearProyecto({ name: 'AAA ya aprobado' });
    await jornada({ projectId: viejo.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];
    await http().post(`/api/weekly-notes/${nota.id}/approve`).set(auth(tokenAdmin)).expect(201);

    const nuevo = await crearProyecto({ name: 'BBB registrado después' });
    await jornada({ projectId: nuevo.id, date: '2026-03-06' });

    const { body } = await enviar();

    expect(body).toHaveLength(1);
    expect(body[0].projectName).toBe('BBB registrado después');
    // Y lo aprobado no se mueve de sitio: ni la nota ni sus jornadas.
    const antes = await ownerClient.weeklyNote.findUniqueOrThrow({ where: { id: nota.id } });
    expect(antes.status).toBe('approved');
    expect(
      await ownerClient.dailyEntry.count({ where: { projectId: viejo.id, status: 'approved' } }),
    ).toBe(1);
  });

  it('un día nuevo del MISMO proyecto aprobado sí se rechaza: reabrir es del admin', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];
    await http().post(`/api/weekly-notes/${nota.id}/approve`).set(auth(tokenAdmin)).expect(201);

    // Colgar el viernes de una nota ya aprobada la devolvería a 'submitted' por detrás.
    await jornada({ projectId: p.id, date: '2026-03-06' });
    expect((await enviar(409)).body.message).toBe('PROYECTO_YA_APROBADO');
  });

  it('reenviar una semana en la que no queda nada editable sigue siendo 409', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    await enviar();
    expect((await enviar(409)).body.message).toBe('SEMANA_YA_ENVIADA');
  });

  /**
   * NOTA-04 — firma SOLO el técnico.
   *
   * El cliente tenía su propio lienzo y se quitó el 2026-08-29: la casilla del PDF se
   * llama «TIMBRE Y FIRMA DEL CLIENTE», el timbre es de tinta, y ese recuadro se
   * imprime vacío para firmarlo sobre el papel. El contrato del servidor sigue
   * aceptando la firma del cliente si algún día llega, pero ya no la exige — y esto
   * es lo único que lo demuestra.
   */
  it('se firma con la firma del técnico SOLA, y queda una firma, no dos', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    const res = await http()
      .post(`/api/weekly-notes/${nota.id}/sign`)
      .set(auth(tokenTec))
      .send({
        technician: {
          signerName: 'ZZ DEMO Bruno Sala',
          declarationAccepted: true,
          imagePng: PNG_FIRMA,
        },
        expectedUpdatedAt: nota.updatedAt,
      })
      .expect(201);

    expect(res.body.signed).toBe(true);
    const firmas = await ownerClient.noteSignature.findMany({ where: { noteId: nota.id } });
    expect(firmas).toHaveLength(1);
    expect(firmas[0].kind).toBe('technician');
    // El PDF se congela en el mismo acto: sin bytes no hay nada que descargar después.
    expect(await ownerClient.notePdf.count({ where: { noteId: nota.id } })).toBe(1);
  });

  // ── NOTA-08b: los comprobantes de gasto ──
  //
  // No tenian NI UNA prueba. Es la ruta por la que sube la foto del ticket desde el
  // movil de un tecnico, guarda bytes en Postgres y se cierra al firmar: exactamente
  // el sitio donde un fallo silencioso se descubre tarde y con datos reales dentro.

  it('sube, lista, devuelve los bytes y borra un comprobante', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    const subida = await http()
      .post(`/api/weekly-notes/${nota.id}/receipts`)
      .set(auth(tokenTec))
      .send({ label: 'Peaje', mimeType: 'image/jpeg', dataBase64: PNG_FIRMA })
      .expect(201);
    expect(subida.body).toHaveLength(1);
    const recibo = subida.body[0];
    expect(recibo.label).toBe('Peaje');
    // El listado NO trae los bytes: cuatro fotos para pintar cuatro nombres
    // multiplicarian por mil el peso de la pantalla.
    expect(recibo.bytes).toBeUndefined();
    expect(recibo.sizeBytes).toBeGreaterThan(0);

    const bytes = await http()
      .get(`/api/weekly-notes/${nota.id}/receipts/${recibo.id}`)
      .set(auth(tokenTec))
      .expect(200);
    expect(bytes.body.length).toBe(recibo.sizeBytes);

    // Andrea los ve para aprobar: el GET no es solo del tecnico.
    expect((await http().get(`/api/weekly-notes/${nota.id}/receipts`).set(auth(tokenAdmin)).expect(200)).body).toHaveLength(1);

    const tras = await http()
      .delete(`/api/weekly-notes/${nota.id}/receipts/${recibo.id}`)
      .set(auth(tokenTec))
      .expect(200);
    expect(tras.body).toHaveLength(0);
  });

  it('rechaza lo que no es imagen ni PDF, y lo que pesa de mas', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];
    const subir = (cuerpo: Record<string, unknown>, esperado: number) =>
      http().post(`/api/weekly-notes/${nota.id}/receipts`).set(auth(tokenTec)).send(cuerpo).expect(esperado);

    expect((await subir({ label: 'x', mimeType: 'text/html', dataBase64: PNG_FIRMA }, 400)).body.message)
      .toBe('TIPO_NO_ADMITIDO');
    expect((await subir({ label: 'x', mimeType: 'image/jpeg', dataBase64: '' }, 400)).body.message)
      .toBe('ARCHIVO_VACIO');
    // 2 MB es el tope del comprobante y 4 MB el del cuerpo JSON, asi que 2,5 MB entra
    // por el parser y lo rechaza el endpoint, que es lo que se quiere comprobar.
    const grande = Buffer.alloc(2.5 * 1024 * 1024, 7).toString('base64');
    expect((await subir({ label: 'x', mimeType: 'image/jpeg', dataBase64: grande }, 400)).body.message)
      .toBe('ARCHIVO_DEMASIADO_GRANDE');

    // Por encima del cuerpo JSON gana el parser y responde 413: no se puede validar un
    // cuerpo que no se llega a leer. El cliente lo traduce al MISMO mensaje que el 400
    // —ver codigoDeError en client.ts— para que el usuario lea una sola cosa.
    await subir({ label: 'x', mimeType: 'image/jpeg', dataBase64: Buffer.alloc(5 * 1024 * 1024, 7).toString('base64') }, 413);
  });

  it('una nota FIRMADA ya no admite comprobantes: el PDF esta congelado', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];
    await http()
      .post(`/api/weekly-notes/${nota.id}/sign`)
      .set(auth(tokenTec))
      .send({
        technician: { signerName: 'ZZ DEMO Bruno Sala', declarationAccepted: true, imagePng: PNG_FIRMA },
        expectedUpdatedAt: nota.updatedAt,
      })
      .expect(201);

    const res = await http()
      .post(`/api/weekly-notes/${nota.id}/receipts`)
      .set(auth(tokenTec))
      .send({ label: 'Tarde', mimeType: 'image/jpeg', dataBase64: PNG_FIRMA })
      .expect(409);
    expect(res.body.message).toBe('NOTA_FIRMADA');
  });

  // ── BIT-05: enviado = solo lectura ──

  it('al enviar, los días quedan bloqueados; al devolver, vuelven a ser editables', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    const escribir = (esperado: number) =>
      http()
        .put('/api/daily-entries/2026-03-02')
        .set(auth(tokenTec))
        .send({ projectId: p.id, orderId: null, conceptCode: 'DC', phase: null, description: 'otra cosa' })
        .expect(esperado);

    const bloqueada = await escribir(409);
    expect(bloqueada.body.message).toBe('JORNADA_BLOQUEADA');

    await http()
      .post(`/api/weekly-notes/${nota.id}/return`)
      .set(auth(tokenAdmin))
      .send({ reason: 'Corrige el miércoles' })
      .expect(201);

    // Devolver es exactamente esto: que el técnico pueda volver a tocarlo.
    await escribir(200);
  });

  // ── NOTA-02: las transiciones ──

  it('no se puede aprobar dos veces: la segunda es TRANSICION_INVALIDA', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    await http().post(`/api/weekly-notes/${nota.id}/approve`).set(auth(tokenAdmin)).expect(201);
    const res = await http().post(`/api/weekly-notes/${nota.id}/approve`).set(auth(tokenAdmin)).expect(409);
    expect(res.body.message).toBe('TRANSICION_INVALIDA_APPROVED_A_APPROVED');
  });

  it('dos admins aprobando a la vez: uno gana y el otro recibe 409, nunca doble aprobación', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    // Los dos leyeron el MISMO `updatedAt`: es el escenario real de dos pestañas.
    const visto = nota.updatedAt;
    await http()
      .post(`/api/weekly-notes/${nota.id}/approve`)
      .set(auth(tokenAdmin))
      .send({ expectedUpdatedAt: visto })
      .expect(201);

    const segundo = await http()
      .post(`/api/weekly-notes/${nota.id}/approve`)
      .set(auth(tokenAdmin2))
      .send({ expectedUpdatedAt: visto })
      .expect(409);
    expect(segundo.body.message).toBe('NOTA_MODIFICADA');

    const fila = await ownerClient.weeklyNote.findUniqueOrThrow({ where: { id: nota.id } });
    expect(fila.status).toBe('approved');
  });

  it('aprobar deja las jornadas de ESA nota en approved, y sólo las de esa nota', async () => {
    const a = await crearProyecto({ name: 'A' });
    const b = await crearProyecto({ name: 'B' });
    await jornada({ projectId: a.id, date: '2026-03-02' });
    await jornada({ projectId: b.id, date: '2026-03-03' });
    const [na] = (await enviar()).body.filter((n: { projectId: string }) => n.projectId === a.id);

    await http().post(`/api/weekly-notes/${na.id}/approve`).set(auth(tokenAdmin)).expect(201);

    const deA = await ownerClient.dailyEntry.findFirstOrThrow({ where: { projectId: a.id } });
    const deB = await ownerClient.dailyEntry.findFirstOrThrow({ where: { projectId: b.id } });
    expect(deA.status).toBe('approved');
    expect(deB.status).toBe('submitted');
  });

  // ── NOTA-03: devolver exige comentario ──

  it('devolver sin comentario → 400, y la nota NO se mueve', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    const res = await http()
      .post(`/api/weekly-notes/${nota.id}/return`)
      .set(auth(tokenAdmin))
      .send({ reason: '   ' })
      .expect(400);
    expect(res.body.message).toBe('COMENTARIO_REQUERIDO');
    expect((await ownerClient.weeklyNote.findUniqueOrThrow({ where: { id: nota.id } })).status).toBe('submitted');
  });

  it('el MOTOR también lo impide: un UPDATE suelto a returned sin comentario revienta', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    // El servicio podría tener un bug; el CHECK no. Es la misma defensa en profundidad
    // que el enum de conceptos.
    await expect(
      ownerClient.$executeRawUnsafe(
        `UPDATE "weekly_notes" SET "status" = 'returned' WHERE "id" = '${nota.id}'`,
      ),
    ).rejects.toThrow(/wn_devuelta_con_comentario|23514/);
  });

  it('el técnico ve el comentario de la devolución', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    await http()
      .post(`/api/weekly-notes/${nota.id}/return`)
      .set(auth(tokenAdmin))
      .send({ reason: 'Falta la firma del cliente' })
      .expect(201);

    const suyas = await notas(tokenTec);
    expect(suyas[0].returnComment).toBe('Falta la firma del cliente');
  });

  // ── RLS: la nota es del técnico ──

  it('un técnico NO ve las notas de otro (RLS, no un filtro del servicio)', async () => {
    const p = await crearProyecto();
    const otro = await crearTecnico({ fullName: 'Otro técnico' });
    await jornada({ projectId: p.id, date: '2026-03-02' });
    await jornada({ projectId: p.id, date: '2026-03-03', technicianId: otro.id });
    await enviar();
    await ownerClient.weeklyNote.create({
      data: { technicianId: otro.id, weekStart: new Date(`${LUNES}T00:00:00Z`), projectId: p.id, status: 'submitted' },
    });

    expect(await notas(tokenTec)).toHaveLength(1);
    // El admin las ve todas: el aislamiento es por técnico, no por rol.
    expect(await notas(tokenAdmin)).toHaveLength(2);
  });

  // ── AUD-01/02: el rastro ──

  it('cada transición deja su rastro con quién, qué cambió y el motivo', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];
    await http()
      .post(`/api/weekly-notes/${nota.id}/return`)
      .set(auth(tokenAdmin))
      .send({ reason: 'Sin descripción el jueves' })
      .expect(201);

    const { body } = await http()
      .get(`/api/audit?entity=weekly_note&entityId=${nota.id}`)
      .set(auth(tokenSuper))
      .expect(200);

    expect(body.map((r: { action: string }) => r.action)).toEqual(['return', 'submit']);
    expect(body[0]).toMatchObject({
      actorName: expect.any(String),
      before: { status: 'submitted' },
      after: { status: 'returned' },
      reason: 'Sin descripción el jueves',
    });
  });

  it('el audit_log es APPEND-ONLY por motor: el rol de la app no puede reescribirlo', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    await enviar();

    // Conectado como fava_app y con contexto de admin: aun así el motor se niega,
    // porque la tabla no tiene política de UPDATE ni de DELETE.
    const comoApp = async (sql: string) =>
      appClient.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.is_admin', 'on', TRUE)`);
        return tx.$executeRawUnsafe(sql);
      });

    await expect(comoApp(`UPDATE "audit_log" SET "reason" = 'reescrito'`)).rejects.toThrow();
    await expect(comoApp(`DELETE FROM "audit_log"`)).rejects.toThrow();
    expect(await ownerClient.auditLog.count()).toBe(1);
  });

  it('el visor es del Super Admin: un Admin raso recibe 403', async () => {
    await http().get('/api/audit').set(auth(tokenAdmin)).expect(403);
    await http().get('/api/audit').set(auth(tokenSuper)).expect(200);
  });

  // ── CAT-06 ──

  it('la baja avisa de las notas pendientes y aun así permite desactivar', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    await enviar();

    const antes = await http().get(`/api/technicians/${TEC_A}/pending-notes`).set(auth(tokenAdmin)).expect(200);
    expect(antes.body).toEqual({ count: 1 });

    // «Avisa y permite»: el servidor no bloquea, la UI advierte con este número.
    await http()
      .patch(`/api/technicians/${TEC_A}/active`)
      .set(auth(tokenAdmin))
      .send({ isActive: false })
      .expect(200);

    const rastro = await ownerClient.auditLog.findFirstOrThrow({
      where: { entity: 'technician', entityId: TEC_A },
    });
    expect(rastro.action).toBe('deactivate');
  });

  it('aprobar en nombre de otro queda registrado con el on_behalf_of', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];

    await http()
      .post(`/api/weekly-notes/${nota.id}/approve`)
      .set(auth(tokenAdmin))
      .send({ onBehalfOfId: TEC_B })
      .expect(201);

    const rastro = await ownerClient.auditLog.findFirstOrThrow({
      where: { entity: 'weekly_note', action: 'approve' },
    });
    expect(rastro.onBehalfOfId).toBe(TEC_B);
  });

  // ── Reabrir ──

  it('reabrir una nota aprobada es de Super Admin y exige motivo', async () => {
    const p = await crearProyecto();
    await jornada({ projectId: p.id, date: '2026-03-02' });
    const nota = (await enviar()).body[0];
    await http().post(`/api/weekly-notes/${nota.id}/approve`).set(auth(tokenAdmin)).expect(201);

    await http().post(`/api/weekly-notes/${nota.id}/reopen`).set(auth(tokenAdmin)).send({ reason: 'x' }).expect(403);
    await http().post(`/api/weekly-notes/${nota.id}/reopen`).set(auth(tokenSuper)).send({}).expect(400);

    await http()
      .post(`/api/weekly-notes/${nota.id}/reopen`)
      .set(auth(tokenSuper))
      .send({ reason: 'El cliente pidió corregir el total' })
      .expect(201);

    // Reabrir devuelve el día a editable, que es el sentido de reabrir.
    const dia = await ownerClient.dailyEntry.findFirstOrThrow({ where: { projectId: p.id } });
    expect(dia.status).toBe('draft');
  });
});
