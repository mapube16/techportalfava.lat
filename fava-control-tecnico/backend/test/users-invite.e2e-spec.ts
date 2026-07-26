/**
 * CAT-05, las dos piezas que la Fase 1 no dejo hechas: invitar un usuario y
 * vincularlo a un tecnico.
 *
 * La escalada de roles NO se reprueba aqui en todas sus formas (eso es
 * `users-roles.e2e-spec.ts`, AUTH-02): lo que se prueba es que POST /api/users
 * pasa por la MISMA regla y no por una copia relajada.
 */
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS } from '../src/common/auth/jwks.provider';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EnvService, env } from '../src/config/env';
import { crearUsuario } from './helpers/app';
import { TEC_A, TEC_B, disconnectAll, ownerClient, truncateAll } from './helpers/db';
import { API_AUDIENCE, SCOPE, TENANT_A, localJwks, signTestToken } from './helpers/tokens';

const OID_SUPER = 'oid-inv-super';
const OID_ADMIN = 'oid-inv-admin';
const OID_TEC = 'oid-inv-tec';
const TEC_FANTASMA = '99999999-9999-4999-8999-999999999999';

/**
 * Sonda SOLO de test: la unica forma de comprobar el camino completo
 * endpoint → columna → guard → interceptor → politica antes de que la Fase 3
 * estrene los endpoints de bitacora. No se registra en `app.module.ts` y no
 * existe en produccion; lee por `prisma.client`, es decir por la transaccion con
 * las GUCs que abre RlsInterceptor. Sin @Roles: entra cualquier usuario activo.
 */
@Controller('api/_sonda-bitacora')
class SondaBitacoraController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  mias() {
    return this.prisma.client.dailyEntry.findMany({ select: { technicianId: true } });
  }
}

