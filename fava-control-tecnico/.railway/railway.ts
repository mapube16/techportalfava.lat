/**
 * Infraestructura como codigo. Sustituye a `railway.toml` (Config as Code), que Railway
 * marco como deprecado: los archivos existentes se siguen leyendo hasta el 2026-12-01,
 * pero los servicios NUEVOS ya no pueden usarlo. Por eso el cron de los avisos tiene que
 * nacer aqui y no en un segundo `railway.toml`.
 *
 * ESCRITO A MANO, y no con `railway config migrate`. La migracion automatica traduce el
 * `railway.toml` dejando DOS ajustes como comentario en vez de convertirlos:
 *
 *     // builder from CaC: "RAILPACK"
 *     // preDeployCommand from CaC: "npm -w backend run db:migrate"
 *
 * El segundo es el que corre `prisma migrate deploy` antes de promocionar cada deploy.
 * Si se pierde, las migraciones dejan de aplicarse en produccion y no hay ningun sintoma
 * hasta que una consulta falla contra una columna que no existe. El DSL SI lo soporta
 * (`deploy.preDeployCommand`), asi que aqui va explicito.
 *
 * COMO SE APLICA (no se aplica solo en cada push, a diferencia del toml):
 *     railway config plan     preview, no toca nada
 *     railway config apply    lo escribe en Railway
 *
 * OJO EN WINDOWS: el paquete `railway/iac` comprueba la version del CLI ejecutando
 * `process.env._`, que con npm apunta a un lanzador JS y no al binario. Si sale
 * «requires Railway CLI 5.42.1 or newer» teniendo una mas nueva, es eso:
 *     $env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"
 */
import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

const REPO = 'mapube16/techportalfava.lat';
/** El monorepo vive un nivel por debajo de la raiz del repositorio. */
const RAIZ = '/fava-control-tecnico';

