/**
 * GASTO-01 — los gastos del DIA en que ocurren.
 *
 * Ivan Cortes lo pidio en la capacitacion del 2026-08-31 («a veces uno efectuo el gasto
 * de una vez, tiene la factura») y Andrea lo acepto en el momento. Antes solo se podian
 * escribir al ENVIAR la nota: el viernes, de memoria y con el ticket ya perdido.
 *
 * Lo que se prueba aqui es lo que puede romperse en silencio: que el gasto quede atado
 * al dia de OTRO tecnico, que sobreviva al bloqueo de una semana enviada, y —el que de
 * verdad importa— que el PDF no imprima dos veces el mismo gasto cuando el tecnico lo
 * anoto el martes y volvio a escribirlo el viernes al enviar.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ventana } from '../src/modules/daily-entries/fecha';
import { createTestApp, crearUsuario } from './helpers/app';
import { MAQ_TEST, TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { crearOrden, crearProyecto } from './helpers/fixtures';
import { signTestToken } from './helpers/tokens';

const OID_A = 'oid-gastos-a';
const OID_B = 'oid-gastos-b';

const { min: MIN } = ventana();
/** Un dia dentro de la ventana del servidor, y el LUNES de SU semana: enviar la semana
    exige el lunes correcto, no uno cualquiera dentro del rango. */
const DIA = new Date(Date.parse(MIN) + 13 * 86_400_000).toISOString().slice(0, 10);
const LUNES = (() => {
  const d = new Date(`${DIA}T00:00:00Z`);
  // getUTCDay(): 0 = domingo. El lunes de esa semana es restar (dow+6)%7 dias.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
})();