/** Copia de `createTestApp()` con la sonda. No se toca helpers/app.ts: es de la Fase 1. */
async function appConSonda(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [SondaBitacoraController],
  })
    .overrideProvider(JWKS)
    .useValue(await localJwks())
    .overrideProvider(EnvService)
    .useValue({
      ...env,
      ENTRA_TENANT_ID: TENANT_A,
      ENTRA_API_CLIENT_ID: API_AUDIENCE,
      ENTRA_REQUIRED_SCOPE: SCOPE,
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('users: invitacion y vinculo con tecnico (CAT-05)', () => {
  let app: INestApplication;
  let tokenSuper: string;
  let tokenAdmin: string;
  let tokenTec: string;
  let ids: { super: string; admin: string; tec: string };

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await appConSonda();
    tokenSuper = await signTestToken({ oid: OID_SUPER, email: 'super@fava.local' });
    tokenAdmin = await signTestToken({ oid: OID_ADMIN, email: 'admin@fava.local' });
    tokenTec = await signTestToken({ oid: OID_TEC, email: 'tec@fava.local' });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectAll();
  });

  beforeEach(async () => {
    await truncateAll();
    const [s, a, t] = await Promise.all([
      crearUsuario({ email: 'super@fava.local', entraOid: OID_SUPER, roles: ['T', 'A', 'S'] }),
      crearUsuario({ email: 'admin@fava.local', entraOid: OID_ADMIN, roles: ['A'] }),
      crearUsuario({ email: 'tec@fava.local', entraOid: OID_TEC, roles: ['T'] }),
    ]);
    ids = { super: s.id, admin: a.id, tec: t.id };
  });

  const enBd = (email: string) => ownerClient.user.findUnique({ where: { email } });

  it('un Admin invita a un tecnico → 201 con entra_oid null y activo', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'nuevo@fava.local', displayName: 'Tecnico Nuevo', roles: ['T'] })
      .expect(201);

    expect(res.body).toMatchObject({
      email: 'nuevo@fava.local',
      displayName: 'Tecnico Nuevo',
      roles: ['T'],
      isActive: true,
    });

    // entra_oid null a proposito: la identidad definitiva la fija el primer login
    // real por coincidencia de email (EntraGuard.vincular, patron de 01-03).
    const fila = await enBd('nuevo@fava.local');
    expect(fila?.entraOid).toBeNull();
    expect(fila?.isActive).toBe(true);
  });

  it('el email se guarda normalizado (trim + minusculas), igual que en seed.ts', async () => {
    await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: '  Nombre@Fava.Local ', displayName: 'Con Mayusculas' })
      .expect(201);

    // Sin esta normalizacion el invitado nunca vincula su login: el guard
    // normaliza el claim `email` del token antes de buscar la fila.
    expect(await enBd('nombre@fava.local')).not.toBeNull();
  });

  it('sin roles en el body, el invitado queda como Tecnico', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'pordefecto@fava.local', displayName: 'Por Defecto' })
      .expect(201);

    expect(res.body.roles).toEqual(['T']);
  });

  it('un Admin que invita a un Admin → 403 (misma regla que PATCH /:id/roles)', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'escalada@fava.local', displayName: 'Escalada', roles: ['T', 'A'] })
      .expect(403);

    expect(res.body.message).toBe('SOLO_SUPER_ADMIN_ASIGNA_ADMIN');
    expect(await enBd('escalada@fava.local')).toBeNull();
  });

  it('un Super Admin invita a un Admin → 201', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenSuper))
      .send({ email: 'otroadmin@fava.local', displayName: 'Otro Admin', roles: ['T', 'A'] })
      .expect(201);

    expect(res.body.roles).toEqual(['T', 'A']);
  });

  it('email ya registrado → 409, no un 500 del constraint unico', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'admin@fava.local', displayName: 'Duplicado' })
      .expect(409);

    expect(res.body.message).toBe('EMAIL_YA_REGISTRADO');
  });

  it.each([
    ['email sin arroba', { email: 'no-es-un-email', displayName: 'Malo' }],
    ['email vacio', { email: '   ', displayName: 'Malo' }],
    ['sin email', { displayName: 'Malo' }],
    ['displayName vacio', { email: 'ok@fava.local', displayName: '  ' }],
    ['sin displayName', { email: 'ok@fava.local' }],
    ['roles invalidos', { email: 'ok@fava.local', displayName: 'Malo', roles: ['X'] }],
    ['roles vacios', { email: 'ok@fava.local', displayName: 'Malo', roles: [] }],
  ])('body invalido (%s) → 400', async (_caso, body) => {
    await http().post('/api/users').set(auth(tokenAdmin)).send(body).expect(400);
  });

  it('un tecnico raso no invita a nadie → 403', async () => {
    await http()
      .post('/api/users')
      .set(auth(tokenTec))
      .send({ email: 'colado@fava.local', displayName: 'Colado' })
      .expect(403);

    expect(await enBd('colado@fava.local')).toBeNull();
  });

  it('el invitado vincula su cuenta en el primer login por coincidencia de email', async () => {
    await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'invitado@fava.local', displayName: 'Invitado' })
      .expect(201);

    // Token de un OID que la app no ha visto nunca, con el email de la invitacion.
    const tokenInvitado = await signTestToken({
      oid: 'oid-recien-llegado',
      email: 'invitado@fava.local',
    });

    const yo = await http().get('/api/me').set(auth(tokenInvitado)).expect(200);
    expect(yo.body.status).toBe('ok');
    expect(yo.body.user.email).toBe('invitado@fava.local');

    // La invitacion no fija identidad; el login si, y ya es definitiva.
    expect((await enBd('invitado@fava.local'))?.entraOid).toBe('oid-recien-llegado');
  });

  // ─── PATCH /api/users/:id/technician ───────────────────────────────────────
  // De `users.technician_id` sale la GUC `app.technician_id`. Hasta este plan la
  // columna existia y nadie la escribia: la Fase 3 habria arrancado con todos los
  // tecnicos viendo cero registros propios.

  const vincular = (id: string, technicianId: string | null, token = tokenAdmin) =>
    http().patch(`/api/users/${id}/technician`).set(auth(token)).send({ technicianId });

  it('un Admin vincula un usuario a un tecnico → 200 y GET /api/users lo devuelve', async () => {
    const res = await vincular(ids.tec, TEC_A).expect(200);
    expect(res.body.technicianId).toBe(TEC_A);

    const lista = await http().get('/api/users').set(auth(tokenAdmin)).expect(200);
    expect(lista.body.find((u: { id: string }) => u.id === ids.tec).technicianId).toBe(TEC_A);
  });

  it('el usuario vinculado ve su technicianId en GET /api/me (precondicion de la Fase 3)', async () => {
    await vincular(ids.tec, TEC_A).expect(200);

    const yo = await http().get('/api/me').set(auth(tokenTec)).expect(200);
    expect(yo.body.user.technicianId).toBe(TEC_A);
  });

  it('technicianId null desvincula → 200', async () => {
    await vincular(ids.tec, TEC_A).expect(200);

    const res = await vincular(ids.tec, null).expect(200);
    expect(res.body.technicianId).toBeNull();
    expect((await ownerClient.user.findUnique({ where: { id: ids.tec } }))?.technicianId).toBeNull();
  });

  it('un tecnico ya vinculado a otro usuario → 409, no un 500 del @unique', async () => {
    await vincular(ids.tec, TEC_A).expect(200);

    const res = await vincular(ids.admin, TEC_A).expect(409);
    expect(res.body.message).toBe('TECNICO_YA_VINCULADO');

    // Desvincular primero si es lo que se quiere: el vinculo es 1-a-1 por motor.
    await vincular(ids.tec, null).expect(200);
    await vincular(ids.admin, TEC_A).expect(200);
  });

  it('un technicianId inexistente → 400 con codigo propio, no un 500 de FK', async () => {
    const res = await vincular(ids.tec, TEC_FANTASMA).expect(400);
    expect(res.body.message).toBe('TECNICO_INEXISTENTE');
  });

  it('un technicianId que no es uuid → 400 (nunca un 22P02)', async () => {
    await vincular(ids.tec, 'no-es-un-uuid').expect(400);
    await http().patch(`/api/users/${ids.tec}/technician`).set(auth(tokenAdmin)).send({}).expect(400);
  });

  it('un tecnico raso no vincula a nadie → 403', async () => {
    await vincular(ids.super, TEC_A, tokenTec).expect(403);
  });

  it('el POST comparte el traductor: invitar con un tecnico ya vinculado → 409', async () => {
    await vincular(ids.tec, TEC_A).expect(200);

    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'conflicto@fava.local', displayName: 'Conflicto', technicianId: TEC_A })
      .expect(409);

    expect(res.body.message).toBe('TECNICO_YA_VINCULADO');
    expect(await enBd('conflicto@fava.local')).toBeNull();
  });

  it('invitar con technicianId deja el vinculo hecho de una sola peticion', async () => {
    const res = await http()
      .post('/api/users')
      .set(auth(tokenAdmin))
      .send({ email: 'conmi@fava.local', displayName: 'Con Tecnico', technicianId: TEC_B })
      .expect(201);

    expect(res.body.technicianId).toBe(TEC_B);
  });

  /**
   * El caso que justifica todo el plan. No basta con que la columna se escriba: hay
   * que ver la GUC actuando. Antes de vincular, la peticion del tecnico corre con
   * `app.technician_id` vacio y la politica `de_self` no le deja ver NADA; despues,
   * ve exactamente sus 5 jornadas y ninguna de las 3 del otro tecnico.
   */
  it('tras vincular, la peticion del usuario corre con app.technician_id fijado', async () => {
    const dia = (n: number) => new Date(Date.UTC(2026, 2, n));
    await ownerClient.dailyEntry.createMany({
      data: [
        ...[1, 2, 3, 4, 5].map((n) => ({ technicianId: TEC_A, date: dia(n) })),
        ...[1, 2, 3].map((n) => ({ technicianId: TEC_B, date: dia(n) })),
      ],
    });

    const sinVinculo = await http().get('/api/_sonda-bitacora').set(auth(tokenTec)).expect(200);
    expect(sinVinculo.body).toEqual([]);

    await vincular(ids.tec, TEC_A).expect(200);

    const conVinculo = await http().get('/api/_sonda-bitacora').set(auth(tokenTec)).expect(200);
    expect(conVinculo.body).toHaveLength(5);
    expect(conVinculo.body.every((e: { technicianId: string }) => e.technicianId === TEC_A)).toBe(
      true,
    );
    // El conteo se compara con el del owner y no con «> 0»: es la unica forma de
    // detectar el fallo silencioso de la lista vacia (patron de 01-02).
    expect(await ownerClient.dailyEntry.count()).toBe(8);
  });
});
