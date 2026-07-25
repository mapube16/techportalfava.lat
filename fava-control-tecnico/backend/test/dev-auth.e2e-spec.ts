/**
 * Login de desarrollo temporal (Plan 01-07): lo que hay que demostrar no es que
 * funcione encendido, sino que APAGADO no deja rastro.
 *
 * Por eso esta suite levanta DOS apps del mismo codigo:
 *  - la de siempre, sin las variables y SIN sustituir el provider JWKS (o el
 *    test se probaria a si mismo): la ruta no existe y un token de desarrollo
 *    autentico, emitido por la otra app, no vale nada;
 *  - la del modo encendido, que necesita un registro de modulos nuevo porque el
 *    flag se lee al REGISTRAR el modulo, no al atender la peticion.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EnvService, env, loadEnv } from '../src/config/env';
import { crearUsuario } from './helpers/app';
import { disconnectAll, truncateAll } from './helpers/db';
import { API_AUDIENCE, SCOPE, TENANT_A } from './helpers/tokens';

const PASSWORD = 'contrasena-de-desarrollo-larga';
const EMAIL = 'dev.login@fava.local';
const INACTIVO = 'dev.inactivo@fava.local';

/** Mismo tenant y audiencia ficticios que el resto de la suite (nunca los reales). */
const envTest = (base: typeof env) => ({
  ...base,
  ENTRA_TENANT_ID: TENANT_A,
  ENTRA_API_CLIENT_ID: API_AUDIENCE,
  ENTRA_REQUIRED_SCOPE: SCOPE,
});

/** App con el modo apagado: el provider JWKS real (el remoto de Microsoft). */
async function crearAppApagada(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvService)
    .useValue(envTest(env))
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

/**
 * App con el modo encendido. `jest.resetModules()` + imports dinamicos porque
 * `env.DEV_AUTH_ENABLED` se evalua al construir el decorador @Module. Todo se
 * reimporta del registro nuevo: mezclar dos copias de @nestjs/core rompe el DI.
 */