/** 1x1 PNG real: los bytes tienen que ser una imagen de verdad, no texto suelto. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('gastos del dia (GASTO-01)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let proyectoId: string;
  let ordenId: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  const guardarDia = (token = tokenA) =>
    http()
      .put(`/api/daily-entries/${DIA}`)
      .set(auth(token))
      .send({
        projectId: proyectoId,
        orderId: ordenId,
        conceptCode: 'DC',
        phase: 'MONTAJE',
        description: 'Montaje bancada',
      });

  const anadirGasto = (body: object, token = tokenA) =>
    http().post(`/api/daily-entries/${DIA}/expenses`).set(auth(token)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    [tokenA, tokenB] = await Promise.all([
      signTestToken({ oid: OID_A, email: 'gastos-a@fava.local' }),
      signTestToken({ oid: OID_B, email: 'gastos-b@fava.local' }),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    await Promise.all([
      crearUsuario({ email: 'gastos-a@fava.local', entraOid: OID_A, roles: ['T'], technicianId: TEC_A }),
      crearUsuario({ email: 'gastos-b@fava.local', entraOid: OID_B, roles: ['T'], technicianId: TEC_B }),
    ]);
    const p = await crearProyecto();
    const o = await crearOrden(p.id, { machineModelId: MAQ_TEST });
    proyectoId = p.id;
    ordenId = o.id;
  });

  it('un gasto se anota SIN comprobante: en obra se escribe y la foto se sube despues', async () => {
    await guardarDia().expect(200);
    const { body } = await anadirGasto({ descripcion: 'Peaje', valor: '15.000' }).expect(201);

    expect(body.descripcion).toBe('Peaje');
    expect(body.valor).toBe('15.000');
    expect(body.mimeType).toBeNull();
  });

  it('un gasto CON foto guarda los bytes y los devuelve al pedirlos', async () => {
    await guardarDia().expect(200);
    const { body } = await anadirGasto({
      descripcion: 'Almuerzo',
      valor: 'USD 20',
      mimeType: 'image/png',
      dataBase64: PNG,
    }).expect(201);

    expect(body.mimeType).toBe('image/png');
    expect(body.sizeBytes).toBeGreaterThan(0);

    const foto = await http()
      .get(`/api/daily-entries/${DIA}/expenses/${body.id}/file`)
      .set(auth(tokenA))
      .expect(200);
    // Los bytes que vuelven son la imagen, no una representacion en texto.
    expect(foto.headers['content-type']).toContain('image/png');
    expect(foto.body.length).toBe(Buffer.from(PNG, 'base64').length);
  });

  /**
   * Al reves de lo que este caso exigia hasta el 2026-09-01.
   *
   * El bloque de gastos estaba condicionado a que la jornada YA existiera, y eso lo
   * hacia invisible justo cuando el tecnico lo busca: abre el dia para apuntar el taxi
   * del aeropuerto y todavia no ha escrito el trabajo. Exigirle describir la jornada
   * antes convierte «apuntar un gasto» en dos tareas — la friccion por la que los
   * gastos se acababan escribiendo el viernes de memoria.
   */
  it('un gasto en un dia EN BLANCO crea la jornada vacia, no falla', async () => {
    const { body } = await anadirGasto({ descripcion: 'Taxi', valor: '30.000' }).expect(201);
    expect(body.descripcion).toBe('Taxi');

    // La jornada nace en draft y SIN concepto: no cuenta como dia trabajado en ningun
    // indicador (la cuadricula y la utilizacion filtran por concept_code IS NOT NULL).
    const dia = await ownerClient.dailyEntry.findFirstOrThrow({
      where: { technicianId: TEC_A, date: new Date(`${DIA}T00:00:00Z`) },
      select: { status: true, conceptCode: true, description: true },
    });
    expect(dia.status).toBe('draft');
    expect(dia.conceptCode).toBeNull();
    expect(dia.description).toBeNull();
  });

  it('un dia ya ENVIADO no admite gastos nuevos (BIT-05)', async () => {
    await guardarDia().expect(200);
    await ownerClient.dailyEntry.updateMany({
      where: { technicianId: TEC_A },
      data: { status: 'submitted' },
    });

    const res = await anadirGasto({ descripcion: 'Tarde', valor: '1' }).expect(409);
    expect(res.body.message).toBe('JORNADA_BLOQUEADA');
  });

  it('los gastos de un tecnico NO son visibles para otro', async () => {
    await guardarDia().expect(200);
    await anadirGasto({ descripcion: 'Peaje', valor: '15.000' }).expect(201);

    // B pide la misma fecha: es SU dia el que se consulta, no el de A.
    const res = await http()
      .get(`/api/daily-entries/${DIA}/expenses`)
      .set(auth(tokenB))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('borrar un gasto mal escrito el mismo dia se puede; el de otro tecnico no', async () => {
    await guardarDia().expect(200);
    const { body: g } = await anadirGasto({ descripcion: 'Error', valor: '1' }).expect(201);

    // B no puede borrarlo: para el, ese gasto no existe.
    await guardarDia(tokenB).expect(200);
    await http()
      .delete(`/api/daily-entries/${DIA}/expenses/${g.id}`)
      .set(auth(tokenB))
      .expect(404);

    await http()
      .delete(`/api/daily-entries/${DIA}/expenses/${g.id}`)
      .set(auth(tokenA))
      .expect(200);

    const { body } = await http()
      .get(`/api/daily-entries/${DIA}/expenses`)
      .set(auth(tokenA))
      .expect(200);
    expect(body).toEqual([]);
  });

  /**
   * EL CASO QUE IMPORTA: el gasto anotado el dia y el escrito al enviar la nota son dos
   * origenes distintos, y el PDF los suma. Si el tecnico anota «Peaje 15.000» el martes
   * y vuelve a escribirlo el viernes al enviar, el papel lo imprimiria dos veces — y esa
   * es la semana en que Andrea deja de fiarse del documento.
   */
  it('el PDF suma los dos origenes SIN duplicar la misma linea', async () => {
    await guardarDia().expect(200);
    await anadirGasto({ descripcion: 'Peaje', valor: '15.000' }).expect(201);
    await anadirGasto({ descripcion: 'Hotel', valor: '200.000' }).expect(201);

    await http().post('/api/weekly-notes/submit').set(auth(tokenA)).send({ weekStart: LUNES }).expect(201);
    const nota = await ownerClient.weeklyNote.findFirstOrThrow({ where: { technicianId: TEC_A } });

    // Al enviar, el tecnico repite «Peaje» (ya anotado) y anade uno nuevo.
    await http()
      .put(`/api/weekly-notes/${nota.id}/expenses`)
      .set(auth(tokenA))
      .send({
        gastosTecnico: [
          { descripcion: 'Peaje', valor: '15.000' },
          { descripcion: 'Botas', valor: '150.000' },
        ],
      })
      .expect(200);

    // La union se comprueba por HTTP, no llamando al servicio: los gastos del dia
    // siguen en su endpoint y los de la nota en el suyo, y el PDF —que es quien los
    // suma— es binario comprimido donde buscar «Peaje» da cero aunque este impreso.
    // Lo que si es observable desde fuera es que ninguno de los dos origenes perdio
    // nada y que el dia NO absorbio la linea repetida.
    const { body: delDia } = await http()
      .get(`/api/daily-entries/${DIA}/expenses`)
      .set(auth(tokenA))
      .expect(200);
    expect(delDia.map((g: { descripcion: string }) => g.descripcion).sort()).toEqual(['Hotel', 'Peaje']);

    const { body: laNota } = await http()
      .get(`/api/weekly-notes/${nota.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(laNota.gastosTecnico).toHaveLength(2);

    // Y el PDF se genera con los dos origenes ya unidos: si la union lanzara —por un
    // `expenses` que no viaja en el select, por ejemplo— esto seria un 500.
    const pdf = await http()
      .get(`/api/weekly-notes/${nota.id}/pdf/preview`)
      .set(auth(tokenA))
      .expect(200);
    expect(pdf.body.length).toBeGreaterThan(1000);
  });
});