export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: 'europe-west4-drams3a' });

  // Tres volumenes de 5 GB y solo UNO montado (el de Postgres). Los otros dos son
  // restos de intentos anteriores y siguen facturando. Se declaran para que `plan` no
  // los destruya por accidente; borrarlos es una decision deliberada y se hace desde el
  // dashboard, igual que se hizo con el servicio vacio que quedo de un `railway init`.
  const vol = (n: string) =>
    volume(n, {
      alerts: { usage: { '100': {}, '80': {}, '95': {} } },
      allowOnlineResize: true,
      region: 'europe-west4-drams3a',
      sizeMB: 5000,
    });
  const postgresVolume9o7j = vol('postgres-volume-9o7j');
  const postgresVolume2b3M = vol('postgres-volume-2b3M');
  const postgresVolume = vol('postgres-volume');

  /** La aplicacion. Nest sirve el frontend estatico: un solo servicio, sin CORS. */
  const app = service('techportalfava.lat', {
    source: github(REPO, { checkSuites: false, rootDirectory: RAIZ }),
    // `npm run build` de la raiz = los tres guarda-railes + vite + prisma + nest.
    build: 'npm run build',
    start: 'npm start',
    deploy: {
      // Corre entre build y deploy, en un contenedor aparte. Si falla, Railway no
      // promociona y la version anterior sigue sirviendo.
      preDeployCommand: ['npm -w backend run db:migrate'],
      // /health es la unica ruta @Public() y no consulta la base: mide que el proceso
      // vive, no que Postgres responde.
      healthcheckPath: '/health',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 3,
      // Una sola instancia a proposito: el rate limit de @nestjs/throttler es en
      // memoria, asi que N replicas multiplican el limite por N.
      numReplicas: 1,
    },
    replicas: { 'europe-west4-drams3a': 1 },
    domains: ['www.techportalfava.lat'],
    networking: { privateNetworkEndpoint: 'techportalfavalat' },
    // `preserve()` = el valor sigue viviendo en el dashboard y este archivo no lo pisa
    // ni lo expone. Que existan y como se obtienen esta en docs/ENV.md.
    env: {
      APP_BASE_URL: preserve(),
      APP_DB_PASSWORD: preserve(),
      DATABASE_URL: preserve(),
      DEV_AUTH_ENABLED: preserve(),
      DEV_AUTH_PASSWORD: preserve(),
      ENTRA_API_CLIENT_ID: preserve(),
      ENTRA_CLIENT_SECRET: preserve(),
      ENTRA_MAIL_CLIENT_ID: preserve(),
      ENTRA_REQUIRED_SCOPE: preserve(),
      ENTRA_TENANT_ID: preserve(),
      MIGRATE_DATABASE_URL: preserve(),
      NOTIF_FROM: preserve(),
      NPM_CONFIG_INCLUDE: preserve(),
      SEED_SUPERADMIN_EMAIL: preserve(),
      VITE_API_SCOPE: preserve(),
      VITE_DEV_AUTH: preserve(),
      VITE_ENTRA_SPA_CLIENT_ID: preserve(),
      VITE_ENTRA_TENANT_ID: preserve(),
    },
  });

  /**
   * El cron de los avisos (Fase 9). Servicio aparte y no un cron dentro de la app:
   * `numReplicas` esta en 1 hoy, pero el dia que alguien lo suba, un cron in-process
   * mandaria cada aviso N veces y no hay nada en el codigo que lo impida.
   *
   * Comparte doce variables con la app, duplicadas en Railway (ver el bloque `env`).
   * Al rotar el secreto de Graph hay que cambiarlo en LOS DOS servicios.
   */
  const avisos = service('avisos-cron', {
    source: github(REPO, { checkSuites: false, rootDirectory: RAIZ }),
    // Solo el backend: este servicio no sirve el frontend, y compilar vite aqui son
    // 40 s por deploy para producir algo que nadie pide. Se conserva el guarda-rail de
    // fechas porque este servicio es justo el que decide «de que semana hablamos».
    build: 'npm run check:fecha-servidor && npm -w backend run build',
    start: 'npm -w backend run notificar',
    deploy: {
      // En UTC (Railway no acepta zona aqui). La hora de verdad la decide NOTIF_TZ
      // dentro del proceso. Doce evaluaciones por hora son inofensivas: la unique
      // `dedupe_key` absorbe las repeticiones en el motor.
      cronSchedule: '*/5 * * * *',
      // Un cron termina. Sin esto Railway lo reiniciaria en bucle al salir con exito.
      restartPolicyType: 'NEVER',
      numReplicas: 1,
      // SIN preDeployCommand a proposito: las migraciones las corre el servicio `app`.
      // Dos servicios lanzando `migrate deploy` a la vez es una carrera evitable.
    },
    // `preserve()` en TODAS, igual que la app: los valores viven en Railway.
    //
    // Lo intente primero con referencias (`app.env.DATABASE_URL`) y NO funciona: el DSL
    // las acepta pero llegan VACIAS al servicio, y el build muere con
    // «PrismaConfigEnvError: Cannot resolve environment variable: MIGRATE_DATABASE_URL»
    // porque prisma.config.ts la exige ya en tiempo de compilacion. Los nombres y de
    // donde sale cada valor estan en docs/ENV.md; este servicio necesita ademas las que
    // no usa (SEED_SUPERADMIN_EMAIL, ENTRA_API_CLIENT_ID) porque `src/config/env.ts`
    // valida el entorno ENTERO al arrancar.
    env: {
      APP_BASE_URL: preserve(),
      APP_DB_PASSWORD: preserve(),
      DATABASE_URL: preserve(),
      ENTRA_API_CLIENT_ID: preserve(),
      ENTRA_CLIENT_SECRET: preserve(),
      ENTRA_MAIL_CLIENT_ID: preserve(),
      ENTRA_REQUIRED_SCOPE: preserve(),
      ENTRA_TENANT_ID: preserve(),
      MIGRATE_DATABASE_URL: preserve(),
      NOTIF_FROM: preserve(),
      // Sin ella npm instala sin devDependencies y `tsx` no existe en el contenedor.
      NPM_CONFIG_INCLUDE: preserve(),
      SEED_SUPERADMIN_EMAIL: preserve(),
      // Sin NOTIF_TRANSPORT: por defecto vale `console`. Ponerla a 'graph' enciende el
      // envio de verdad, y es el unico cambio que hace falta para eso.
    },
  });

  return project('aware-acceptance', {
    resources: [
      Postgres,
      app,
      avisos,
      postgresVolume9o7j,
      postgresVolume2b3M,
      postgresVolume,
    ],
  });
});