async function crearAppEncendida(): Promise<INestApplication> {
  jest.resetModules();
  process.env.DEV_AUTH_ENABLED = 'true';
  process.env.DEV_AUTH_PASSWORD = PASSWORD;
  const { Test: TestDev } = await import('@nestjs/testing');
  const { AppModule: AppModuleDev } = await import('../src/app.module');
  const { EnvService: EnvServiceDev, env: envDev } = await import('../src/config/env');

  const moduleRef = await TestDev.createTestingModule({ imports: [AppModuleDev] })
    .overrideProvider(EnvServiceDev)
    .useValue(envTest(envDev))
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('login de desarrollo (AUTH-01)', () => {
  let apagada: INestApplication;
  let encendida: INestApplication;

  beforeAll(async () => {
    // La apagada PRIMERO: se construye con el registro que aun no vio el flag.
    apagada = await crearAppApagada();
    encendida = await crearAppEncendida();
  });

  beforeEach(async () => {
    await truncateAll();
    await crearUsuario({ email: EMAIL, displayName: 'Dev Login', roles: ['T', 'A'] });
    await crearUsuario({ email: INACTIVO, displayName: 'Dev Inactivo', isActive: false });
  });

  afterAll(async () => {
    await apagada?.close();
    await encendida?.close();
    await disconnectAll();
    // El worker de Jest es compartido con las demas suites: no dejar el flag puesto.
    delete process.env.DEV_AUTH_ENABLED;
    delete process.env.DEV_AUTH_PASSWORD;
  });

  const login = (app: INestApplication, body: object) =>
    request(app.getHttpServer()).post('/api/dev-auth/login').send(body);

  const me = (app: INestApplication, token: string) =>
    request(app.getHttpServer()).get('/api/me').set('authorization', `Bearer ${token}`);

  const tokenDeDesarrollo = async () => {
    const res = await login(encendida, { email: EMAIL, password: PASSWORD }).expect(200);
    return res.body.access_token as string;
  };

  describe('apagado no deja rastro', () => {
    it('la ruta de login no existe: 404, no 401', async () => {
      const res = await login(apagada, { email: EMAIL, password: PASSWORD });
      expect(res.status).toBe(404);
    });

    it('un token de desarrollo autentico → 401 (el keyset local no esta cargado)', async () => {
      // Emitido por la app encendida y valido alli mismo: lo unico que cambia es
      // que esta app resuelve las claves contra Microsoft, donde ese kid no esta.
      const token = await tokenDeDesarrollo();
      await me(encendida, token).expect(200);
      await me(apagada, token).expect(401);
    });
  });

  describe('encendido: la sesion es real, no una simulada', () => {
    it('contrasena correcta → token que el EntraGuard acepta, con los roles de la BD', async () => {
      const res = await login(encendida, { email: EMAIL, password: PASSWORD }).expect(200);
      expect(res.body.expires_in).toBeGreaterThan(0);

      const perfil = await me(encendida, res.body.access_token).expect(200);
      expect(perfil.body.status).toBe('ok');
      expect(perfil.body.user.email).toBe(EMAIL);
      expect(perfil.body.user.roles).toEqual(['T', 'A']);
    });

    it('el email no distingue mayusculas ni espacios y el segundo login sigue valiendo', async () => {
      await login(encendida, { email: `  ${EMAIL.toUpperCase()} `, password: PASSWORD }).expect(200);
      // El primer login vinculo un oid `dev:<id>`; el segundo tiene que encontrarlo.
      const segundo = await login(encendida, { email: EMAIL, password: PASSWORD }).expect(200);
      const perfil = await me(encendida, segundo.body.access_token).expect(200);
      expect(perfil.body.status).toBe('ok');
    });
  });

  describe('un unico 401: el error no dice que fallo', () => {
    it('contrasena incorrecta, email inexistente y usuario desactivado son indistinguibles', async () => {
      const mala = await login(encendida, { email: EMAIL, password: 'otra-cosa-larga' }).expect(401);
      const nadie = await login(encendida, { email: 'nadie@fava.local', password: PASSWORD }).expect(401);
      const baja = await login(encendida, { email: INACTIVO, password: PASSWORD }).expect(401);

      expect(mala.body).toEqual(nadie.body);
      expect(baja.body).toEqual(nadie.body);
      expect(JSON.stringify(nadie.body)).not.toMatch(/email|password|activ/i);
    });

    it('cuerpo vacio o sin contrasena → 401, nunca un 500', async () => {
      await login(encendida, {}).expect(401);
      await login(encendida, { email: EMAIL }).expect(401);
      await login(encendida, { email: EMAIL, password: '' }).expect(401);
    });
  });

  describe('arranque', () => {
    const base = {
      DATABASE_URL: 'postgresql://x',
      MIGRATE_DATABASE_URL: 'postgresql://x',
      APP_DB_PASSWORD: 'x',
      ENTRA_TENANT_ID: TENANT_A,
      ENTRA_API_CLIENT_ID: API_AUDIENCE,
      SEED_SUPERADMIN_EMAIL: 'admin@fava.local',
    };

    it('modo encendido sin contrasena, o con una debil → el proceso no arranca', () => {
      expect(() => loadEnv({ ...base, DEV_AUTH_ENABLED: 'true' })).toThrow(/DEV_AUTH_PASSWORD/);
      expect(() => loadEnv({ ...base, DEV_AUTH_ENABLED: 'true', DEV_AUTH_PASSWORD: 'corta' })).toThrow(
        /DEV_AUTH_PASSWORD/,
      );
      expect(() =>
        loadEnv({ ...base, DEV_AUTH_ENABLED: 'true', DEV_AUTH_PASSWORD: PASSWORD }),
      ).not.toThrow();
    });

    it('un valor que no es exactamente true o false tampoco arranca', () => {
      expect(() => loadEnv({ ...base, DEV_AUTH_ENABLED: 'TRUE' })).toThrow(/DEV_AUTH_ENABLED/);
      expect(() => loadEnv({ ...base, DEV_AUTH_ENABLED: '1' })).toThrow(/DEV_AUTH_ENABLED/);
      expect(loadEnv(base).DEV_AUTH_ENABLED).toBe(false);
      expect(loadEnv({ ...base, DEV_AUTH_ENABLED: 'false' }).DEV_AUTH_ENABLED).toBe(false);
    });
  });
});
